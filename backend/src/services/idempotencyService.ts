import { createHash } from 'node:crypto'
import { IdempotencyKeyModel } from '../db/models/IdempotencyKeyModel'
import { persistenceEnabled } from '../db/mongoose'
import type { IdempotencyRecord } from '../types'

/**
 * Idempotency store (P1-8).
 *
 * `get`/`put` persist through Mongo when persistence is on; otherwise they use
 * an in-process map so the middleware is testable without a database. Only a
 * sha256 hash of the request payload is ever stored — never the payload.
 */

const TTL_MS = 24 * 60 * 60 * 1000

const memory = new Map<string, IdempotencyRecord>()
const inFlight = new Set<string>()

interface DbIdemRow {
  key: string
  payloadHash: string
  responseStatus: number
  responseBody: unknown
  createdAt: Date
  expiresAt: Date
}

/** Stable, key-sorted JSON so the same logical payload always hashes alike. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

export async function get(key: string): Promise<IdempotencyRecord | undefined> {
  if (!persistenceEnabled()) {
    const record = memory.get(key)
    if (!record) return undefined
    if (Date.parse(record.expiresAt) <= Date.now()) {
      memory.delete(key)
      return undefined
    }
    return record
  }
  const row = await IdempotencyKeyModel.findOne({ key }).lean<DbIdemRow>().exec()
  if (!row) return undefined
  if (row.expiresAt.getTime() <= Date.now()) return undefined
  return {
    key: row.key,
    payloadHash: row.payloadHash,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}

export async function put(
  key: string,
  payloadHash: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  const now = Date.now()
  const record: IdempotencyRecord = {
    key,
    payloadHash,
    responseStatus,
    responseBody,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  }
  if (!persistenceEnabled()) {
    memory.set(key, record)
    return
  }
  await IdempotencyKeyModel.replaceOne(
    { key },
    {
      _id: key,
      key,
      payloadHash,
      responseStatus,
      responseBody,
      createdAt: new Date(now),
      expiresAt: new Date(now + TTL_MS),
    },
    { upsert: true },
  )
}

/** Removes one key (`delete` is a reserved word, hence the name). */
export async function deleteKey(key: string): Promise<void> {
  inFlight.delete(key)
  if (!persistenceEnabled()) {
    memory.delete(key)
    return
  }
  await IdempotencyKeyModel.deleteOne({ key }).exec()
}

/** Manual sweep; Mongo's TTL index does this automatically. Returns count removed. */
export async function deleteExpired(): Promise<number> {
  const now = Date.now()
  if (!persistenceEnabled()) {
    let removed = 0
    for (const [key, record] of [...memory.entries()]) {
      if (Date.parse(record.expiresAt) <= now) {
        memory.delete(key)
        removed += 1
      }
    }
    return removed
  }
  const result = await IdempotencyKeyModel.deleteMany({ expiresAt: { $lte: new Date(now) } }).exec()
  return result.deletedCount ?? 0
}

/** Reserves a key while a handler runs; `false` means another request holds it. */
export function markInFlight(key: string): boolean {
  if (inFlight.has(key)) return false
  inFlight.add(key)
  return true
}

export function clearInFlight(key: string): void {
  inFlight.delete(key)
}

export function isInFlight(key: string): boolean {
  return inFlight.has(key)
}

/** Test-only reset of the in-memory store. */
export function clearIdempotencyMemory(): void {
  memory.clear()
  inFlight.clear()
}
