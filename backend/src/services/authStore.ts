import { randomBytes, scryptSync } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteLoginSession as deletePersistedLoginSession,
  deleteLoginSessionsForUser,
  deleteUser as deletePersistedUser,
  listLoginSessions as loadLoginSessions,
  listUsers as loadUsers,
  upsertLoginSession,
  upsertUser,
} from '../repositories/userRepository'
import { hashPassword, verifyPassword } from './passwordHasher'
import type { UserRole } from '../types'
import { DEFAULT_FACILITY_ID } from '../types/facility.types'

/**
 * In-memory user directory + server-side login sessions (P1-12).
 *
 * Passwords are Argon2id (encoded hashes); legacy scrypt hashes still verify and
 * are upgraded transparently on the next successful login — the plaintext never
 * touches the store. Login sessions are opaque random tokens kept in memory with
 * light metadata (IP, user agent, device fingerprint) used for the session and
 * device views; a restart invalidates every session (prototype trade-off).
 */

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  createdAt: string
  /** Home facility (P1-10). */
  facilityId: string
  /** Facility currently in scope for a system-admin (from the login session). */
  activeFacilityId?: string
  /** True once the account has enrolled an authenticator (P1-12). */
  twoFactorEnabled?: boolean
}

interface StoredUser extends AuthUser {
  passwordHash: string
  salt: string
  passwordAlgorithm: string
  passwordChangedAt?: string
  lastLoginAt?: string
  lastLoginIp?: string
  failedLoginCount: number
  lockedUntil?: string
  twoFactorSecret?: string
  roleChangedAt?: string
  facilityChangedAt?: string
  /** Set when an admin deactivates the account (P0-6 `user-accounts` rule). */
  deactivatedAt?: string
}

interface LoginSession {
  id: string
  token: string
  userId: string
  expiresAt: number
  createdAt: number
  activeFacilityId?: string
  ip?: string
  userAgent?: string
  deviceFingerprintHash?: string
  lastSeenAt?: number
}

export interface SessionSummary {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
  lastSeenAt?: string
  ip?: string
  userAgent?: string
  deviceFingerprintHash?: string
  activeFacilityId?: string
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // fallback when the caller gives no policy TTL

const users = new Map<string, StoredUser>()

function persistUser(user: StoredUser): void {
  if (!persistenceEnabled()) return
  enqueue('user:' + user.id, () =>
    upsertUser({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      facilityId: user.facilityId,
      createdAt: user.createdAt,
      passwordHash: user.passwordHash,
      salt: user.salt,
      deactivatedAt: user.deactivatedAt,
      passwordAlgorithm: user.passwordAlgorithm,
      passwordChangedAt: user.passwordChangedAt,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorSecret: user.twoFactorSecret,
      roleChangedAt: user.roleChangedAt,
      facilityChangedAt: user.facilityChangedAt,
    }),
  )
}

const sessions = new Map<string, LoginSession>()

export const ROLES: UserRole[] = ['patient', 'nurse', 'doctor', 'admin', 'system-admin', 'facility-admin']

/** Roles that manage users/facilities across every facility. */
export function isSystemAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'system-admin'
}

/** Roles that administer a single facility. */
export function isFacilityAdmin(role: UserRole): boolean {
  return role === 'facility-admin'
}

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/

function scryptHashSync(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function toAuthUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    facilityId: user.facilityId,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
  }
}

/** Upgrades a freshly-created scrypt hash to Argon2id without blocking the caller. */
async function scheduleArgon2Upgrade(userId: string, password: string, expectedScryptHash: string): Promise<void> {
  try {
    const upgraded = await hashPassword(password)
    const current = users.get(userId)
    if (!current || current.passwordHash !== expectedScryptHash) return
    current.passwordHash = upgraded.hash
    current.passwordAlgorithm = upgraded.algorithm
    current.salt = ''
    persistUser(current)
  } catch {
    // Keep the valid scrypt hash; the next login will retry the upgrade.
  }
}

export function isUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}

export function isStrongPassword(value: string): boolean {
  // 8+ characters, at least one letter and one digit — keeps demo creds sane.
  return value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value)
}

