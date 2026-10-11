import { createHash } from 'node:crypto'
import {
  GENESIS_HASH,
  HASH_ALGORITHM,
  type AuditChainEntry,
  type AuditChainMeta,
  type ChainVerificationResult,
  type EntryVerificationResult,
} from '../types/auditChain.types'
import type { AuditEntry } from '../types'

/**
 * Per-facility audit hash chain (P2-16).
 *
 * This module owns the chain math and the in-memory chain head. It never touches
 * the audit store directly — `auditStore` registers itself as the entry source,
 * which keeps the two modules free of a circular import and keeps every
 * verification read-only and deterministic.
 *
 * Chain guarantee: entries of a facility are appended in strictly increasing
 * `sequenceNumber` order, each hashing its fields plus the previous entry's
 * hash. `verifyChain` recomputes every hash and checks linkage + monotonicity,
 * so editing any past entry is detectable from that point onward.
 */

type EntrySource = () => AuditChainEntry[]

let source: EntrySource = () => []

/** auditStore calls this once so verification can read the live trail. */
export function registerChainSource(fn: EntrySource): void {
  source = fn
}

export interface ChainHead {
  lastSequenceNumber: number
  lastHash: string
  entryCount: number
}

const heads = new Map<string, ChainHead>()
const seenIds = new Set<string>()

function head(facilityId: string): ChainHead {
  return heads.get(facilityId) ?? { lastSequenceNumber: 0, lastHash: GENESIS_HASH, entryCount: 0 }
}

interface HashInput {
  facilityId: string
  actor: string
  role: AuditEntry['role']
  action: string
  category: AuditEntry['category']
  detail: string
  sessionId: string
  at: string
  sequenceNumber: number
}

/**
 * Canonical, stable serialisation of the fields that feed the hash. Keys are
 * sorted, numbers are integers and every value is a concrete string/number, so
 * the output never depends on property insertion order or `undefined` handling.
 */
export function canonicalSerialise(entry: HashInput, previousHash: string): string {
  const fields: Record<string, string | number> = {
    action: entry.action,
    actor: entry.actor,
    at: entry.at,
    category: entry.category,
    detail: entry.detail,
    facilityId: entry.facilityId,
    previousHash,
    role: entry.role,
    sequenceNumber: Math.trunc(entry.sequenceNumber),
    sessionId: entry.sessionId,
  }
  const ordered: Record<string, string | number> = {}
  for (const key of Object.keys(fields).sort()) ordered[key] = fields[key]
  return JSON.stringify(ordered)
}

/** sha256 hex over the canonical serialisation. */
export function computeHash(entry: HashInput, previousHash: string): string {
  return createHash('sha256').update(canonicalSerialise(entry, previousHash), 'utf8').digest('hex')
}

function hashInput(entry: AuditChainEntry): HashInput {
  return {
    facilityId: entry.facilityId,
    actor: entry.actor,
    role: entry.role,
    action: entry.action,
    category: entry.category,
    detail: entry.detail,
    sessionId: entry.sessionId,
    at: entry.at,
    sequenceNumber: entry.sequenceNumber,
  }
}

/** sha256 that binds a pruned tombstone's shape to its original hash. */
function computePrunedHash(entry: AuditChainEntry): string {
  const shape = canonicalSerialise(hashInput(entry), entry.previousHash)
  return createHash('sha256').update(`${shape}:${entry.hash}`, 'utf8').digest('hex')
}

/**
 * Appends one entry to its facility chain and returns the chained entry.
 * Idempotent: replaying the same audit entry id returns the stored entry.
 * Synchronous by design so existing `addAudit` callers are unchanged — the JS
 * event loop serialises calls, which is the per-facility advisory lock.
 */
