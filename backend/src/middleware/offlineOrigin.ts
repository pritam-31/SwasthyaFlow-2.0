import type { RequestHandler } from 'express'
import { runWithOfflineOrigin } from '../services/offlineOrigin'

/**
 * When a write carries `X-Offline-Origin: true`, run its whole downstream chain
 * inside the offline-origin context so every audit entry it writes is stamped
 * with the queue/sync timestamps (P1-8).
 */
export const offlineOrigin: RequestHandler = (req, _res, next) => {
  if (req.header('x-offline-origin') !== 'true') {
    next()
    return
  }
  const queuedAt = req.header('x-queued-at') ?? new Date().toISOString()
  const syncedAt = req.header('x-synced-at') ?? new Date().toISOString()
  runWithOfflineOrigin({ offlineOrigin: true, queuedAt, syncedAt }, () => next())
}