export function createUser(input: {
  username: string
  displayName: string
  password: string
  role: UserRole
  facilityId?: string
}): AuthUser {
  const username = input.username.trim().toLowerCase()
  if (!isUsername(username)) {
    throw new AuthError(400, 'username must be 3-32 chars: a-z, 0-9, dot, underscore, dash.')
  }
  if (!isStrongPassword(input.password)) {
    throw new AuthError(400, 'password must be at least 8 characters and contain a letter and a digit.')
  }
  const displayName = input.displayName.trim()
  if (!displayName) throw new AuthError(400, 'displayName is required.')
  if (!ROLES.includes(input.role)) throw new AuthError(400, `role must be one of: ${ROLES.join(', ')}.`)
  if ([...users.values()].some((u) => u.username === username)) {
    throw new AuthError(409, 'That username is already taken.')
  }

  const salt = randomBytes(16).toString('hex')
  const passwordHash = scryptHashSync(input.password, salt)
  const user: StoredUser = {
    id: `usr-${randomBytes(8).toString('hex')}`,
    username,
    displayName,
    role: input.role,
    createdAt: new Date().toISOString(),
    facilityId: input.facilityId ?? DEFAULT_FACILITY_ID,
    salt,
    passwordHash,
    passwordAlgorithm: 'scrypt',
    passwordChangedAt: new Date().toISOString(),
    failedLoginCount: 0,
    twoFactorEnabled: false,
  }
  users.set(user.id, user)
  persistUser(user)
  void scheduleArgon2Upgrade(user.id, input.password, passwordHash)
  return toAuthUser(user)
}

/**
 * Verifies a username/password pair. Argon2id and legacy scrypt hashes both
 * verify; a successful login against a legacy hash silently rehashes it to
 * Argon2id. Errors are deliberately identical for unknown user and bad password
 * so the endpoint cannot be used to enumerate accounts.
 */
export async function verifyCredentials(username: string, password: string): Promise<AuthUser> {
  const normalized = username.trim().toLowerCase()
  const candidates = [...users.values()].filter((u) => u.username === normalized)
  let user: StoredUser | undefined
  for (const candidate of candidates) {
    const algorithm = candidate.passwordAlgorithm ?? (candidate.passwordHash.startsWith('$argon2') ? 'argon2id' : 'scrypt')
    if (await verifyPassword(password, candidate.passwordHash, algorithm, candidate.salt)) {
      user = candidate
      break
    }
  }
  if (!user) throw new AuthError(401, 'Invalid username or password.')

  const algorithm = user.passwordAlgorithm ?? (user.passwordHash.startsWith('$argon2') ? 'argon2id' : 'scrypt')
  if (user.deactivatedAt) {
    throw new AuthError(401, 'This account has been deactivated. Contact the facility administrator.')
  }

  if (algorithm !== 'argon2id') {
    try {
      const upgraded = await hashPassword(password)
      user.passwordHash = upgraded.hash
      user.passwordAlgorithm = upgraded.algorithm
      user.salt = ''
      persistUser(user)
    } catch {
      // Verification already succeeded; a failed upgrade is non-fatal.
    }
  }
  return toAuthUser(user)
}

/** Records a successful sign-in and clears any persisted failure state. */
export function markLoginSuccess(userId: string, ip?: string): void {
  const user = users.get(userId)
  if (!user) return
  user.lastLoginAt = new Date().toISOString()
  if (ip) user.lastLoginIp = ip
  user.failedLoginCount = 0
  user.lockedUntil = undefined
  persistUser(user)
}

/** Sets a new password (caller enforces policy) and rehashes to Argon2id. */
export async function changePassword(userId: string, newPassword: string, exceptToken?: string): Promise<void> {
  const user = users.get(userId)
  if (!user) throw new AuthError(404, 'User not found.')
  const { hash, algorithm } = await hashPassword(newPassword)
  user.passwordHash = hash
  user.passwordAlgorithm = algorithm
  user.salt = ''
  user.passwordChangedAt = new Date().toISOString()
  persistUser(user)
  endAllSessionsForUser(userId, exceptToken)
}

export function getUser(id: string): AuthUser | undefined {
  const user = users.get(id)
  return user ? toAuthUser(user) : undefined
}

/** Internal accessor for security flows that must read non-public fields. */
export function getTwoFactorSecret(id: string): string | undefined {
  return users.get(id)?.twoFactorSecret
}

export function isTwoFactorEnabled(id: string): boolean {
  return users.get(id)?.twoFactorEnabled ?? false
}

/** Enrolls or clears the account's TOTP secret (ciphertext at rest). */
export function setTwoFactor(id: string, enabled: boolean, secretCipher?: string): AuthUser {
  const user = users.get(id)
  if (!user) throw new AuthError(404, 'User not found.')
  user.twoFactorEnabled = enabled
  user.twoFactorSecret = enabled ? secretCipher : undefined
  persistUser(user)
  return toAuthUser(user)
}

