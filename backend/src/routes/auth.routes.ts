import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { Router } from 'express'
import { authUser, requireAuth, requireRole, sessionToken } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { addAudit } from '../services/auditStore'
import {
  AuthError,
  changePassword,
  createUser,
  deactivateUser,
  deleteUser,
  endAllSessionsForUser,
  endSession,
  getUser,
  isSystemAdmin,
  listSessionsForUser,
  listUsers,
  listUsersForFacility,
  markLoginSuccess,
  ROLES,
  revokeSessionById,
  renewSession,
  sessionIdOf,
  sessionTokenForId,
  setUserRole,
  startSession,
  verifyCredentials,
  type AuthUser,
  type StartedSession,
} from '../services/authStore'
import { bodyTokenEnabled } from '../config/env'
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  readCookie,
  setAuthCookies,
} from '../config/cookies'
import { getEffectivePolicy, validatePassword } from '../services/passwordPolicyService'
import { checkLockout, clearFailures, registerFailure } from '../services/lockoutService'
import {
  issue as issueRefresh,
  peek as peekRefresh,
  revokeBySession,
  revokeByUser,
  rotate as rotateRefresh,
  RefreshTokenError,
} from '../services/refreshTokenService'
import { listDevices, revokeDevice, touchDevice } from '../services/deviceService'
import {
  beginEnrollment,
  cancelEnrollment,
  confirmEnrollment,
  disable as disableTwoFactor,
  verifyStoredCode,
} from '../services/twoFactorService'
import { record } from '../services/securityEventService'
import type { SecurityEventType } from '../types/security.types'
import type { UserRole } from '../types'

export const authRouter = Router()

/** Wraps an async handler so rejections reach the error middleware. */
function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

