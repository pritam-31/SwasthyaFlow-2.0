import { Router, type Request } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { rateLimit } from '../middleware/rateLimit'
import { isSystemAdmin } from '../services/authStore'
import { getSessionIncludingDeleted } from '../services/sessionStore'
import { setRetentionSlaDays } from '../services/retentionSlaService'
import {
  getPendingDeletions,
  getPolicyDiff,
  getRetentionExportBuffer,
  getRetentionSlaView,
  getRetentionTimeline,
  getSessionInventory,
  listRetentionExports,
  pruneAuditRange,
  runBulkRetention,
} from '../services/retentionUiService'
import { isRetentionCategory } from '../services/retentionConfig'
import type { BulkRetentionAction, BulkRetentionRequest, RetentionCategory } from '../types'

/**
 * Data & Privacy console API (P2-17).
 *
 *  GET  /sessions/:id/inventory     per-case data inventory     case-scoped
 *  GET  /sessions/:id/timeline      merged retention timeline   case-scoped
 *  GET  /facility/pending           pending deletions           facility-admin
 *  GET  /facility/sla               retention SLA               facility-admin
 *  PATCH /facility/sla              set SLA days                facility-admin
 *  GET  /facility/policy-diff       facility vs global policy   facility-admin
 *  GET  /facility/exports           stored exports              facility-admin
 *  GET  /exports/:ref               download an export          doctor/admin
 *  POST /bulk                       bulk retention              facility-admin
 *  POST /prune-audit                chain-preserving prune      system-admin
 */
export const retentionUiRouter = Router()

function requireCaseSession(req: Request, id: string): void {
  const user = authUser(req)
  const session = getSessionIncludingDeleted(id)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  if (user.role === 'patient' && session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
}

retentionUiRouter.get('/sessions/:id/inventory', (req, res) => {
  requireCaseSession(req, req.params.id)
  res.json({ inventory: getSessionInventory(req.params.id, facilityIdOf(req)) })
})

retentionUiRouter.get('/sessions/:id/timeline', (req, res) => {
  requireCaseSession(req, req.params.id)
  res.json({ timeline: getRetentionTimeline(req.params.id, facilityIdOf(req)) })
})

retentionUiRouter.get('/facility/pending', requireRole('facility-admin'), (req, res) => {
  res.json({ pending: getPendingDeletions(facilityIdOf(req)) })
})

retentionUiRouter.get('/facility/sla', requireRole('facility-admin'), (req, res) => {
  res.json({ sla: getRetentionSlaView(facilityIdOf(req)) })
})

retentionUiRouter.patch('/facility/sla', requireRole('facility-admin'), (req, res) => {
  const days = req.body?.slaDays
  if (typeof days !== 'number') throw new HttpError(400, 'slaDays must be a number.')
  try {
    const slaDays = setRetentionSlaDays(facilityIdOf(req), days)
    res.json({ sla: getRetentionSlaView(facilityIdOf(req)), slaDays })
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'Invalid SLA value.')
  }
})

retentionUiRouter.get('/facility/policy-diff', requireRole('facility-admin'), (req, res) => {
  res.json({ diff: getPolicyDiff(facilityIdOf(req)) })
})

retentionUiRouter.get('/facility/exports', requireRole('facility-admin'), (req, res) => {
  res.json({ exports: listRetentionExports(facilityIdOf(req)) })
})

retentionUiRouter.get('/exports/:ref', requireRole('doctor', 'facility-admin'), (req, res) => {
  const buffer = getRetentionExportBuffer(req.params.ref)
  if (!buffer) throw new HttpError(404, 'Export not found — exports are purged after 1 day.')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.ref}.json"`)
  res.send(buffer)
})

const BULK_ACTIONS: readonly BulkRetentionAction[] = ['run-now', 'export', 'extend', 'anonymise', 'soft-delete']

function readBulkRequest(body: unknown): BulkRetentionRequest {
  const input = (body ?? {}) as Record<string, unknown>
  const action = input.action as BulkRetentionAction
  if (!BULK_ACTIONS.includes(action)) {
    throw new HttpError(400, `action must be one of: ${BULK_ACTIONS.join(', ')}.`)
  }
  const rawCategory = input.category
  const category: RetentionCategory | 'all' = rawCategory === 'all' || rawCategory === undefined ? 'all' : (rawCategory as RetentionCategory)
  if (category !== 'all' && !isRetentionCategory(category)) {
    throw new HttpError(400, `category must be "all" or a known retention category.`)
  }
  const sessionIds = Array.isArray(input.sessionIds) ? input.sessionIds.filter((id): id is string => typeof id === 'string') : []
  const extraDays = typeof input.extraDays === 'number' ? input.extraDays : undefined
  return { action, category, sessionIds, ...(extraDays !== undefined ? { extraDays } : {}) }
}

retentionUiRouter.post('/bulk', rateLimit('sensitive'), requireRole('facility-admin'), (req, res) => {
  const user = authUser(req)
  const request = readBulkRequest(req.body)
  const result = runBulkRetention(request, { name: user.displayName, role: user.role }, facilityIdOf(req))
  res.json({ result })
})

retentionUiRouter.post('/prune-audit', rateLimit('sensitive'), (req, res) => {
  const user = authUser(req)
  if (!isSystemAdmin(user.role)) throw new HttpError(403, 'Pruning the audit trail requires a system administrator.')
  const before = req.body?.before
  if (typeof before !== 'string' || !before.trim()) throw new HttpError(400, 'before (ISO date) is required.')
  const result = pruneAuditRange({ before }, { name: user.displayName, role: user.role }, facilityIdOf(req))
  res.json({ result })
})
