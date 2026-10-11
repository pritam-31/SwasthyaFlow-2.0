import { randomUUID } from 'node:crypto'
import type {
  AuditChainEntry,
  AuditChainMeta,
  AuditFilter,
  AuditPagedResult,
  ChainVerificationResult,
  EntryVerificationResult,
} from '../types/auditChain.types'
import type { AuditEntry } from '../types'
import { DEFAULT_FACILITY_ID } from '../types/facility.types'
import { anonymiseText } from './unifiedAnonymizer'
import { getOfflineOrigin } from './offlineOrigin'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  appendAudit,
  deleteAuditBefore,
  deleteAuditById as deletePersistedAuditById,
  listAudit as loadAudit,
  upsertChainMeta,
} from '../repositories/auditRepository'
import {
  adoptHead,
  appendToChain,
  entriesForFacility,
  getChainMeta,
  pruneEntry,
  registerChainSource,
  reindexChain,
  resetChain,
  resetFacility,
  verifyChain,
  verifyEntry,
} from './auditChainService'
import { GENESIS_HASH, HASH_ALGORITHM } from '../types/auditChain.types'

/**
 * In-memory audit trail, capped, now tamper-evident (P2-16).
 *
 * Every entry is chained per facility on append. Reads are unchanged for callers
 * that just want the trail; the filter/search/verify/export surfaces are
 * additive. Detail is anonymised before storage and never raw PII.
 */

const MAX_ENTRIES = 500
const entries: AuditChainEntry[] = []

// The chain service reads the live trail through this registered source.
export function attachAuditChainSource(): void {
  registerChainSource(() => entries)
}

attachAuditChainSource()

/** Adds an optional facility filter; omitted = every facility. */
export function listAudit(sessionId?: string, facilityId?: string): AuditChainEntry[] {
  return entries.filter(
    (e) => (!sessionId || e.sessionId === sessionId) && (!facilityId || e.facilityId === facilityId),
  )
}

export function countAuditForFacility(facilityId: string): number {
  return entries.reduce((total, entry) => (entry.facilityId === facilityId ? total + 1 : total), 0)
}

type AuditInput = Omit<
  AuditEntry,
  'id' | 'at' | 'facilityId'
> & { facilityId?: string }

export function addAudit(input: AuditInput): AuditChainEntry {
  // Detail is anonymised before storage (P0-7): no raw PII ever enters the trail.
  const detail = anonymiseText(input.detail, 'audit-detail').text
  const base: AuditEntry = {
    ...input,
    facilityId: input.facilityId ?? DEFAULT_FACILITY_ID,
    detail,
    id: `aud-${randomUUID()}`,
    at: new Date().toISOString(),
  }
  // Stamp offline-origin metadata when the write arrived from the offline queue.
  const origin = getOfflineOrigin()
  if (origin) {
    base.offlineOrigin = true
    base.queuedAt = base.queuedAt ?? origin.queuedAt
    base.syncedAt = base.syncedAt ?? origin.syncedAt
  }
  const entry = appendToChain(base)
  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  if (persistenceEnabled()) {
    enqueue('audit', () => appendAudit(entry))
    const meta = getChainMetaForFacility(entry.facilityId)
    if (meta) enqueue('audit-meta:' + entry.facilityId, () => upsertChainMeta(meta))
  }
  return entry
}

/** Loads the persisted trail into memory on boot (persistent mode only). */
export async function hydrateAudit(): Promise<void> {
  const rows = await loadAudit()
  entries.length = 0
  entries.push(
    ...rows
      .slice(-MAX_ENTRIES)
      .map((row) => ({
        ...row,
        facilityId: row.facilityId ?? DEFAULT_FACILITY_ID,
        sequenceNumber: row.sequenceNumber ?? 0,
        previousHash: row.previousHash ?? GENESIS_HASH,
        hash: row.hash ?? '',
        hashAlgorithm: row.hashAlgorithm ?? HASH_ALGORITHM,
        chainId: row.chainId ?? row.facilityId ?? DEFAULT_FACILITY_ID,
        pruned: row.pruned ?? false,
      }))
      .reverse(),
  )
  reindexChain()
}

export function clearAudit(): void {
  entries.length = 0
  resetChain()
}

/** Retention sweep (`audit-entries` rule) — drops every entry older than `iso`. */
export function deleteAuditEntriesBefore(iso: string): number {
  const cutoff = Date.parse(iso)
  if (!Number.isFinite(cutoff)) return 0
  const before = entries.length
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (Date.parse(entries[i].at) < cutoff) entries.splice(i, 1)
  }
  if (persistenceEnabled()) enqueue('audit', () => deleteAuditBefore(iso))
  return before - entries.length
}