export function listUsers(): AuthUser[] {
  return [...users.values()].map(toAuthUser).sort((a, b) => a.username.localeCompare(b.username))
}

/** Users whose home facility is the given facility (P1-10). */
export function listUsersForFacility(facilityId: string): AuthUser[] {
  return listUsers().filter((user) => user.facilityId === facilityId)
}

/** Moves a user to another facility; requires the target to exist (checked by caller). */
export function setUserFacility(id: string, facilityId: string): AuthUser {
  const user = users.get(id)
  if (!user) throw new AuthError(404, 'User not found.')
  user.facilityId = facilityId
  user.facilityChangedAt = new Date().toISOString()
  persistUser(user)
  // A facility change alters the data a live session can reach — force re-login.
  endAllSessionsForUser(id)
  return toAuthUser(user)
}

export function setUserRole(id: string, role: UserRole): AuthUser {
  if (!ROLES.includes(role)) throw new AuthError(400, `role must be one of: ${ROLES.join(', ')}.`)
  const user = users.get(id)
  if (!user) throw new AuthError(404, 'User not found.')
  user.role = role
  user.roleChangedAt = new Date().toISOString()
  persistUser(user)
  // A role change alters what a live session may do — force re-login.
  endAllSessionsForUser(id)
  return toAuthUser(user)
}

export function deleteUser(id: string): void {
  if (!users.delete(id)) throw new AuthError(404, 'User not found.')
  if (persistenceEnabled()) {
    enqueue('user:' + id, () => deletePersistedUser(id))
    enqueue('login:' + id, () => deleteLoginSessionsForUser(id))
  }
  for (const [token, session] of sessions) {
    if (session.userId === id) sessions.delete(token)
  }
}

/* ------------------------------------------------------------------ */
/*  Account + login-session retention (P0-6)                            */
/* ------------------------------------------------------------------ */

export interface DeactivatedUser extends AuthUser {
  deactivatedAt: string
}

/**
 * Marks an account deactivated (stops logins, ends live sessions). The account
 * row survives until the `user-accounts` rule purges it, so the audit trail can
 * still resolve who did what.
 */
export function deactivateUser(id: string): DeactivatedUser {
  const user = users.get(id)
  if (!user) throw new AuthError(404, 'User not found.')
  if (!user.deactivatedAt) user.deactivatedAt = new Date().toISOString()
  for (const [token, session] of [...sessions.entries()]) {
    if (session.userId === id) sessions.delete(token)
  }
  return { ...toAuthUser(user), deactivatedAt: user.deactivatedAt }
}

export function listDeactivatedUsers(): DeactivatedUser[] {
  return [...users.values()]
    .filter((user) => user.deactivatedAt)
    .map((user) => ({ ...toAuthUser(user), deactivatedAt: user.deactivatedAt! }))
    .sort((a, b) => a.username.localeCompare(b.username))
}

export interface LoginSessionTarget {
  token: string
  userId: string
  expiresAt: string
}

/** Server-side login sessions (opaque tokens) for the retention sweep. */
export function listLoginSessions(): LoginSessionTarget[] {
  return [...sessions.values()].map((session) => ({
    token: session.token,
    userId: session.userId,
    expiresAt: new Date(session.expiresAt).toISOString(),
  }))
}

export function deleteLoginSession(token: string): boolean {
  const removed = sessions.delete(token)
  if (removed && persistenceEnabled()) enqueue('login', () => deletePersistedLoginSession(token))
  return removed
}

export function countLoginSessions(): number {
  return sessions.size
}

export interface StartSessionInput {
  userId: string
  activeFacilityId?: string
  ip?: string
  userAgent?: string
  deviceFingerprintHash?: string
  ttlMs?: number
}

export interface StartedSession {
  token: string
  sessionId: string
  expiresAt: string
}

/** Creates a server-side login session and returns its opaque token. */
export function startSession(input: StartSessionInput): StartedSession {
  const token = randomBytes(24).toString('base64url')
  const sessionId = `sess-${randomBytes(8).toString('hex')}`
  const ttl = input.ttlMs ?? SESSION_TTL_MS
  const expiresAt = Date.now() + ttl
  const user = users.get(input.userId)
  const scope = input.activeFacilityId ?? user?.facilityId
  const session: LoginSession = {
    id: sessionId,
    token,
    userId: input.userId,
    expiresAt,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    ip: input.ip,
    userAgent: input.userAgent,
    deviceFingerprintHash: input.deviceFingerprintHash,
  }
  if (scope) session.activeFacilityId = scope
  sessions.set(token, session)
  if (persistenceEnabled()) {
    enqueue('login:' + token, () =>
      upsertLoginSession({
        id: sessionId,
        token,
        userId: input.userId,
        expiresAt: new Date(expiresAt).toISOString(),
        ip: session.ip,
        userAgent: session.userAgent,
        deviceFingerprintHash: session.deviceFingerprintHash,
        lastSeenAt: new Date(session.lastSeenAt!).toISOString(),
      }),
    )
  }
  return { token, sessionId, expiresAt: new Date(expiresAt).toISOString() }
}

