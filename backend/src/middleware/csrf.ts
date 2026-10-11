import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { CSRF_COOKIE, CSRF_HEADER, ensureCsrfCookie, readCookie, SESSION_COOKIE } from '../config/cookies'
import { record } from '../services/securityEventService'

/**
 * CSRF protection (P1-12) — synchroniser/double-submit token.
 *
 * A token is issued in a readable `swasthyaflow.csrf` cookie; mutating requests
 * that authenticate via the ambient session cookie must echo it back in the
 * `X-CSRF-Token` header. Requests authenticated with an `Authorization: Bearer`
 * token are exempt: a bearer token is not sent automatically by the browser, so
 * it carries no CSRF risk (this is the OWASP-recommended exemption and keeps the
 * token → cookie migration backward compatible). Cross-site form POSTs cannot
 * read the cookie and are rejected.
 *
 * Each request is itself a security event when the check fails (no secret or
 * token value is ever logged).
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function hasBearer(req: Request): boolean {
  const header = req.header('authorization') ?? ''
  return header.startsWith('Bearer ')
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

export const csrfProtection: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  // Always make sure the client holds a token so the SPA can read and replay it.
  ensureCsrfCookie(req, res)

  if (SAFE_METHODS.has(req.method) || hasBearer(req)) {
    next()
    return
  }

  // Only cookie-authenticated requests carry CSRF risk. Without a session cookie
  // (e.g. login/register/refresh with an expired access window) there is no
  // ambient credential to protect.
  const sessionToken = readCookie(req, SESSION_COOKIE)
  if (!sessionToken) {
    next()
    return
  }

  const cookieToken = readCookie(req, CSRF_COOKIE)
  const headerToken = req.header(CSRF_HEADER)
  if (!cookieToken || !headerToken || !constantTimeEquals(cookieToken, headerToken)) {
    void record({
      type: 'security.csrf-failure',
      ip: req.ip,
      userAgent: req.header('user-agent'),
      requestId: req.requestId,
      detail: `CSRF token ${cookieToken ? 'mismatch' : 'missing'} on ${req.method} ${req.path}.`,
    })
    res.status(403).json({ error: 'Request blocked: invalid CSRF token.' })
    return
  }

  next()
}