/** Removes a single entry by id. Prefer `pruneAuditEntry` — hard delete breaks the chain. */
export function deleteAuditEntry(id: string): boolean {
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return false
  entries.splice(index, 1)
  if (persistenceEnabled()) enqueue('audit', () => deletePersistedAuditById(id))
  return true
}

export function countAuditEntries(): number {
  return entries.length
}

/* ------------------------------------------------------------------ */
/*  Filter / search / pagination (P2-16)                               */
/* ------------------------------------------------------------------ */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Bounded free-text pattern over action + detail (no nested quantifiers). */
function searchPredicate(search: string): (row: AuditChainEntry) => boolean {
  const bounded = search.trim().slice(0, 100)
  if (!bounded) return () => true
  const re = new RegExp(escapeRegex(bounded), 'i')
  return (row) => re.test(row.action) || re.test(row.detail)
}

function applyFilter(rows: AuditChainEntry[], filter: AuditFilter): AuditChainEntry[] {
  const since = filter.since ? Date.parse(filter.since) : undefined
  const until = filter.until ? Date.parse(filter.until) : undefined
  const actions = filter.actions && filter.actions.length > 0 ? new Set(filter.actions) : undefined
  const categories = filter.categories && filter.categories.length > 0 ? new Set(filter.categories) : undefined
  const roles = filter.actorRoles && filter.actorRoles.length > 0 ? new Set(filter.actorRoles) : undefined
  const matchesSearch = filter.search ? searchPredicate(filter.search) : () => true

  return rows.filter((row) => {
    if (row.facilityId !== filter.facilityId) return false
    if (since !== undefined && Number.isFinite(since) && Date.parse(row.at) < since) return false
    if (until !== undefined && Number.isFinite(until) && Date.parse(row.at) > until) return false
    if (actions && !actions.has(row.action)) return false
    if (categories && !categories.has(row.category)) return false
    if (roles && !roles.has(row.role)) return false
    if (filter.sessionId && row.sessionId !== filter.sessionId) return false
    if (filter.actor && row.actor !== filter.actor) return false
    if (!matchesSearch(row)) return false
    return true
  })
}

function sortRows(rows: AuditChainEntry[], sort: 'asc' | 'desc'): AuditChainEntry[] {
  return [...rows].sort((a, b) => (sort === 'desc' ? b.sequenceNumber - a.sequenceNumber : a.sequenceNumber - b.sequenceNumber))
}