function requiredString(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | null | undefined)?.[key]
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${key} is required.`)
  return value.trim()
}

function optionalString(body: unknown, key: string): string | undefined {
  const value = (body as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Request context shared by every security event raised from this router. */
function context(req: Request) {
  return {
    ip: req.ip ?? '',
    userAgent: req.header('user-agent') ?? '',
    requestId: req.requestId,
  }
}

async function emit(
  type: SecurityEventType,
  detail: string,
  extra: { actorId?: string; actorRole?: AuthUser['role']; facilityId?: string; req: Request },
): Promise<void> {
  const ctx = context(extra.req)
  await record({ type, detail, actorId: extra.actorId, actorRole: extra.actorRole, facilityId: extra.facilityId, ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.requestId })
}

interface AuthPayloadExtras {
  session: StartedSession
  refreshToken: string
  accessTokenMinutes: number
  refreshTokenDays: number
}

/** Sets the auth cookies and, when enabled, includes the token in the body. */
function sendAuth(res: Response, user: AuthUser, extras: AuthPayloadExtras): void {
  setAuthCookies(res, {
    sessionToken: extras.session.token,
    refreshToken: extras.refreshToken,
    sessionMaxAgeMs: extras.accessTokenMinutes * 60_000,
    refreshMaxAgeMs: extras.refreshTokenDays * 86_400_000,
  })
  const body: Record<string, unknown> = { user, expiresAt: extras.session.expiresAt }
  if (bodyTokenEnabled()) body.token = extras.session.token
  res.json(body)
}

/** Roles a facility-admin may assign inside their own facility. */
const FACILITY_SCOPED_ROLES: UserRole[] = ['nurse', 'doctor', 'patient', 'facility-admin']

/** Users visible to the caller (system-admin: all; facility-admin: own facility). */
function visibleUsers(actor: AuthUser): AuthUser[] {
  return isSystemAdmin(actor.role) ? listUsers() : listUsersForFacility(actor.facilityId)
}

/** Resolve a target user, treating cross-facility access as a 404. */
function assertUserInScope(actor: AuthUser, id: string): AuthUser {
  const target = getUser(id)
  if (!target || (!isSystemAdmin(actor.role) && target.facilityId !== actor.facilityId)) {
    throw new HttpError(404, 'User not found.')
  }
  return target
}

/* ------------------------------------------------------------------ */
/*  Registration + login                                               */
/* ------------------------------------------------------------------ */

/**
 * Self-registration always creates a patient account. It keeps the base
 * strength rule (>=8 chars, letter + digit); the fuller configurable policy is
 * enforced on password *changes* and by administrators. Documented in
 * MIGRATION.md.
 */
authRouter.post('/register', ah(async (req, res) => {
  const username = requiredString(req.body, 'username')
  const displayName = requiredString(req.body, 'displayName')
  const password = requiredString(req.body, 'password')

  const user = createUser({ username, displayName, password, role: 'patient' })
  const policy = await getEffectivePolicy(user.facilityId)

  addAudit({
    sessionId: 'auth',
    actor: user.displayName,
    role: user.role,
    action: 'user.registered',
    detail: `Account "${user.username}" self-registered with the patient role.`,
    category: 'auth',
  })

  const session = startSession({ userId: user.id, ip: req.ip, userAgent: req.header('user-agent'), ttlMs: policy.session.accessTokenMinutes * 60_000 })
  const refresh = issueRefresh({ userId: user.id, sessionId: session.sessionId, ttlDays: policy.session.refreshTokenDays })
  await emit('auth.login-success', 'Account created and signed in.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })

  res.status(201)
  sendAuth(res, user, { session, refreshToken: refresh.token, accessTokenMinutes: policy.session.accessTokenMinutes, refreshTokenDays: policy.session.refreshTokenDays })
}))

authRouter.post('/login', ah(async (req, res) => {
  const username = requiredString(req.body, 'username')
  const password = requiredString(req.body, 'password')
  const ctx = context(req)

  const locked = checkLockout(username, ctx.ip)
  if (locked.locked) {
    res.setHeader('Retry-After', String(locked.retryAfterSeconds ?? 60))
    res.status(423).json({ error: 'Account temporarily locked due to failed sign-in attempts.', retryAfterSeconds: locked.retryAfterSeconds })
    return
  }

  let user: AuthUser
  try {
    user = await verifyCredentials(username, password)
  } catch (err) {
    if (!(err instanceof AuthError)) throw err
    const policy = await getEffectivePolicy('global')
    const outcome = await registerFailure(policy.lockout, { username, ip: ctx.ip, facilityId: 'global', requestId: ctx.requestId })
    await emit('auth.login-failure', 'Sign-in failed: invalid credentials.', { facilityId: 'global', req })
    if (outcome.locked) {
      const state = checkLockout(username, ctx.ip)
      res.setHeader('Retry-After', String(state.retryAfterSeconds ?? 60))
      res.status(423).json({ error: 'Account temporarily locked due to failed sign-in attempts.', retryAfterSeconds: state.retryAfterSeconds })
      return
    }
    throw err
  }

  const policy = await getEffectivePolicy(user.facilityId)

  if (user.twoFactorEnabled) {
    const code = optionalString(req.body, 'code')
    if (!code) {
      res.status(401).json({ error: 'Two-factor authentication code required.', twoFactorRequired: true })
      return
    }
    if (!(await verifyStoredCode(user.id, code))) {
      await registerFailure(policy.lockout, { username, ip: ctx.ip, facilityId: user.facilityId, actorId: user.id, requestId: ctx.requestId })
      await emit('auth.2fa-failed', 'Two-factor code rejected.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
      throw new HttpError(401, 'Invalid username or password.')
    }
    await emit('auth.2fa-verified', 'Two-factor code verified.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  }

  await clearFailures(username, ctx.ip, { facilityId: user.facilityId, requestId: ctx.requestId })
  markLoginSuccess(user.id, ctx.ip)

  const device = await touchDevice({ userId: user.id, userAgent: ctx.userAgent, ip: ctx.ip })
  if (policy.session.deviceBinding && device.changedFingerprint) {
    await emit('security.suspicious-ua', 'Sign-in from a device fingerprint not previously seen for this account.', { actorId: user.id, facilityId: user.facilityId, req })
  }

  const session = startSession({ userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent, deviceFingerprintHash: device.device.fingerprintHash, ttlMs: policy.session.accessTokenMinutes * 60_000 })
  const refresh = issueRefresh({ userId: user.id, sessionId: session.sessionId, ttlDays: policy.session.refreshTokenDays })

  addAudit({ facilityId: user.facilityId, sessionId: 'auth', actor: user.displayName, role: user.role, action: 'user.login', detail: `Signed in as "${user.username}".`, category: 'auth' })
  await emit('auth.login-success', 'Sign-in succeeded.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })

  sendAuth(res, user, { session, refreshToken: refresh.token, accessTokenMinutes: policy.session.accessTokenMinutes, refreshTokenDays: policy.session.refreshTokenDays })
}))

authRouter.post('/refresh', ah(async (req, res) => {
  const raw = readCookie(req, REFRESH_COOKIE)
  const ctx = context(req)
  if (!raw) {
    clearAuthCookies(res)
    throw new HttpError(401, 'Session expired — please sign in again.')
  }
  const current = peekRefresh(raw)
  if (!current) {
    clearAuthCookies(res)
    throw new HttpError(401, 'Session expired — please sign in again.')
  }
  const policy = await getEffectivePolicy('global')
  const accessMs = policy.session.accessTokenMinutes * 60_000

  try {
    if (current.usedAt) {
      await rotateRefresh(raw, policy.session.refreshTokenDays)
      throw new HttpError(401, 'Session expired — please sign in again.')
    }
    const liveToken = sessionTokenForId(current.sessionId)
    let session: StartedSession
    let rotated
    if (liveToken) {
      const renewed = renewSession(liveToken, accessMs)
      if (!renewed) throw new HttpError(401, 'Session expired — please sign in again.')
      session = renewed
      rotated = await rotateRefresh(raw, policy.session.refreshTokenDays)
    } else {
      const fresh = startSession({ userId: current.userId, ip: ctx.ip, userAgent: ctx.userAgent, ttlMs: accessMs })
      session = fresh
      rotated = await rotateRefresh(raw, policy.session.refreshTokenDays, fresh.sessionId)
    }
    const user = getUser(current.userId)
    if (!user) throw new HttpError(401, 'Session expired — please sign in again.')
    await emit('auth.token-refresh', 'Access session refreshed.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
    sendAuth(res, user, { session, refreshToken: rotated.token, accessTokenMinutes: policy.session.accessTokenMinutes, refreshTokenDays: policy.session.refreshTokenDays })
  } catch (err) {
    clearAuthCookies(res)
    if (err instanceof RefreshTokenError) throw new HttpError(401, 'Session expired — please sign in again.')
    throw err
  }
}))

authRouter.post('/logout', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const token = sessionToken(req)
  const sid = sessionIdOf(token)
  endSession(token)
  if (sid) await revokeBySession(sid, 'logout')
  clearAuthCookies(res)
  await emit('auth.logout', 'Signed out.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  addAudit({ facilityId: user.facilityId, sessionId: 'auth', actor: user.displayName, role: user.role, action: 'user.logout', detail: `Signed out as "${user.username}".`, category: 'auth' })
  res.json({ ok: true })
}))

authRouter.post('/logout-all', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  endAllSessionsForUser(user.id)
  await revokeByUser(user.id, 'logout-all')
  clearAuthCookies(res)
  await emit('auth.all-sessions-revoked', 'All sessions revoked by the account owner.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  res.json({ ok: true })
}))

authRouter.get('/me', requireAuth, (req, res) => {
  const user = authUser(req)
  res.json({ user, sessionId: req.sessionToken ? sessionIdOf(req.sessionToken) : undefined })
})

/* ------------------------------------------------------------------ */
/*  Password, sessions + devices                                       */
/* ------------------------------------------------------------------ */

authRouter.post('/change-password', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const currentPassword = requiredString(req.body, 'currentPassword')
  const newPassword = requiredString(req.body, 'newPassword')

  // Verifying the current password also confirms the caller owns the account.
  await verifyCredentials(user.username, currentPassword)
  if (currentPassword === newPassword) throw new HttpError(400, 'New password must differ from the current password.')

  const policy = await getEffectivePolicy(user.facilityId)
  const check = validatePassword(newPassword, policy.password, user.username)
  if (!check.ok) throw new HttpError(400, `Password does not meet the security policy: ${check.errors.join(', ')}.`)

  await changePassword(user.id, newPassword, sessionToken(req))
  await emit('auth.password-changed', 'Password changed; other sessions were revoked.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  addAudit({ facilityId: user.facilityId, sessionId: 'auth', actor: user.displayName, role: user.role, action: 'user.password_changed', detail: 'Changed their own password.', category: 'auth' })
  res.json({ ok: true })
}))

authRouter.get('/sessions', requireAuth, (req, res) => {
  const user = authUser(req)
  const currentId = req.sessionToken ? sessionIdOf(req.sessionToken) : undefined
  const sessions = listSessionsForUser(user.id).map((session) => ({ ...session, current: session.id === currentId }))
  res.json({ sessions })
})

authRouter.delete('/sessions/:id', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const removed = revokeSessionById(user.id, req.params.id)
  if (!removed) throw new HttpError(404, 'Session not found.')
  await revokeBySession(req.params.id, 'revoked')
  await emit('auth.session-revoked', 'A session was revoked.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  res.json({ ok: true })
}))

authRouter.get('/devices', requireAuth, (req, res) => {
  const user = authUser(req)
  res.json({ devices: listDevices(user.id) })
})

authRouter.delete('/devices/:id', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const device = await revokeDevice(user.id, req.params.id)
  if (!device) throw new HttpError(404, 'Device not found.')
  for (const session of listSessionsForUser(user.id)) {
    if (session.deviceFingerprintHash === device.fingerprintHash) {
      revokeSessionById(user.id, session.id)
      await revokeBySession(session.id, 'device-revoked')
    }
  }
  await emit('auth.device-revoked', 'A device was revoked and its sessions ended.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  res.json({ ok: true })
}))

/* ------------------------------------------------------------------ */
/*  Two-factor authentication                                          */
/* ------------------------------------------------------------------ */

authRouter.post('/2fa/setup', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const enrollment = await beginEnrollment(user)
  res.json({ otpauthUrl: enrollment.otpauthUrl, qrDataUrl: enrollment.qrDataUrl, secret: enrollment.secret })
}))

authRouter.post('/2fa/enable', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const code = requiredString(req.body, 'code')
  if (!(await confirmEnrollment(user.id, code))) {
    cancelEnrollment(user.id)
    throw new HttpError(400, 'The two-factor code was not valid. Start enrolment again.')
  }
  await emit('auth.2fa-enabled', 'Two-factor authentication enabled.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  res.json({ ok: true })
}))

authRouter.post('/2fa/disable', requireAuth, ah(async (req, res) => {
  const user = authUser(req)
  const code = requiredString(req.body, 'code')
  if (!(await disableTwoFactor(user.id, code))) {
    await emit('auth.2fa-failed', 'Two-factor disable code rejected.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
    throw new HttpError(400, 'The two-factor code was not valid.')
  }
  await emit('auth.2fa-disabled', 'Two-factor authentication disabled.', { actorId: user.id, actorRole: user.role, facilityId: user.facilityId, req })
  res.json({ ok: true })
}))

/* ------------------------------------------------------------------ */
/*  Admin: user management (unchanged contract)                        */
/* ------------------------------------------------------------------ */

authRouter.get('/users', requireAuth, requireRole('facility-admin'), (req, res) => {
  res.json({ users: visibleUsers(authUser(req)) })
})

authRouter.post('/users', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const username = requiredString(req.body, 'username')
  const displayName = requiredString(req.body, 'displayName')
  const password = requiredString(req.body, 'password')
  const role = (typeof req.body?.role === 'string' ? req.body.role : '') as UserRole
  const allowed = isSystemAdmin(actor.role) ? ROLES : FACILITY_SCOPED_ROLES
  if (!allowed.includes(role)) throw new HttpError(400, `role must be one of: ${allowed.join(', ')}.`)

  const requestedFacility = typeof req.body?.facilityId === 'string' ? req.body.facilityId : undefined
  const facilityId = isSystemAdmin(actor.role) ? requestedFacility : actor.facilityId
  const user = createUser({ username, displayName, password, role, facilityId })

  addAudit({
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'user.created',
    detail: `Created account "${user.username}" with the ${user.role} role.`,
    category: 'auth',
  })

  res.status(201).json({ user })
})

authRouter.patch('/users/:id/role', requireAuth, requireRole('facility-admin'), (req, res) => {
  const role = (typeof req.body?.role === 'string' ? req.body.role : '') as UserRole
  const actor = authUser(req)
  const allowed = isSystemAdmin(actor.role) ? ROLES : FACILITY_SCOPED_ROLES
  if (!allowed.includes(role)) throw new HttpError(400, `role must be one of: ${allowed.join(', ')}.`)
  assertUserInScope(actor, req.params.id)

  const user = setUserRole(req.params.id, role)

  addAudit({
    facilityId: user.facilityId,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'user.role_changed',
    detail: `Changed role of "${user.username}" to ${user.role}.`,
    category: 'auth',
  })

  res.json({ user })
})

authRouter.delete('/users/:id', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const target = assertUserInScope(actor, req.params.id)
  if (target.id === actor.id) throw new HttpError(400, 'You cannot delete your own account.')

  deleteUser(target.id)

  addAudit({
    facilityId: target.facilityId,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'user.deleted',
    detail: `Deleted account "${target.username}" (${target.role}).`,
    category: 'auth',
  })

  res.json({ ok: true })
})

/**
 * Deactivate an account (P0-6 `user-accounts` rule). Deactivation stops logins
 * and ends live sessions; the account row is purged 30 days later so the audit
 * trail can still resolve the actor in the meantime.
 */
authRouter.post('/users/:id/deactivate', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const target = assertUserInScope(actor, req.params.id)
  if (target.id === actor.id) throw new HttpError(400, 'You cannot deactivate your own account.')

  const user = deactivateUser(target.id)

  addAudit({
    facilityId: user.facilityId,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'user.deactivated',
    detail: `Deactivated account "${user.username}" (${user.role}) — login sessions ended; eligible for purge under the user-accounts retention rule.`,
    category: 'auth',
  })

  res.json({ user })
})
