import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

/**
 * Request correlation id (P1-12).
 *
 * Reuses a well-formed inbound `X-Request-Id` (so a proxy or client can trace a
 * call end-to-end), otherwise mints one. The id is echoed back on the response
 * and is attached to every audit/security event raised for the request. Any
 * inbound value is length- and character-bounded so it can never smuggle
 * control characters into logs.
 */

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/

export const requestId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const inbound = req.header('x-request-id')
  const id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID()
  req.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}
