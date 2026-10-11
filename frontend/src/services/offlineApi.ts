/**
 * Offline-aware API helpers (P1-8).
 *
 * Two capabilities, both used by the rest of the app:
 *  1. `cachedRead` — a read that transparently falls back to the IndexedDB
 *     cache when the backend is unreachable (offline read cache).
 *  2. `attemptOnline` — a write that runs online, or queues itself when the
 *     network is down, so no user action is ever lost.
 *
 * Raw PII and file bytes never pass through here: callers hand in already
 * anonymised payloads, and binary uploads stay online-only.
 */

import { cacheGet, cacheSet } from './offlineDb'
import { isNetworkError, isOffline } from './syncService'

/** Raised when a read is required but neither the backend nor the cache has it. */
export class OfflineUnavailableError extends Error {
  readonly offline = true

  constructor(message = 'This information is not available offline yet.') {
    super(message)
  }
}

/**
 * Run an online read, caching the result. On a transport failure, return the
 * last cached value; if there is none, raise `OfflineUnavailableError`.
 */
export async function cachedRead<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  if (isOffline()) {
    const cached = await cacheGet<T>(cacheKey)
    if (cached) return cached.value
    throw new OfflineUnavailableError()
  }
  try {
    const value = await fetcher()
    await cacheSet(cacheKey, value)
    return value
  } catch (e) {
    if (isNetworkError(e)) {
      const cached = await cacheGet<T>(cacheKey)
      if (cached) return cached.value
      throw new OfflineUnavailableError()
    }
    throw e
  }
}

export type WriteOutcome<T> = { kind: 'done'; value: T } | { kind: 'queued'; queueId: string }

/**
 * Destructive/consent writes must never be queued — a patient's withdrawal or an
 * erasure has to happen against a live backend. Call this at the top of any such
 * write so the caller can surface a clear message instead of silently queueing.
 */
export function requireOnline(message?: string): void {
  if (isOffline()) {
    throw new OfflineUnavailableError(
      message ?? 'This action needs a connection and cannot be done offline. Reconnect and try again.',
    )
  }
}

/**
 * Try `online`; if the network is down (or drops mid-flight), run `enqueue`
 * instead. HTTP errors are re-thrown so validation/RBAC problems still surface.
 */
export async function attemptOnline<T>(
  online: () => Promise<T>,
  enqueue: () => Promise<{ id: string }>,
): Promise<WriteOutcome<T>> {
  if (isOffline()) {
    const item = await enqueue()
    return { kind: 'queued', queueId: item.id }
  }
  try {
    return { kind: 'done', value: await online() }
  } catch (e) {
    if (isNetworkError(e)) {
      const item = await enqueue()
      return { kind: 'queued', queueId: item.id }
    }
    throw e
  }
}

/* ---------------- Read-cache keys (allowlisted GETs only) ---------------- */

export const CACHE_KEYS = {
  sessions: 'cache:sessions',
  audit: 'cache:audit',
  auditChain: (facilityId: string, filterKey: string) => `cache:audit:${facilityId}:${filterKey}`,
  auditChainMeta: (facilityId: string) => `cache:audit:${facilityId}:meta`,
  sessionFollowUps: (id: string) => `cache:session:${id}:followups`,
  sessionTimeline: (id: string) => `cache:session:${id}:timeline`,
  sessionReports: (id: string) => `cache:session:${id}:reports`,
  sessionVisuals: (id: string) => `cache:session:${id}:visuals`,
  sessionFeedback: (id: string) => `cache:session:${id}:feedback`,
} as const
