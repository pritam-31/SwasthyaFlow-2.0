import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { HttpError } from './errorHandler'
import { record } from '../services/securityEventService'
import type { SecurityEventType } from '../types/security.types'

/**
 * Input hardening (P1-12) — NoSQL-injection, prototype-pollution and
 * path-traversal screening.
 *
 * Request bodies, query strings and route params are walked for the shapes that
 * only ever appear in an attack:
 *   - object keys starting with `$` or containing `.` (Mongo operator injection)
 *   - `__proto__` / `constructor` / `prototype` keys (prototype pollution)
 *   - `..` segments and NUL bytes in URL-derived strings (path traversal)
 *
 * The request is rejected with a generic 400 and a security event is recorded;
 * no offending value is ever echoed back or logged. Screening is bounded by a
 * depth/complexity cap so a deeply nested payload cannot tie up the walker.
 */

const MAX_DEPTH = 10
const MAX_NODES = 5000

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const TRAVERSAL = /(\.\.(\/|\\|%2f|%5c))|\0/i

interface Violation {
  kind: 'nosql' | 'prototype' | 'traversal'
  type: SecurityEventType
  location: string
}

function inspect(
  value: unknown,
  location: string,
  checkTraversal: boolean,
  budget: { nodes: number },
  depth: number,
): Violation | null {
  if (depth > MAX_DEPTH || budget.nodes > MAX_NODES) return null
  budget.nodes += 1

  if (typeof value === 'string') {
    if (checkTraversal && TRAVERSAL.test(value)) {
      return { kind: 'traversal', type: 'security.path-traversal-attempt', location }
    }
    return null
  }
  if (value === null || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = inspect(value[index], `${location}[${index}]`, checkTraversal, budget, depth + 1)
      if (found) return found
    }
    return null
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = location ? `${location}.${key}` : key
    if (key.startsWith('$') || key.includes('.')) {
      return { kind: 'nosql', type: 'security.nosql-injection-attempt', location: keyPath }
    }
    if (POLLUTION_KEYS.has(key)) {
      return { kind: 'prototype', type: 'security.invalid-input', location: keyPath }
    }
    const found = inspect(child, keyPath, checkTraversal, budget, depth + 1)
    if (found) return found
  }
  return null
}

export const inputValidation: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const budget = { nodes: 0 }
  const violation =
    inspect(req.body, 'body', false, budget, 0) ??
    inspect(req.query, 'query', true, budget, 0) ??
    inspect(req.params, 'params', true, budget, 0)

  if (violation) {
    void record({
      type: violation.type,
      ip: req.ip,
      userAgent: req.header('user-agent'),
      requestId: req.requestId,
      detail: `Rejected ${violation.kind} input in ${violation.location} on ${req.method} ${req.path}.`,
    })
    next(new HttpError(400, 'Request blocked: invalid input.'))
    return
  }
  next()
}
