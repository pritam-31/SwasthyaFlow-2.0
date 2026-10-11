import type { CookieOptions, Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { env, isProduction } from './env'

/**
 * Cookie configuration (P1-12).
 *
 * Three cookies make up the cookie-based auth model:
 *   - `swasthyaflow.sid`  — httpOnly session cookie (short-lived access window)
 *   - `swasthyaflow.rt`   — httpOnly refresh cookie (long-lived, rotating)
 *   - `swasthyaflow.csrf` — readable double-submit token (not a secret)
 *
 * Same-site deployments use `SameSite=Lax`; separate HTTPS frontend/API
 * origins use `SameSite=None; Secure` so credentialed fetch requests can carry
 * the cookies. The CSRF cookie is intentionally NOT httpOnly because the
 * client must echo it back in the `X-CSRF-Token` header.
 */

export const SESSION_COOKIE = 'swasthyaflow.sid'
export const REFRESH_COOKIE = 'swasthyaflow.rt'
export const CSRF_COOKIE = 'swasthyaflow.csrf'
export const CSRF_HEADER = 'x-csrf-token'

/** Access (session) cookie lifetime — kept in step with the session policy. */
export const DEFAULT_SESSION_COOKIE_MAX_AGE_MS = 15 * 60 * 1000
export const DEFAULT_REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function baseOptions(): CookieOptions {
  const sameSite = env().COOKIE_SAME_SITE ?? (isProduction() ? 'none' : 'lax')
  return {
    httpOnly: true,
    sameSite,
    secure: isProduction() || sameSite === 'none',
    path: '/',
  }
}

export function sessionCookieOptions(maxAgeMs = DEFAULT_SESSION_COOKIE_MAX_AGE_MS): CookieOptions {
  return { ...baseOptions(), maxAge: maxAgeMs }
}

export function refreshCookieOptions(maxAgeMs = DEFAULT_REFRESH_COOKIE_MAX_AGE_MS): CookieOptions {
  return { ...baseOptions(), maxAge: maxAgeMs }
}

export function csrfCookieOptions(maxAgeMs = DEFAULT_REFRESH_COOKIE_MAX_AGE_MS): CookieOptions {
  return { ...baseOptions(), httpOnly: false, maxAge: maxAgeMs }
}

export interface AuthCookiePayload {
  sessionToken: string
  sessionMaxAgeMs?: number
  refreshToken: string
  refreshMaxAgeMs?: number
}

/** Sets the session + refresh cookies for a freshly authenticated client. */
export function setAuthCookies(res: Response, payload: AuthCookiePayload): void {
  res.cookie(SESSION_COOKIE, payload.sessionToken, sessionCookieOptions(payload.sessionMaxAgeMs))
  res.cookie(REFRESH_COOKIE, payload.refreshToken, refreshCookieOptions(payload.refreshMaxAgeMs))
}

/** Clears the session + refresh cookies on logout. */
export function clearAuthCookies(res: Response): void {
  const clear: CookieOptions = { ...baseOptions(), maxAge: 0 }
  res.clearCookie(SESSION_COOKIE, clear)
  res.clearCookie(REFRESH_COOKIE, clear)
}

/** Reads a cookie without depending on the parse order of middleware. */
export function readCookie(req: Request, name: string): string | undefined {
  const value = req.cookies?.[name]
  return typeof value === 'string' && value ? value : undefined
}

/** Issues a CSRF double-submit token if the client does not already hold one. */
export function ensureCsrfCookie(req: Request, res: Response): string {
  const existing = readCookie(req, CSRF_COOKIE)
  if (existing) return existing
  const token = randomBytes(24).toString('base64url')
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions())
  return token
}