export function appendToChain(base: AuditEntry): AuditChainEntry {
  if (seenIds.has(base.id)) {
    const existing = source().find((row) => row.id === base.id)
    if (existing) return existing
  }

  const current = head(base.facilityId)
  const sequenceNumber = current.lastSequenceNumber + 1
  const previousHash = current.lastHash
  const hash = computeHash(
    { ...hashInputForBase(base), sequenceNumber },
    previousHash,
  )

  const entry: AuditChainEntry = {
    ...base,
    sequenceNumber,
    previousHash,
    hash,
    hashAlgorithm: HASH_ALGORITHM,
    chainId: base.facilityId,
    pruned: false,
  }

  heads.set(base.facilityId, {
    lastSequenceNumber: sequenceNumber,
    lastHash: hash,
    entryCount: current.entryCount + 1,
  })
  seenIds.add(base.id)
  return entry
}

function hashInputForBase(base: AuditEntry): Omit<HashInput, 'sequenceNumber'> {
  return {
    facilityId: base.facilityId,
    actor: base.actor,
    role: base.role,
    action: base.action,
    category: base.category,
    detail: base.detail,
    sessionId: base.sessionId,
    at: base.at,
  }
}

/** Forces a chain head (used by the one-time backfill tool only). */
export function adoptHead(facilityId: string, lastSequenceNumber: number, lastHash: string, entryCount: number): void {
  heads.set(facilityId, { lastSequenceNumber, lastHash, entryCount })
}

/** Registers a known entry id (used while reindexing a hydrated chain). */
export function markSeen(id: string): void {
  seenIds.add(id)
}

export function resetChain(): void {
  heads.clear()
  seenIds.clear()
}

/** Clears one facility's head and forgets its ids (backfill rebuild). */
export function resetFacility(facilityId: string): void {
  heads.delete(facilityId)
  const rows = source()
  for (const row of rows) {
    if (row.facilityId === facilityId) seenIds.delete(row.id)
  }
}

/** Rebuilds heads + idempotency set from the current entry source (boot / tests). */
export function reindexChain(): void {
  heads.clear()
  seenIds.clear()
  const rows = [...source()].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  for (const row of rows) {
    seenIds.add(row.id)
    const current = heads.get(row.facilityId)
    heads.set(row.facilityId, {
      lastSequenceNumber: row.sequenceNumber,
      lastHash: row.hash,
      entryCount: (current?.entryCount ?? 0) + 1,
    })
  }
}

export function entriesForFacility(facilityId: string): AuditChainEntry[] {
  return source()
    .filter((row) => row.facilityId === facilityId)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
}

export function getChainMeta(facilityId: string): AuditChainMeta | null {
  const rows = entriesForFacility(facilityId)
  if (rows.length === 0 && !heads.has(facilityId)) return null
  const tip = rows.length > 0 ? rows[rows.length - 1] : undefined
  const current = head(facilityId)
  return {
    chainId: facilityId,
    facilityId,
    lastSequenceNumber: tip?.sequenceNumber ?? current.lastSequenceNumber,
    lastHash: tip?.hash ?? current.lastHash,
    entryCount: rows.length > 0 ? rows.length : current.entryCount,
    updatedAt: tip?.at ?? new Date().toISOString(),
  }
}

function recompute(row: AuditChainEntry): string {
  return computeHash(hashInput(row), row.previousHash)
}

function verifyRow(row: AuditChainEntry): { ok: boolean; reason?: string } {
  if (row.hashAlgorithm !== HASH_ALGORITHM) {
    return { ok: false, reason: `unsupported hash algorithm "${row.hashAlgorithm}"` }
  }
  if (row.pruned) {
    if (!row.prunedHash) return { ok: false, reason: 'pruned entry missing prunedHash' }
    if (computePrunedHash(row) !== row.prunedHash) return { ok: false, reason: 'pruned tombstone hash mismatch' }
    return { ok: true }
  }
  if (recompute(row) !== row.hash) return { ok: false, reason: 'entry hash mismatch' }
  return { ok: true }
}

function firstIndexAtLeast(rows: AuditChainEntry[], sequence: number): number {
  const index = rows.findIndex((row) => row.sequenceNumber >= sequence)
  return index === -1 ? rows.length : index
}

