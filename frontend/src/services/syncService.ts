/**
 * Offline sync client (P1-8).
 *
 * Talks to the backend batch endpoint (`POST /api/sync/batch`) and the version
 * probe (`GET /api/sync/version`). The backend owns idempotency, RBAC re-checks,
 * dependency ordering and conflict detection — this module only moves the queue
 * across the wire and surfaces the per-item outcomes.
 */

import { ApiError, request } from './api'
import type { BatchResult, QueuedItem } from '../types/sync.types'

/** True for a transport failure (server unreachable) rather than an HTTP reply. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0
}

export function isOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}

/** Send one batch of queued items. The backend caps a batch at 100 items. */
export async function pushBatch(items: QueuedItem[]): Promise<BatchResult> {
  return request<BatchResult>('/sync/batch', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export interface ServerVersion {
  serverVersion: string
  lastChangeAt: string | null
}

export async function fetchServerVersion(): Promise<ServerVersion> {
  return request<ServerVersion>('/sync/version')
}
