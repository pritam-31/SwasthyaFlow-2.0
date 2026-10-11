import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped marker for actions that arrived from the offline queue (P1-8).
 *
 * The `X-Offline-Origin` middleware (direct write with the header) and the
 * sync dispatcher both run their work inside this context, so every audit entry
 * written along the way is stamped with the offline origin metadata — without
 * each of the sixteen route handlers having to thread it through by hand.
 */
export interface OfflineOrigin {
  offlineOrigin: true
  queuedAt: string
  syncedAt: string
}

const storage = new AsyncLocalStorage<OfflineOrigin>()

export function getOfflineOrigin(): OfflineOrigin | undefined {
  return storage.getStore()
}

export function runWithOfflineOrigin<T>(origin: OfflineOrigin, fn: () => T): T {
  return storage.run(origin, fn)
}