function firstIndexGreater(rows: AuditChainEntry[], sequence: number): number {
  const index = rows.findIndex((row) => row.sequenceNumber > sequence)
  return index === -1 ? rows.length : index
}

/**
 * Recomputes the whole chain (or a sequence range) for one facility. Never
 * throws on a broken chain — it reports `valid: false` with the first invalid
 * sequence, so callers surface tampering without a 500.
 */
export function verifyChain(facilityId: string, fromSequence?: number, toSequence?: number): ChainVerificationResult {
  const verifiedAt = new Date().toISOString()
  const rows = entriesForFacility(facilityId)
  if (rows.length === 0) {
    return { valid: true, checkedEntries: 0, verifiedAt, facilityId }
  }

  const start = fromSequence === undefined ? 0 : firstIndexAtLeast(rows, fromSequence)
  const end = toSequence === undefined ? rows.length : firstIndexGreater(rows, toSequence)
  if (start >= end) {
    return { valid: true, checkedEntries: 0, verifiedAt, facilityId }
  }

  let expectedPrev = start > 0 ? rows[start - 1].hash : GENESIS_HASH
  let expectedSeq = rows[start].sequenceNumber
  let checked = 0

  for (let i = start; i < end; i += 1) {
    const row = rows[i]
    checked += 1
    if (row.sequenceNumber !== expectedSeq) {
      return { valid: false, checkedEntries: checked, firstInvalidSequence: row.sequenceNumber, reason: 'sequence gap', verifiedAt, facilityId }
    }
    if (row.previousHash !== expectedPrev) {
      return { valid: false, checkedEntries: checked, firstInvalidSequence: row.sequenceNumber, reason: 'previous hash mismatch', verifiedAt, facilityId }
    }
    const result = verifyRow(row)
    if (!result.ok) {
      return { valid: false, checkedEntries: checked, firstInvalidSequence: row.sequenceNumber, reason: result.reason ?? 'entry hash mismatch', verifiedAt, facilityId }
    }
    expectedPrev = row.hash
    expectedSeq += 1
  }

  return { valid: true, checkedEntries: checked, verifiedAt, facilityId }
}

export function verifyEntry(facilityId: string, sequenceNumber: number): EntryVerificationResult {
  const verifiedAt = new Date().toISOString()
  const rows = entriesForFacility(facilityId)
  const row = rows.find((entry) => entry.sequenceNumber === sequenceNumber)
  if (!row) {
    return { valid: false, sequenceNumber, reason: 'entry not found', verifiedAt, facilityId }
  }
  const previous = rows.find((entry) => entry.sequenceNumber === sequenceNumber - 1)
  const expectedPrevious = previous ? previous.hash : GENESIS_HASH
  if (row.previousHash !== expectedPrevious) {
    return { valid: false, sequenceNumber, reason: 'previous hash mismatch', verifiedAt, facilityId }
  }
  const result = verifyRow(row)
  return result.ok
    ? { valid: true, sequenceNumber, verifiedAt, facilityId }
    : { valid: false, sequenceNumber, reason: result.reason, verifiedAt, facilityId }
}

function prunedShape(entry: AuditChainEntry, retentionRule: string, actor: string, at: string): AuditChainEntry {
  return {
    ...entry,
    actor: '[pruned]',
    detail: '[pruned]',
    sessionId: '[pruned]',
    offlineOrigin: undefined,
    queuedAt: undefined,
    syncedAt: undefined,
    pruned: true,
    prunedAt: at,
    prunedBy: actor,
    retentionRule,
  }
}

/**
 * Produces the tombstone for an entry: keeps id / sequence / hashes so the chain
 * still links, drops the identifying fields, and stores a `prunedHash` that
 * verifies the tombstone against the original hash.
 */
export function pruneEntry(entry: AuditChainEntry, retentionRule: string, actor: string): AuditChainEntry {
  const pruned = prunedShape(entry, retentionRule, actor, new Date().toISOString())
  return { ...pruned, prunedHash: computePrunedHash(pruned) }
}
