/**
 * Offline write-queue domain helpers (P1-8).
 *
 * Pure functions over the queue plus IndexedDB persistence. The React state
 * itself lives in OfflineContext; this module keeps the persistence + selection
 * rules in one testable place (see offlineDb.ts for the storage layer).
 */

import type {
  ConflictInfo,
  QueueActionType,
  QueueMethod,
  QueueStatus,
  QueuedItem,
} from '../types/sync.types'
import { clearQueueStore, deleteQueueItem, loadQueue, saveQueueItem } from './offlineDb'
import type { UserRole } from '../types/triage'

export interface EnqueueInput {
  actionType: QueueActionType
  endpoint: string
  method: QueueMethod
  payload: Record<string, unknown>
  sessionId?: string
  actorId: string
  actorRole: UserRole
  /** The facility the write belongs to (P1-10). */
  facilityId?: string
  dependencies?: string[]
}

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildQueuedItem(input: EnqueueInput): QueuedItem {
  return {
    id: newId(),
    actionType: input.actionType,
    endpoint: input.endpoint,
    method: input.method,
    payload: input.payload,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    actorId: input.actorId,
    actorRole: input.actorRole,
    ...(input.facilityId ? { facilityId: input.facilityId } : {}),
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    status: 'pending',
    idempotencyKey: newId(),
    dependencies: input.dependencies ?? [],
    conflictInfo: null,
  }
}

export async function persistQueueItem(item: QueuedItem): Promise<void> {
  await saveQueueItem(item)
}

export async function loadPersistedQueue(): Promise<QueuedItem[]> {
  return loadQueue()
}

export async function persistDelete(id: string): Promise<void> {
  await deleteQueueItem(id)
}

export async function persistClear(): Promise<void> {
  await clearQueueStore()
}

export async function clearPersistedQueue(): Promise<void> {
  await clearQueueStore()
}

/** Items that a human still has to act on (everything not finished/abandoned). */
export function isOpenStatus(status: QueueStatus): boolean {
  return status === 'pending' || status === 'in-flight' || status === 'failed' || status === 'conflict'
}

export function countPending(queue: QueuedItem[]): number {
  return queue.filter((i) => i.status === 'pending' || i.status === 'in-flight').length
}

export function countFailed(queue: QueuedItem[]): number {
  return queue.filter((i) => i.status === 'failed').length
}

export function conflictsOf(queue: QueuedItem[]): QueuedItem[] {
  return queue.filter((i) => i.status === 'conflict')
}

/** The facility a queue is bound to (P1-10) — the firmware of the oldest item. */
export function queueFacilityId(queue: QueuedItem[]): string | undefined {
  return queue.find((i) => i.facilityId)?.facilityId
}

/** Items belonging to a facility. Untagged (legacy) items match the default. */
export function itemsForFacility(queue: QueuedItem[], facilityId: string): QueuedItem[] {
  return queue.filter((i) => (i.facilityId ?? facilityId) === facilityId)
}

/**
 * An item may run when every dependency has synced (or been removed/abandoned).
 * Ids that never existed in the queue are treated as satisfied so a stale
 * reference can never dead-lock the drain loop.
 */
export function isRunnable(
  item: QueuedItem,
  byId: Map<string, QueuedItem>,

): boolean {
  return item.dependencies.every((dep) => {
    const depItem = byId.get(dep)
    if (!depItem) return true
    return depItem.status === 'synced' || depItem.status === 'abandoned'
  })
}

/** The batch the next sync pass should send (ordered, runnable, size-capped). */
export function nextBatch(queue: QueuedItem[], limit = 50): QueuedItem[] {
  const byId = new Map(queue.map((i) => [i.id, i]))
  return queue
    .filter((i) => (i.status === 'pending' || i.status === 'failed') && isRunnable(i, byId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit)
}

export function applyStatus(item: QueuedItem, status: QueueStatus, lastError: string | null = null): QueuedItem {
  return {
    ...item,
    status,
    lastError,
    attemptCount: item.attemptCount + 1,
    lastAttemptAt: new Date().toISOString(),
  }
}

export function applyConflict(item: QueuedItem, conflict: ConflictInfo): QueuedItem {
  return {
    ...item,
    status: 'conflict',
    lastError: 'Conflict — a human must choose which version to keep.',
    conflictInfo: conflict,
    attemptCount: item.attemptCount + 1,
    lastAttemptAt: new Date().toISOString(),
  }
}
