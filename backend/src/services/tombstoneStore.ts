import { randomUUID } from 'node:crypto'
import type { RetentionCategory, Tombstone, TombstoneScope, UserRole } from '../types'
import { POLICY_VERSION } from './retentionConfig'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteTombstoneById,
  deleteTombstonesBefore as deletePersistedTombstonesBefore,
  listTombstones as loadTombstones,
  persistTombstone,
} from '../repositories/tombstoneRepository'

/**
 * Deletion tombstones (P0-6, `tombstones` rule).
 *
 * A tombstone is proof that specific data was destroyed: identifiers, who did
 * it, when and why — never the payload itself, so it can safely outlive the
 * record it describes.
 */

const MAX_TOMBSTONES = 500
const tombstones: Tombstone[] = []

export interface AddTombstoneInput {
  scope: TombstoneScope
  sessionId?: string
  patientId?: string
  category?: RetentionCategory
  targetId?: string
  reason: string
  deletedBy: string
  deletedByRole: UserRole
}

function dedupeKey(input: AddTombstoneInput): string {
  return `${input.scope}::${input.sessionId ?? ''}::${input.targetId ?? ''}::${input.category ?? ''}`
}

/**
 * Records a deletion. Repeated deletions of the same subject collapse onto the
 * first tombstone so a purge pass never floods the trail with duplicates.
 */
export function addTombstone(input: AddTombstoneInput): Tombstone {
  const key = dedupeKey(input)
  const existing = tombstones.find((entry) => dedupeKey(entry) === key)
  if (existing) return existing

  const tombstone: Tombstone = {
    id: `tmb-${randomUUID()}`,
    scope: input.scope,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.patientId ? { patientId: input.patientId } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    reason: input.reason,
    deletedAt: new Date().toISOString(),
    deletedBy: input.deletedBy,
    deletedByRole: input.deletedByRole,
    policyVersion: POLICY_VERSION,
  }
  tombstones.unshift(tombstone)
  if (tombstones.length > MAX_TOMBSTONES) tombstones.length = MAX_TOMBSTONES
  if (persistenceEnabled()) enqueue('tombstone', () => persistTombstone(tombstone))
  return tombstone
}

/** Loads the persisted tombstone trail into memory on boot (persistent mode). */
export async function hydrateTombstones(): Promise<void> {
  const rows = await loadTombstones()
  tombstones.length = 0
  tombstones.push(...rows.slice(0, MAX_TOMBSTONES))
}

/** Newest first, optionally narrowed to one session. */
export function listTombstones(filter?: { sessionId?: string }): Tombstone[] {
  if (filter?.sessionId) return tombstones.filter((entry) => entry.sessionId === filter.sessionId)
  return [...tombstones]
}

export function countTombstones(): number {
  return tombstones.length
}

export function deleteTombstonesBefore(iso: string): number {
  const cutoff = Date.parse(iso)
  if (!Number.isFinite(cutoff)) return 0
  const before = tombstones.length
  for (let i = tombstones.length - 1; i >= 0; i -= 1) {
    if (Date.parse(tombstones[i].deletedAt) < cutoff) tombstones.splice(i, 1)
  }
  if (persistenceEnabled()) enqueue('tombstone', () => deletePersistedTombstonesBefore(iso))
  return before - tombstones.length
}

/** Removes a single tombstone by id — the per-target retention handler. */
export function deleteTombstone(id: string): boolean {
  const index = tombstones.findIndex((entry) => entry.id === id)
  if (index === -1) return false
  tombstones.splice(index, 1)
  if (persistenceEnabled()) enqueue('tombstone', () => deleteTombstoneById(id))
  return true
}

/** Test teardown / graceful reset. */
export function clearTombstones(): void {
  tombstones.length = 0
}
