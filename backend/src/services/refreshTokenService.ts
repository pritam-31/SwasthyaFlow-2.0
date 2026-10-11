import { createHash, randomBytes } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteRefreshTokensForUser,
  upsertRefreshToken,
} from '../repositories/securityRepository'
import { record } from './securityEventService'
import type { RefreshTokenRecord } from '../types/security.types'

/**
 * Opaque refresh-token service (P1-12).
 *
 * Refresh tokens are random 256-bit values; only a sha256 hash is stored, in
 * memory and in Mongo. Rotation is mandatory: every refresh consumes the
 * presented token and issues a new one in the same family. Presenting a token
 * that was already used means the token leaked — the whole family is revoked
 * immediately and an `auth.token-refresh-reuse-detected` event is recorded.
 */

const tokens = new Map<string, RefreshTokenRecord>()

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function persist(recordValue: RefreshTokenRecord): void {
  if (!persistenceEnabled()) return
  enqueue('refresh:' + recordValue.id, () =>
    upsertRefreshToken({
      tokenId: recordValue.id,
      userId: recordValue.userId,
      sessionId: recordValue.sessionId,
      tokenHash: recordValue.tokenHash,
      familyId: recordValue.familyId,
      issuedAt: recordValue.issuedAt,
      expiresAt: recordValue.expiresAt,
      usedAt: recordValue.usedAt,
      revokedAt: recordValue.revokedAt,
      reason: recordValue.reason,
    }),
  )
}

export interface IssuedRefreshToken {
  /** Raw value for the client cookie — never persisted anywhere. */
  token: string
  record: RefreshTokenRecord
}

export interface IssueInput {
  userId: string
  sessionId: string
  ttlDays: number
  familyId?: string
}

/** Issues a brand new refresh token (login) or a successor (rotation). */
export function issue(input: IssueInput): IssuedRefreshToken {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const recordValue: RefreshTokenRecord = {
    id: `rt-${randomBytes(8).toString('hex')}`,
    userId: input.userId,
    sessionId: input.sessionId,
    tokenHash: hashToken(token),
    familyId: input.familyId ?? `fam-${randomBytes(8).toString('hex')}`,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlDays * 86_400_000).toISOString(),
  }
  tokens.set(recordValue.tokenHash, recordValue)
  persist(recordValue)
  return { token, record: recordValue }
}

/** Looks up a presented raw token. Returns undefined when unknown/expired. */
export function peek(raw: string): RefreshTokenRecord | undefined {
  const recordValue = tokens.get(hashToken(raw))
  if (!recordValue || recordValue.revokedAt) return undefined
  if (Date.parse(recordValue.expiresAt) <= Date.now()) {
    tokens.delete(recordValue.tokenHash)
    return undefined
  }
  return recordValue
}

export class RefreshTokenError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly kind: 'invalid' | 'reuse' | 'expired',
  ) {
    super(message)
  }
}

export interface RotationResult {
  token: string
  record: RefreshTokenRecord
  sessionId: string
  userId: string
}

/**
 * Consumes `raw` and issues its successor. A second use of the same token is
 * treated as a leak: the whole family is revoked, a reuse event is recorded and
 * the caller must reject the request. `sessionIdOverride` re-binds the successor
 * to a new access session (used when the previous access session expired).
 */
export async function rotate(raw: string, ttlDays: number, sessionIdOverride?: string): Promise<RotationResult> {
  const current = tokens.get(hashToken(raw))
  if (!current) throw new RefreshTokenError(401, 'Refresh token is invalid.', 'invalid')
  if (current.revokedAt) throw new RefreshTokenError(401, 'Refresh token is invalid.', 'invalid')
  if (Date.parse(current.expiresAt) <= Date.now()) {
    tokens.delete(current.tokenHash)
    throw new RefreshTokenError(401, 'Refresh token has expired.', 'expired')
  }
  if (current.usedAt) {
    const revokedCount = await revokeFamily(current.familyId, 'refresh-token-reuse')
    await record({
      type: 'auth.token-refresh-reuse-detected',
      actorId: current.userId,
      facilityId: undefined,
      detail: `Refresh token reuse detected — revoked ${revokedCount} token(s) in the family.`,
    })
    throw new RefreshTokenError(401, 'Refresh token is invalid.', 'reuse')
  }

  current.usedAt = new Date().toISOString()
  persist(current)

  const next = issue({ userId: current.userId, sessionId: sessionIdOverride ?? current.sessionId, ttlDays, familyId: current.familyId })
  return { token: next.token, record: next.record, sessionId: next.record.sessionId, userId: current.userId }
}

/** Revokes every token in a family. Returns how many were revoked. */
export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  let count = 0
  for (const recordValue of tokens.values()) {
    if (recordValue.familyId === familyId && !recordValue.revokedAt) {
      recordValue.revokedAt = new Date().toISOString()
      recordValue.reason = reason
      persist(recordValue)
      count += 1
    }
  }
  return count
}

/** Revokes every token issued for a login session (logout / revoke session). */
export async function revokeBySession(sessionId: string, reason: string): Promise<number> {
  let count = 0
  for (const recordValue of tokens.values()) {
    if (recordValue.sessionId === sessionId && !recordValue.revokedAt) {
      recordValue.revokedAt = new Date().toISOString()
      recordValue.reason = reason
      persist(recordValue)
      count += 1
    }
  }
  return count
}

/** Revokes every token belonging to a user (logout-all / account change). */
export async function revokeByUser(userId: string, reason: string): Promise<number> {
  let count = 0
  for (const recordValue of tokens.values()) {
    if (recordValue.userId === userId && !recordValue.revokedAt) {
      recordValue.revokedAt = new Date().toISOString()
      recordValue.reason = reason
      persist(recordValue)
      count += 1
    }
  }
  if (persistenceEnabled()) enqueue('refresh-user:' + userId, () => deleteRefreshTokensForUser(userId))
  return count
}

/** Active (unrevoked, unexpired) tokens for a session. */
export function activeTokensForSession(sessionId: string): RefreshTokenRecord[] {
  const now = Date.now()
  return [...tokens.values()].filter(
    (recordValue) => recordValue.sessionId === sessionId && !recordValue.revokedAt && Date.parse(recordValue.expiresAt) > now,
  )
}

export interface HydratableRefreshToken {
  tokenId: string
  userId: string
  sessionId: string
  tokenHash: string
  familyId: string
  issuedAt: string
  expiresAt: string
  usedAt?: string | null
  revokedAt?: string | null
  reason?: string | null
}

/** Loads persisted refresh tokens on boot (persistent mode only). */
export async function hydrateRefreshTokens(rows: HydratableRefreshToken[]): Promise<void> {
  tokens.clear()
  for (const row of rows) {
    if (row.revokedAt || Date.parse(row.expiresAt) <= Date.now()) continue
    tokens.set(row.tokenHash, {
      id: row.tokenId,
      userId: row.userId,
      sessionId: row.sessionId,
      tokenHash: row.tokenHash,
      familyId: row.familyId,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? undefined,
      revokedAt: row.revokedAt ?? undefined,
      reason: row.reason ?? undefined,
    })
  }
}

/** Test-only reset. */
export function clearRefreshTokensMemory(): void {
  tokens.clear()
}