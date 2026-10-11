import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteIpBlocklistEntry,
  listIpBlocklist,
  upsertIpBlocklistEntry,
} from '../repositories/securityRepository'
import { record } from './securityEventService'
import type { IpBlocklistEntry } from '../types/security.types'

/**
 * IP blocklist service (P1-12).
 *
 * Blocks are keyed by exact IP. The raw IP is stored here deliberately — it is
 * the value being blocked and is needed to enforce the rule. An optional
 * duration makes the ban temporary (Mongo TTL + in-memory expiry agree).
 */

const entries = new Map<string, IpBlocklistEntry>()

function isActive(entry: IpBlocklistEntry): boolean {
  return !entry.expiresAt || Date.parse(entry.expiresAt) > Date.now()
}

function persist(entry: IpBlocklistEntry): void {
  if (!persistenceEnabled()) return
  enqueue('ipblock:' + entry.entryId, () =>
    upsertIpBlocklistEntry({
      entryId: entry.entryId,
      ip: entry.ip,
      reason: entry.reason,
      blockedAt: entry.blockedAt,
      expiresAt: entry.expiresAt,
      blockedBy: entry.blockedBy,
    }),
  )
}

/** True when the address is currently blocked. */
export function isBlocked(ip: string): boolean {
  for (const entry of entries.values()) {
    if (entry.ip === ip && isActive(entry)) return true
  }
  return false
}

export interface BlockInput {
  ip: string
  reason: string
  blockedBy: string
  durationMinutes?: number
  actorId?: string
  facilityId?: string
  requestId?: string
}

export async function block(input: BlockInput): Promise<IpBlocklistEntry> {
  const existing = [...entries.values()].find((entry) => entry.ip === input.ip && isActive(entry))
  if (existing) return existing

  const now = new Date()
  const entry: IpBlocklistEntry = {
    entryId: `ipb-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    ip: input.ip,
    reason: input.reason,
    blockedAt: now.toISOString(),
    expiresAt: input.durationMinutes ? new Date(now.getTime() + input.durationMinutes * 60_000).toISOString() : undefined,
    blockedBy: input.blockedBy,
  }
  entries.set(entry.entryId, entry)
  persist(entry)
  await record({
    type: 'security.ip-blocked',
    actorId: input.actorId,
    facilityId: input.facilityId,
    ip: input.ip,
    requestId: input.requestId,
    detail: `IP blocked: ${input.reason}.${input.durationMinutes ? ` Expires in ${input.durationMinutes} minute(s).` : ' Permanent until lifted.'}`,
  })
  return entry
}

export async function unblock(entryId: string, actorId?: string, requestId?: string): Promise<IpBlocklistEntry | undefined> {
  const entry = entries.get(entryId)
  if (!entry) return undefined
  entries.delete(entryId)
  if (persistenceEnabled()) enqueue('ipblock:' + entryId, () => deleteIpBlocklistEntry(entryId))
  await record({
    type: 'security.ip-unblocked',
    actorId,
    ip: entry.ip,
    requestId,
    detail: `IP unblocked: ${entry.reason}.`,
  })
  return entry
}

/** Active blocklist entries. */
export function listActive(): IpBlocklistEntry[] {
  return [...entries.values()].filter(isActive).sort((a, b) => b.blockedAt.localeCompare(a.blockedAt))
}

/** Loads persisted blocks on boot (persistent mode only). */
export async function hydrateIpBlocklist(): Promise<void> {
  if (!persistenceEnabled()) return
  const rows = await listIpBlocklist()
  entries.clear()
  for (const row of rows) {
    const entry: IpBlocklistEntry = {
      entryId: row.entryId,
      ip: row.ip,
      reason: row.reason,
      blockedAt: row.blockedAt,
      expiresAt: row.expiresAt ?? undefined,
      blockedBy: row.blockedBy,
    }
    if (isActive(entry)) entries.set(entry.entryId, entry)
  }
}

/** Test-only reset. */
export function clearIpBlocklistMemory(): void {
  entries.clear()
}