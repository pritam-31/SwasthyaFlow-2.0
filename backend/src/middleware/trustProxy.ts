import type { Express } from 'express'
import { env } from '../config/env'

/**
 * Trust-proxy configuration (P1-12).
 *
 * `req.ip` drives rate limiting, lockouts and the IP blocklist, so trusting a
 * proxy blindly would let a client spoof `X-Forwarded-For`. `TRUST_PROXY` is
 * therefore parsed explicitly:
 *   - `false` / empty        → trust nothing (default)
 *   - a number `n`           → trust the last `n` hops (typical reverse proxy)
 *   - `true`                 → trust the single closest hop (safe minimal default)
 *   - `a,b,c` / CIDRs        → trust exactly those addresses
 */

export function trustProxyValue(): boolean | number | string {
  const raw = (env().TRUST_PROXY ?? 'false').trim()
  if (!raw || raw.toLowerCase() === 'false') return false
  if (raw.toLowerCase() === 'true') return 1
  if (/^\d+$/.test(raw)) return Number(raw)
  return raw
}

export function applyTrustProxy(app: Express): void {
  app.set('trust proxy', trustProxyValue())
}
