import type { NextFunction, Request, RequestHandler, Response } from 'express'
import helmet from 'helmet'
import { env } from '../config/env'

/**
 * Security response headers (P1-12).
 *
 * Helmet supplies HSTS, X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy and a strict Content-Security-Policy (report-only when
 * `CSP_REPORT_ONLY=true`, which is how a rollout can be watched without
 * breaking the app). Permissions-Policy is set explicitly. HSTS is emitted here
 * (it is harmless over localhost) so the header set does not depend on
 * `NODE_ENV`.
 */

const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
} as const

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ')

export function securityHeaders(): RequestHandler {
  const reportOnly = env().CSP_REPORT_ONLY
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly,
      directives: CSP_DIRECTIVES,
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    noSniff: true,
    hidePoweredBy: true,
  })
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY)
    helmetMiddleware(req, res, next)
  }
}