/** Records the last-seen time (and updated metadata) for a live session. */
export function touchSession(token: string, meta?: { ip?: string; userAgent?: string }): void {
  const session = sessions.get(token)
  if (!session) return
  session.lastSeenAt = Date.now()
  if (meta?.ip) session.ip = meta.ip
  if (meta?.userAgent) session.userAgent = meta.userAgent
}

/** Switches the facility in scope for a system-admin's live login session. */
export function switchActiveFacility(token: string, facilityId: string): void {
  const session = sessions.get(token)
  if (!session) throw new AuthError(401, 'Authentication required — log in first.')
  session.activeFacilityId = facilityId
}

/** The facility currently in scope for a token, or undefined. */
export function activeFacilityOf(token: string): string | undefined {
  return sessions.get(token)?.activeFacilityId
}

export function endSession(token: string): void {
  sessions.delete(token)
}

/** Ends every session belonging to a user; optionally spares one token. */
export function endAllSessionsForUser(userId: string, exceptToken?: string): number {
  let removed = 0
  for (const [token, session] of [...sessions.entries()]) {
    if (session.userId === userId && token !== exceptToken) {
      sessions.delete(token)
      removed += 1
    }
  }
  if (removed > 0 && persistenceEnabled()) enqueue('login-user:' + userId, () => deleteLoginSessionsForUser(userId))
  return removed
}

/** Active session summaries for the signed-in user's "your sessions" view. */
export function listSessionsForUser(userId: string): SessionSummary[] {
  const now = Date.now()
  return [...sessions.values()]
    .filter((session) => session.userId === userId && session.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((session) => ({
      id: session.id,
      userId: session.userId,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt).toISOString() : undefined,
      ip: session.ip,
      userAgent: session.userAgent,
      deviceFingerprintHash: session.deviceFingerprintHash,
      activeFacilityId: session.activeFacilityId,
    }))
}

/** Revokes one of a user's own sessions by id. Returns true when removed. */
export function revokeSessionById(userId: string, sessionId: string): boolean {
  for (const [token, session] of [...sessions.entries()]) {
    if (session.userId === userId && session.id === sessionId) {
      sessions.delete(token)
      if (persistenceEnabled()) enqueue('login', () => deletePersistedLoginSession(token))
      return true
    }
  }
  return false
}

/** The user id that owns a live session token, or undefined. */
export function sessionOwner(token: string): string | undefined {
  const session = sessions.get(token)
  if (!session) return undefined
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return undefined
  }
  return session.userId
}

/** The session id for a token (used to mark "this device" in the UI). */
export function sessionIdOf(token: string): string | undefined {
  return sessions.get(token)?.id
}

/** The opaque token for a live session id, or undefined when expired/unknown. */
export function sessionTokenForId(sessionId: string): string | undefined {
  for (const session of sessions.values()) {
    if (session.id === sessionId && session.expiresAt > Date.now()) return session.token
  }
  return undefined
}

/** Extends a live access session and persists its updated expiry. */
export function renewSession(token: string, ttlMs: number): StartedSession | undefined {
  const session = sessions.get(token)
  if (!session || session.expiresAt <= Date.now()) return undefined
  session.expiresAt = Date.now() + ttlMs
  session.lastSeenAt = Date.now()
  const expiresAt = session.expiresAt
  const lastSeenAt = session.lastSeenAt
  if (persistenceEnabled()) {
    enqueue('login:' + token, () =>
      upsertLoginSession({
        id: session.id,
        token,
        userId: session.userId,
        expiresAt: new Date(expiresAt).toISOString(),
        ip: session.ip,
        userAgent: session.userAgent,
        deviceFingerprintHash: session.deviceFingerprintHash,
        lastSeenAt: new Date(lastSeenAt).toISOString(),
      }),
    )
  }
  return { token, sessionId: session.id, expiresAt: new Date(expiresAt).toISOString() }
}

