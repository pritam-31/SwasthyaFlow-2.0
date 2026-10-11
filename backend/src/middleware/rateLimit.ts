import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { rateLimitEnabled } from '../config/env'
import { consume, actorKey, ipKey } from '../services/rateLimitService'
import { DEFAULT_RATE_LIMIT_POLICY, getEffectivePolicy } from '../services/passwordPolicyService'
import { record } from '../services/securityEventService'
import type { RateLimitPolicy } from '../types/security.types'

/**
 * Rate limiting middleware (P1-12).
 *
 * Five tiers are exposed and wired in `app.ts`: `global`, `auth`, `sensitive`,
 * `upload` and `sync`. Each tier reads its ceiling from the effective security
 * policy (facility-scoped once the caller is authenticated, global otherwise),
 * so an administrator can tune limits per facility. Counters are Mongo-backed
 * and keyed by hashed identifiers — see {@link rateLimitService}.
 *
 * Limiting is disabled outside production unless `ENABLE_RATE_LIMIT=true`, so
 * the deterministic test suite is never throttled. Standard `Retry-After`,
 * `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers are returned.
 */

export type RateLimitTier = 'global' | 'auth' | 'sensitive' | 'upload' | 'sync'

function ceilingFor(policy: RateLimitPolicy, tier: RateLimitTier): number {
  return policy[`${tier}PerMinute`]
}

async function resolveCeiling(facilityId: string, tier: RateLimitTier): Promise<number> {
  try {
    const policy = await getEffectivePolicy(facilityId)
    return ceilingFor(policy.rateLimit, tier)
  } catch {
    return ceilingFor(DEFAULT_RATE_LIMIT_POLICY, tier)
  }
}

export function rateLimit(tier: RateLimitTier): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!rateLimitEnabled()) {
      next()
      return
    }
    const facilityId = req.user?.facilityId ?? 'global'
    const max = await resolveCeiling(facilityId, tier)
    const key = req.user ? actorKey(req.user.id, tier) : ipKey(req.ip ?? 'unknown', tier)
    const result = await consume(key, max)

    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - result.current)))

    if (!result.allowed) {
      const retryAfter = result.retryAfter ?? 60
      res.setHeader('Retry-After', String(retryAfter))
      await record({
        type: 'security.rate-limit-exceeded',
        actorId: req.user?.id,
        facilityId,
        ip: req.ip,
        userAgent: req.header('user-agent'),
        requestId: req.requestId,
        detail: `${tier} rate limit exceeded (${max}/min).`,
      })
      res.status(429).json({ error: `Too many requests. Retry after ${retryAfter} second(s).` })
      return
    }
    next()
  }
}
