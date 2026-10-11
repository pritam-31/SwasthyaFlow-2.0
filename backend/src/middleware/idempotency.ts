import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { addAudit } from '../services/auditStore'
import {
  clearInFlight,
  get,
  hashPayload,
  markInFlight,
  put,
} from '../services/idempotencyService'
import { authUser } from './auth'
import { HttpError } from './errorHandler'

/**
 * Idempotency middleware (P1-8).
 *
 * Applies only to the allowlisted offline-capable write endpoints. When an
 * `Idempotency-Key` header is present:
 *  - a replayed key with the same payload returns the stored response;
 *  - a reused key with a different payload is rejected with 409;
 *  - a fresh key runs the handler and stores its response (TTL 24 h).
 *
 * Only a hash of the payload is stored — never the payload itself.
 */

interface AllowRule {
  method: string
  pattern: RegExp
}

const RULES: AllowRule[] = [
  { method: 'POST', pattern: /^\/api\/sessions\/?$/ },
  { method: 'PATCH', pattern: /^\/api\/sessions\/[^/]+\/note$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/status$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/followups$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/followups\/[^/]+\/answer$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/timeline\/build$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/timeline\/events$/ },
  { method: 'PATCH', pattern: /^\/api\/sessions\/[^/]+\/timeline\/events\/[^/]+$/ },
  { method: 'DELETE', pattern: /^\/api\/sessions\/[^/]+\/timeline\/events\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/referral$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/referral\/approve$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/referral\/checklist$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/referral\/checklist\/override$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/referral\/status$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review\/accept$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review\/finalize$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review\/reject$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review\/return$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review\/escalate$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/review\/escalation$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/voice-metrics$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/summary-pdf$/ },
  { method: 'POST', pattern: /^\/api\/sessions\/[^/]+\/consent\/revoke$/ },
  { method: 'POST', pattern: /^\/api\/audit\/?$/ },
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isIdempotentRoute(method: string, path: string): boolean {
  return RULES.some((rule) => rule.method === method.toUpperCase() && rule.pattern.test(path))
}

function sessionIdFromPath(path: string): string {
  const match = /\/sessions\/([^/]+)/.exec(path)
  return match ? match[1] : 'offline'
}

export const idempotency: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.header('idempotency-key')?.trim()
  const path = req.originalUrl.split('?')[0]
  if (!key || !isIdempotentRoute(req.method, path)) {
    next()
    return
  }
  if (key.length > 128 || !UUID.test(key)) {
    next(new HttpError(400, 'Idempotency-Key must be a UUID of at most 128 characters.'))
    return
  }

  const run = async (): Promise<void> => {
    const bodyHash = hashPayload(req.body ?? {})
    const user = authUser(req)
    const sessionId = sessionIdFromPath(path)

    const existing = await get(key)
    if (existing) {
      if (existing.payloadHash === bodyHash) {
        addAudit({
          sessionId,
          actor: user.displayName,
          role: user.role,
          action: 'idempotency.replayed',
          detail: `Replayed ${req.method} ${path} from a previously stored response.`,
          category: 'system',
        })
        res.status(existing.responseStatus).json(existing.responseBody)
        return
      }
      addAudit({
        sessionId,
        actor: user.displayName,
        role: user.role,
        action: 'idempotency.conflict',
        detail: `Idempotency key reused with a different payload for ${req.method} ${path}.`,
        category: 'system',
      })
      throw new HttpError(409, 'Idempotency key reused with different payload.')
    }

    if (!markInFlight(key)) {
      throw new HttpError(409, 'Idempotency key is already in flight.')
    }

    const storeJson = res.json.bind(res) as (body?: unknown) => Response
    res.json = ((body?: unknown): Response => {
      if (res.statusCode < 500) {
        void put(key, bodyHash, res.statusCode, body).finally(() => clearInFlight(key))
      } else {
        clearInFlight(key)
      }
      return storeJson(body)
    }) as Response['json']
    res.on('close', () => {
      if (!res.writableEnded) clearInFlight(key)
    })
    next()
  }

  run().catch(next)
}