export function decodeCursor(cursor: string | undefined): number | undefined {
  if (!cursor) return undefined
  try {
    const parsed = Number.parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10)
    return Number.isInteger(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function encodeCursor(sequenceNumber: number): string {
  return Buffer.from(String(sequenceNumber), 'utf8').toString('base64')
}

/** Full filtered list, bounded by `limit` (default 1000, max 1000). */
export function listAuditFiltered(filter: AuditFilter): AuditChainEntry[] {
  const limit = Math.min(Math.max(filter.limit ?? 1000, 1), 1000)
  return sortRows(applyFilter(entries, filter), filter.sort ?? 'asc').slice(0, limit)
}

export function searchAudit(filter: AuditFilter): AuditChainEntry[] {
  const limit = Math.min(Math.max(filter.limit ?? 1000, 1), 1000)
  return sortRows(applyFilter(entries, filter), filter.sort ?? 'asc').slice(0, limit)
}

export function countAudit(filter: AuditFilter): number {
  return applyFilter(entries, filter).length
}

/** Cursor-based pagination over sequenceNumber. */
export function listAuditPaged(filter: AuditFilter): AuditPagedResult {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 1000)
  const sort = filter.sort ?? 'asc'
  const total = applyFilter(entries, filter).length
  const cursor = decodeCursor(filter.cursor)

  let rows = sortRows(applyFilter(entries, filter), sort)
  if (cursor !== undefined) {
    rows = rows.filter((row) => (sort === 'desc' ? row.sequenceNumber < cursor : row.sequenceNumber > cursor))
  }
  const items = rows.slice(0, limit)
  const nextCursor = items.length === limit && rows.length > limit ? encodeCursor(items[items.length - 1].sequenceNumber) : null
  return { items, nextCursor, total }
}

/* ------------------------------------------------------------------ */
/*  Verification + pruning                                             */
/* ------------------------------------------------------------------ */

export function verifyAuditChain(facilityId: string, fromSequence?: number, toSequence?: number): ChainVerificationResult {
  return verifyChain(facilityId, fromSequence, toSequence)
}

export function verifyAuditEntry(facilityId: string, sequenceNumber: number): EntryVerificationResult {
  return verifyEntry(facilityId, sequenceNumber)
}

export function getChainMetaForFacility(facilityId: string): AuditChainMeta | null {
  return getChainMeta(facilityId)
}

/**
 * Creates a genesis chain head + meta for a facility that has no entries yet
 * (boot / seed). Idempotent — returns the existing meta when one is present.
 */
export function ensureChainMetaForFacility(facilityId: string): AuditChainMeta {
  const existing = getChainMeta(facilityId)
  if (existing) return existing
  adoptHead(facilityId, 0, GENESIS_HASH, 0)
  const meta: AuditChainMeta = {
    chainId: facilityId,
    facilityId,
    lastSequenceNumber: 0,
    lastHash: GENESIS_HASH,
    entryCount: 0,
    updatedAt: new Date().toISOString(),
  }
  if (persistenceEnabled()) enqueue('audit-meta:' + facilityId, () => upsertChainMeta(meta))
  return meta
}

/**
 * Replaces an entry with a tombstone: keeps id / sequence / hashes so the chain
 * still links, drops the identifying fields, stores a `prunedHash`.
 */
export function pruneAuditEntry(id: string, retentionRule: string, actor: string): boolean {
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return false
  const original = entries[index]
  if (!original.pruned) {
    const tombstone = pruneEntry(original, retentionRule, actor)
    entries[index] = tombstone
    if (persistenceEnabled()) enqueue('audit', () => appendAudit(tombstone))
  }
  return true
}

/* ------------------------------------------------------------------ */
/*  Boot: metadata + one-time backfill                                 */
/* ------------------------------------------------------------------ */

/**
 * One-time migration: recomputes sequences + hashes for facilities that hold
 * legacy (unchained) entries. Idempotent — facilities whose entries all carry a
 * valid hash are skipped. Returns the facilities that were (re)initialised.
 */
export function backfillAuditChain(): { facilities: string[]; entries: number } {
  const byFacility = new Map<string, AuditChainEntry[]>()
  for (const entry of entries) {
    const bucket = byFacility.get(entry.facilityId)
    if (bucket) bucket.push(entry)
    else byFacility.set(entry.facilityId, [entry])
  }

  const replacements = new Map<string, AuditChainEntry>()
  const initialised: string[] = []

  for (const [facilityId, rows] of byFacility) {
    const needsBackfill = rows.some(
      (row) => !row.hash || !row.sequenceNumber || row.hashAlgorithm !== 'sha256-v1' || row.chainId !== facilityId,
    )
    if (!needsBackfill) continue

    const ordered = [...rows].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)))
    resetFacility(facilityId)
    for (const row of ordered) {
      replacements.set(row.id, appendToChain(toBaseEntry(row)))
    }
    initialised.push(facilityId)
  }

  if (replacements.size === 0) return { facilities: [], entries: 0 }

  for (let i = 0; i < entries.length; i += 1) {
    const replacement = replacements.get(entries[i].id)
    if (replacement) entries[i] = replacement
  }
  reindexChain()

  for (const replacement of replacements.values()) {
    if (persistenceEnabled()) enqueue('audit', () => appendAudit(replacement))
  }
  return { facilities: replacements.size > 0 ? [...new Set(initialised)] : [], entries: replacements.size }
}

/**
 * Rebuilds in-memory chain heads from the loaded trail. Called on boot for
 * persistent mode; a no-op in-memory. Returns facilities that currently hold a
 * chain (so the caller can log/audit initialisation once).
 */
export function ensureChainForFacilities(facilityIds: string[]): { initialised: string[] } {
  reindexChain()
  const initialised = facilityIds.filter((facilityId) => entriesForFacility(facilityId).length > 0)
  return { initialised }
}

function toBaseEntry(row: AuditChainEntry): AuditEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    facilityId: row.facilityId,
    actor: row.actor,
    role: row.role,
    action: row.action,
    detail: row.detail,
    category: row.category,
    at: row.at,
    ...(row.offlineOrigin ? { offlineOrigin: row.offlineOrigin } : {}),
    ...(row.queuedAt ? { queuedAt: row.queuedAt } : {}),
    ...(row.syncedAt ? { syncedAt: row.syncedAt } : {}),
  }
}
