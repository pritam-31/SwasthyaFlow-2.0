import type { NextFunction, Request, Response } from 'express'
import { dbHealth } from '../db/mongoose'

/**
 * Surfaces database health at `/health` and `/api/health` (P1-9). In-memory
 * mode always reports `ok`; persistent mode reports `degraded` when the Mongo
 * connection has dropped so an orchestrator can act on it.
 */
export function dbHealthReport(): { status: 'ok' | 'degraded'; db: ReturnType<typeof dbHealth> } {
  const db = dbHealth()
  const status = db.enabled && !db.connected ? 'degraded' : 'ok'
  return { status, db }
}

export function dbHealthMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const report = dbHealthReport()
  if (report.status === 'degraded') {
    res.status(503).json(report)
    return
  }
  next()
}
