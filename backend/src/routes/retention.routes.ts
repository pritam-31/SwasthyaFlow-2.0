import { Router } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { getRetentionPolicy } from '../services/retentionConfig'
import { getStoredSessionExport } from '../services/retentionExportService'
import { getRetentionStatus, listRetentionActions, runRetentionJob, saveRetentionPolicy } from '../services/retentionService'
import { listTombstones } from '../services/tombstoneStore'
import type { RetentionMode } from '../types'

/**
 * Facility-wide retention API (P0-6).
 *
 *  GET    /policy        read the policy            doctor / admin
 *  PUT    /policy        edit rules (days, enabled) admin only
 *  GET    /status        inventory + what is due    admin
 *  GET    /actions       retention history          doctor / admin
 *  GET    /tombstones    deletion proof             admin
 *  POST   /run           run a sweep now            admin
 *  GET    /exports/:id   download a stored export   doctor / admin
 *
 * Per-case routes (consent, export, delete, extend) live under /api/sessions.
 */
export const retentionRouter = Router()

retentionRouter.get('/policy', requireRole('doctor'), (_req, res) => {
  res.json({ policy: getRetentionPolicy() })
})

retentionRouter.put('/policy', requireRole('admin'), (req, res) => {
  const actor = authUser(req)
  const rules = req.body?.rules
  if (!Array.isArray(rules)) throw new HttpError(400, 'rules must be an array of { category, retentionDays, enabled }.')
  const policy = saveRetentionPolicy(rules, { name: actor.displayName, role: actor.role })
  res.json({ policy })
})

retentionRouter.get('/status', requireRole('admin'), (_req, res) => {
  res.json({ status: getRetentionStatus(), policy: getRetentionPolicy() })
})

retentionRouter.get('/actions', requireRole('doctor'), (_req, res) => {
  res.json({ actions: listRetentionActions() })
})

retentionRouter.get('/tombstones', requireRole('admin'), (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined
  res.json({ tombstones: sessionId ? listTombstones({ sessionId }) : listTombstones() })
})

retentionRouter.post('/run', requireRole('admin'), (req, res) => {
  const actor = authUser(req)
  const mode: RetentionMode = req.body?.mode === 'anonymise' ? 'anonymise' : 'delete'
  const result = runRetentionJob({ actor: { name: actor.displayName, role: actor.role }, mode })
  res.json({ result })
})

retentionRouter.get('/exports/:exportId', requireRole('doctor'), (req, res) => {
  const payload = getStoredSessionExport(req.params.exportId)
  if (!payload) throw new HttpError(404, 'Export not found — exports are purged after 1 day.')
  res.json({ export: payload })
})