export function resolveSession(token: string): AuthUser | undefined {
  const session = sessions.get(token)
  if (!session) return undefined
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return undefined
  }
  session.lastSeenAt = Date.now()
  const user = getUser(session.userId)
  if (!user) return undefined
  return { ...user, activeFacilityId: session.activeFacilityId ?? user.facilityId }
}

/** Runtime error carrying an HTTP status for the error handler. */
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The four documented demo accounts (one per role) shown on the login screen. */
export const DEMO_ACCOUNTS: ReadonlyArray<{ username: string; displayName: string; password: string; role: UserRole }> = [
  { username: 'admin', displayName: 'S. Kiro', password: 'Admin@123', role: 'admin' },
  { username: 'nurse', displayName: 'R. Sharma', password: 'Nurse@123', role: 'nurse' },
  { username: 'doctor', displayName: 'Dr. A. Mehta', password: 'Doctor@123', role: 'doctor' },
  { username: 'patient', displayName: 'Ramesh Kumar', password: 'Patient@123', role: 'patient' },
]

/**
 * True when a username belongs to the demo directory. Self-registration must
 * not claim these, otherwise a patient account would shadow a demo login.
 */
export function isReservedUsername(username: string): boolean {
  const normalized = username.trim().toLowerCase()
  return DEMO_ACCOUNTS.some((account) => account.username === normalized)
}

/** Seeds the four demo accounts (one per role) so the app is usable immediately. */
export function seedUsers(): void {
  if (users.size > 0) return
  for (const account of DEMO_ACCOUNTS) createUser({ ...account })
}

/** Loads persisted users + live login sessions on boot (persistent mode only). */
export async function hydrateAuth(): Promise<void> {
  const rows = await loadUsers()
  users.clear()
  for (const raw of rows) {
    const rec = raw as {
      id: string
      username: string
      displayName: string
      role: UserRole
      facilityId?: string | null
      createdAt: string
      passwordHash: string
      salt: string
      deactivatedAt?: string | null
      passwordAlgorithm?: string | null
      passwordChangedAt?: string | null
      lastLoginAt?: string | null
      lastLoginIp?: string | null
      failedLoginCount?: number | null
      lockedUntil?: string | null
      twoFactorEnabled?: boolean | null
      twoFactorSecret?: string | null
      roleChangedAt?: string | null
      facilityChangedAt?: string | null
    }
    users.set(rec.id, {
      id: rec.id,
      username: rec.username,
      displayName: rec.displayName,
      role: rec.role,
      facilityId: rec.facilityId ?? DEFAULT_FACILITY_ID,
      createdAt: rec.createdAt,
      passwordHash: rec.passwordHash,
      salt: rec.salt,
      passwordAlgorithm: rec.passwordAlgorithm ?? (rec.passwordHash.startsWith('$argon2') ? 'argon2id' : 'scrypt'),
      passwordChangedAt: rec.passwordChangedAt ?? undefined,
      lastLoginAt: rec.lastLoginAt ?? undefined,
      lastLoginIp: rec.lastLoginIp ?? undefined,
      failedLoginCount: rec.failedLoginCount ?? 0,
      lockedUntil: rec.lockedUntil ?? undefined,
      twoFactorEnabled: rec.twoFactorEnabled ?? false,
      twoFactorSecret: rec.twoFactorSecret ?? undefined,
      roleChangedAt: rec.roleChangedAt ?? undefined,
      facilityChangedAt: rec.facilityChangedAt ?? undefined,
      deactivatedAt: rec.deactivatedAt ?? undefined,
    })
  }
  const logins = await loadLoginSessions()
  sessions.clear()
  for (const raw of logins) {
    const rec = raw as {
      id?: string
      token: string
      userId: string
      expiresAt: string
      ip?: string | null
      userAgent?: string | null
      deviceFingerprintHash?: string | null
      lastSeenAt?: string | null
    }
    const expiresMs = Date.parse(rec.expiresAt)
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) continue
    sessions.set(rec.token, {
      id: rec.id ?? `sess-${rec.token.slice(0, 12)}`,
      token: rec.token,
      userId: rec.userId,
      expiresAt: expiresMs,
      createdAt: Number.isFinite(Date.parse(rec.lastSeenAt ?? '')) ? Date.parse(rec.lastSeenAt!) : Date.now(),
      ip: rec.ip ?? undefined,
      userAgent: rec.userAgent ?? undefined,
      deviceFingerprintHash: rec.deviceFingerprintHash ?? undefined,
      lastSeenAt: Number.isFinite(Date.parse(rec.lastSeenAt ?? '')) ? Date.parse(rec.lastSeenAt!) : Date.now(),
    })
  }
}
