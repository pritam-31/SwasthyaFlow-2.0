import { pseudonymise } from '../config/secrets'
import { record } from './securityEventService'
import type { LockoutPolicy } from '../types/security.types'

/**
 * Failed-login lockout service (P1-12).
 *
 * Lockouts are tracked on two hashed keys — the username and the source IP —
 * so neither value is ever stored. Duration follows the facility policy:
 * `baseLockoutMinutes` for the first lockout, doubling on each subsequent one
 * up to `maxLockoutMinutes` (or flat when `exponential` is off).
 *
 * State is intentionally in-memory: lockouts are minutes long, so they do not
 * need to outlive a restart, and the audit trail keeps a permanent record of
 * every `security.lockout-triggered` event regardless.
 */

interface LockoutEntry {
  failures: number
  lockCount: number
  lockedUntil?: number
}

const lockouts = new Map<string, LockoutEntry>()

function key(parts: string[]): string {
  return parts.map((part) => pseudonymise(part, 'lockout')).join('|')
}

function entryFor(entryKey: string): LockoutEntry {
  const existing = lockouts.get(entryKey)
  if (existing) return existing
  const created: LockoutEntry = { failures: 0, lockCount: 0 }
  lockouts.set(entryKey, created)
  return created
}

export interface LockoutState {
  locked: boolean
  failures: number
  lockedUntil?: string
  retryAfterSeconds?: number
}

/** Reads the current state for a username + IP pair without changing it. */
export function checkLockout(username: string, ip: string): LockoutState {
  const userEntry = lockouts.get(key([username])) ?? { failures: 0, lockCount: 0 }
  const ipEntry = lockouts.get(key([ip])) ?? { failures: 0, lockCount: 0 }
  const lockedUntil = Math.max(userEntry.lockedUntil ?? 0, ipEntry.lockedUntil ?? 0)
  const locked = lockedUntil > Date.now()
  const state: LockoutState = {
    locked,
    failures: Math.max(userEntry.failures, ipEntry.failures),
  }
  if (locked) {
    state.lockedUntil = new Date(lockedUntil).toISOString()
    state.retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000))
  }
  return state
}

function lockDurationMs(entry: LockoutEntry, policy: LockoutPolicy): number {
  const base = policy.baseLockoutMinutes * 60_000
  if (!policy.exponential) return Math.min(base, policy.maxLockoutMinutes * 60_000)
  const multiplier = 2 ** Math.max(0, entry.lockCount)
  const raw = base * multiplier
  return Math.min(raw, policy.maxLockoutMinutes * 60_000)
}

export interface LockoutContext {
  username: string
  ip: string
  facilityId: string
  actorId?: string
  requestId?: string
}

export interface LockoutOutcome {
  locked: boolean
  failures: number
  lockedUntil?: string
  /** True only on the transition into a lockout (for audit + 423 responses). */
  justLocked: boolean
}

/**
 * Records a failed login against the username and IP keys. Locks whichever key
 * crossed `maxFailures`, emits one `security.lockout-triggered` event on the
 * transition, and reports the resulting state.
 */
export async function registerFailure(
  policy: LockoutPolicy,
  context: LockoutContext,
): Promise<LockoutOutcome> {
  const usernameKey = key([context.username])
  const ipKey = key([context.ip])
  const now = Date.now()
  const results: LockoutOutcome[] = []

  for (const entryKey of [usernameKey, ipKey]) {
    const entry = entryFor(entryKey)
    const wasLocked = (entry.lockedUntil ?? 0) > now
    entry.failures += 1

    if (entry.failures >= policy.maxFailures && !wasLocked) {
      entry.lockCount += 1
      entry.lockedUntil = now + lockDurationMs(entry, policy)
      results.push({
        locked: true,
        failures: entry.failures,
        lockedUntil: new Date(entry.lockedUntil).toISOString(),
        justLocked: true,
      })
    } else {
      results.push({ locked: wasLocked, failures: entry.failures, justLocked: false })
    }
  }

  const locked = results.some((result) => result.locked)
  const justLocked = results.some((result) => result.justLocked)
  const worst = results.reduce((best, result) => (result.failures > best.failures ? result : best), results[0])

  if (justLocked) {
    const lockedUntilMs = Math.max(
      lockouts.get(usernameKey)?.lockedUntil ?? 0,
      lockouts.get(ipKey)?.lockedUntil ?? 0,
    )
    const lockedForMinutes = Math.max(1, Math.round((lockedUntilMs - now) / 60_000))
    await record({
      type: 'security.lockout-triggered',
      actorId: context.actorId,
      facilityId: context.facilityId,
      ip: context.ip,
      requestId: context.requestId,
      detail: `Account locked after ${worst.failures} failed sign-in attempts. Retry after ${lockedForMinutes} minute(s).`,
    })
  }

  const outcome: LockoutOutcome = { locked, failures: worst.failures, justLocked }
  if (locked) {
    const until = Math.max(
      lockouts.get(usernameKey)?.lockedUntil ?? 0,
      lockouts.get(ipKey)?.lockedUntil ?? 0,
    )
    outcome.lockedUntil = new Date(until).toISOString()
  }
  return outcome
}

/** Clears both keys after a successful sign-in. */
export async function clearFailures(username: string, ip: string, context?: { facilityId?: string; requestId?: string }): Promise<void> {
  const usernameKey = key([username])
  const ipKey = key([ip])
  const wasLocked = (lockouts.get(usernameKey)?.lockedUntil ?? 0) > Date.now()
  lockouts.delete(usernameKey)
  lockouts.delete(ipKey)
  if (wasLocked) {
    await record({
      type: 'security.lockout-cleared',
      facilityId: context?.facilityId,
      requestId: context?.requestId,
      detail: 'Lockout cleared after a successful sign-in.',
    })
  }
}

/** Time remaining on a lock, in seconds, for a Retry-After hint. */
export function retryAfterSeconds(username: string, ip: string): number | undefined {
  const state = checkLockout(username, ip)
  return state.retryAfterSeconds
}

export interface LockoutView {
  /** Opaque hashed key — safe to display, not reversible to a username/IP. */
  key: string
  failures: number
  locked: boolean
  lockedUntil?: string
  lockCount: number
}

/** Active (locked or accumulating) lockout entries for the admin view. */
export function listLockouts(): LockoutView[] {
  const now = Date.now()
  return [...lockouts.entries()]
    .filter(([, entry]) => entry.failures > 0)
    .map(([entryKey, entry]) => ({
      key: entryKey,
      failures: entry.failures,
      locked: (entry.lockedUntil ?? 0) > now,
      lockedUntil: entry.lockedUntil ? new Date(entry.lockedUntil).toISOString() : undefined,
      lockCount: entry.lockCount,
    }))
    .sort((a, b) => b.failures - a.failures)
}

/** Clears a lockout entry by its hashed key. Returns true when one existed. */
export function clearLockoutByKey(entryKey: string): boolean {
  return lockouts.delete(entryKey)
}

/** Test-only reset. */
export function clearLockoutMemory(): void {
  lockouts.clear()
}