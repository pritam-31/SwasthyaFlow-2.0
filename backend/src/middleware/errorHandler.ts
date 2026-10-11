import type { NextFunction, Request, Response } from 'express'
import { anonymiseErrorMessage } from '../services/unifiedAnonymizer'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

/** Body-parser / express errors carry `status` + `type` instead of being HttpError. */
interface ParserError {
  status?: number
  statusCode?: number
  type?: string
  message?: string
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId
  const withRequestId = <T extends Record<string, unknown>>(payload: T): T & { requestId?: string } =>
    requestId ? { ...payload, requestId } : payload

  if (err instanceof HttpError) {
    // Never echo raw PII back to the client (P0-7).
    const message = anonymiseErrorMessage(err.message)
    res.status(err.status).json(err.extra ? withRequestId({ error: message, ...err.extra }) : withRequestId({ error: message }))
    return
  }

  // multer (report upload) errors carry a LIMIT_* code instead of a status.
  const multerErr = (err ?? {}) as { code?: string; message?: string }
  if (typeof multerErr.code === 'string' && multerErr.code.startsWith('LIMIT_')) {
    const statuses: Record<string, number> = {
      LIMIT_FILE_SIZE: 413,
      LIMIT_FILE_COUNT: 413,
      LIMIT_UNEXPECTED_FILE: 400,
      LIMIT_PART_COUNT: 413,
      LIMIT_FIELD_KEY: 413,
      LIMIT_FIELD_VALUE: 413,
      LIMIT_FIELD_COUNT: 413,
    }
    res.status(statuses[multerErr.code] ?? 400).json(withRequestId({ error: anonymiseErrorMessage(multerErr.message || 'Upload limit reached.') }))
    return
  }

  const parsed = (err ?? {}) as ParserError
  const status = typeof parsed.status === 'number' ? parsed.status : typeof parsed.statusCode === 'number' ? parsed.statusCode : 500

  // Persistence-layer errors (mongoose / Cloudinary) → clean HTTP semantics.
  const storeErr = (err ?? {}) as { name?: string; code?: number; http_code?: number }
  if (storeErr.name === 'MongoServerError' && storeErr.code === 11000) {
    res.status(409).json(withRequestId({ error: 'A record with that unique value already exists.' }))
    return
  }
  if (storeErr.name === 'ValidationError') {
    res.status(400).json(withRequestId({ error: anonymiseErrorMessage(parsed.message || 'Invalid record.') }))
    return
  }
  if (storeErr.name === 'CastError') {
    res.status(400).json(withRequestId({ error: 'Invalid record identifier.' }))
    return
  }
  if (storeErr.name === 'DocumentNotFoundError') {
    res.status(404).json(withRequestId({ error: 'Record not found.' }))
    return
  }
  if (typeof storeErr.http_code === 'number' && storeErr.http_code >= 400) {
    res.status(502).json(withRequestId({ error: 'Media service is temporarily unavailable.' }))
    return
  }

  if (parsed.type === 'entity.parse.failed' || (err instanceof SyntaxError && status < 500)) {
    res.status(400).json(withRequestId({ error: 'Malformed JSON body.' }))
    return
  }
  if (parsed.type === 'entity.too.large') {
    res.status(413).json(withRequestId({ error: 'Request body too large (limit 1mb).' }))
    return
  }
  if (status >= 400 && status < 500) {
    res.status(status).json(withRequestId({ error: anonymiseErrorMessage(parsed.message || 'Bad request.') }))
    return
  }

  console.error('[api] unhandled error:', err)
  res.status(500).json(withRequestId({ error: 'Internal server error' }))
}
