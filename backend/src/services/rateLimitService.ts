import { createHash } from 'node:crypto'
import { RateLimitModel } from '../db/models/RateLimitModel'
import { persistenceEnabled } from '../db/mongoose'
import { getSecret } from '../config/secrets'

/**
 * Fixed-window rate limiting (P1-12).
 *
 * Keys are salted sha256 hashes — a raw IP never reaches the store. Persistence
 * is Mongo-backed so counters survive a restart; the in-memory fallback is a
 * per-process map (documented trade-off: a restart resets dev/test limits, which
 * is exactly what the non-persistent prototype wants). Windows are fixed
 * 60-second buckets (documented in MIGRATION.md).
 */

const SECONDS_PER_WINDOW = 60

interface WindowCounter {
  windowStart: number
  count: number
}

const memory = new Map<string, WindowCounter>()

function keyHash(...parts: string[]): string {
  const salt = getSecret('CSRF_SECRET') ?? getSecret('SESSION_SECRET') ?? 'swasthyaflow-rate-limit-salt'
  const raw = `${parts.join(':')}:${salt}`
  return createHash('sha256').update(raw).digest('hex')
}

function currentWindowStart(now: number): number {
  return Math.floor(now / 1000 / SECONDS_PER_WINDOW) * SECONDS_PER_WINDOW * 1000
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
  current: number
}

/** Time (seconds) until the current fixed window ends, for Retry-After. */
function retryAfterSeconds(windowStart: number): number {
  return Math.max(1, Math.ceil((windowStart + SECONDS_PER_WINDOW * 1000 - Date.now()) / 1000))
}

/** Reads the current counter without consuming budget. */
export async function check(key: string, max: number): Promise<RateLimitResult> {
  const windowStart = currentWindowStart(Date.now())
  if (!persistenceEnabled()) {
    const counter = memory.get(key)
    if (!counter || counter.windowStart !== windowStart) {
      return { allowed: true, current: 0 }
    }
    return { allowed: counter.count < Math.max(1, max), retryAfter: retryAfterSeconds(windowStart), current: counter.count }
  }
  const doc = await RateLimitModel.findOne({ key }).lean().exec()
  if (!doc || doc.windowStart.getTime() !== windowStart) {
    return { allowed: true, current: 0 }
  }
  return { allowed: doc.count < Math.max(1, max), retryAfter: retryAfterSeconds(windowStart), current: doc.count }
}

/** Increments the counter and reports whether the request is still allowed. */
export async function consume(key: string, max: number): Promise<RateLimitResult> {
  const windowStart = currentWindowStart(Date.now())
  const limit = Math.max(1, max)
  if (!persistenceEnabled()) {
    const prev = memory.get(key)
    if (!prev || prev.windowStart !== windowStart) {
      memory.set(key, { windowStart, count: 1 })
      return { allowed: 1 <= limit, current: 1 }
    }
    const count = prev.count + 1
    prev.count = count
    return { allowed: count <= limit, retryAfter: retryAfterSeconds(windowStart), current: count }
  }
  const expiresAt = new Date(windowStart + SECONDS_PER_WINDOW * 2 * 1000)
  const doc = await RateLimitModel.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { _id: key, key, windowStart: new Date(windowStart), expiresAt } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  ).lean().exec()
  const count = doc?.count ?? 1
  if (count === 1) {
    // Fresh window but the doc may carry an old windowStart; reset it.
    await RateLimitModel.updateOne({ key, windowStart: { $ne: new Date(windowStart) } }, { windowStart: new Date(windowStart), expiresAt, count }).lean().exec()
  }
  return { allowed: count <= limit, retryAfter: retryAfterSeconds(windowStart), current: count }
}

/** Builds the hash key for an IP-based limiter. */
export function ipKey(ip: string, namespace: string): string {
  return keyHash(namespace, ip ?? 'unknown')
}

/** Builds the hash key for an actor-based limiter. */
export function actorKey(userId: string, namespace: string): string {
  return keyHash(namespace, userId)
}

/** Test-only reset of the in-memory store. */
export function clearRateLimitMemory(): void {
  memory.clear()
}