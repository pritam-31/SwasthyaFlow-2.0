import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { isSystemAdmin, resolveSession, type AuthUser } from '../services/authStore'
import { HttpError } from './errorHandler'
import { SESSION_COOKIE, readCookie } from '../config/cookies'
import { pseudonymise } from '../config/secrets'
import { fingerprintFor } from '../services/deviceService'
import type { UserRole } from '../types'

/**
 * Authentication middleware (P1-12).
 *
 * Two credentials are accepted, in order: an `Authorization: Bearer <token>`
 * header (the pre-migration contract, kept for backward compatibility) and the
 * httpOnly `swasthyaflow.sid` session cookie. A resolved session attaches the
 * user, the raw session token and an anonymised request context used by the
 * security-event trail.
 */

/** Resolves the login token from the bearer header or the session cookie. */
function tokenFrom(req: Request): string {
  const header = req.header('authorization') ?? ''
  if (header.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim()
    if (bearer) return bearer
  }
  return readCookie(req, SESSION_COOKIE) ?? ''
}

/** Rejects the request unless a valid login session is presented. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = tokenFrom(req)
  const user = token ? resolveSession(token) : undefined
  if (!user) {
    next(new HttpError(401, 'Authentication required — log in first.'))
    return
  }
  req.user = user
  req.sessionToken = token
  const userAgent = req.header('user-agent') ?? ''
  req.authContext = {
    ip: req.ip ?? '',
    userAgent,
    userAgentHash: pseudonymise(userAgent, 'ua'),
    facilityId: user.activeFacilityId ?? user.facilityId,
    deviceFingerprintHash: fingerprintFor(user.id, userAgent),
    requestId: req.requestId ?? '',
  }
  next()
}

/**
 * Restricts a route to the given roles. The admin role always passes: the
 * facility administrator can access everything, by design.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) {
      next(new HttpError(401, 'Authentication required — log in first.'))
      return
    }
    if (!isSystemAdmin(user.role) && !roles.includes(user.role)) {
      next(new HttpError(403, `This action requires one of these roles: ${roles.join(', ')}.`))
      return
    }
    next()
  }
}

/** Narrowing helper for route handlers (requireAuth runs first). */
export function authUser(req: Request): AuthUser {
  const user = req.user
  if (!user) throw new HttpError(401, 'Authentication required — log in first.')
  return user
}

/** The session token that authenticated the request (requireAuth runs first). */
export function sessionToken(req: Request): string {
  if (!req.sessionToken) throw new HttpError(401, 'Authentication required — log in first.')
  return req.sessionToken
}
