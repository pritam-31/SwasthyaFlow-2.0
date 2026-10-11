import { Router, type Request } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { facilityIdOf, facilityScope } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { rateLimit } from '../middleware/rateLimit'
import {
  deleteFeedback,
  exportFeedback,
  getFeedback,
  listFeedback,
  submitFeedback,
  updateFeedback,
  validateFeedbackCreate,
  validateFeedbackUpdate,
} from '../services/feedbackService'
import { aggregateFeedback, buildFeedbackDashboard } from '../services/feedbackAggregationService'
import { addAudit } from '../services/auditStore'
import { getSession } from '../services/sessionStore'
import {
  isFeedbackReasonCode,
  isFeedbackSeverity,
  isFeedbackStatus,
  isFeedbackTargetType,
  isFeedbackVerdict,
  type FeedbackFilter,
} from '../types/feedback.types'
import { isLayerId } from '../types/modelcard.types'

/**
 * Clinician feedback loop routes (P2-15).
 *
 * Feedback is workflow-quality evidence only — it never auto-applies to a rule,
 * threshold or score, and every write is audited. Clinical staff (nurse / doctor
 * / facility-admin) submit and read it; the aggregate dashboard and export are
 * facility-admin only. Patients are blocked. Every read/write is facility-scoped.
 */
export const feedbackRouter = Router()

feedbackRouter.use(requireAuth, facilityScope, rateLimit('sensitive'))

function userIdOf(user: { id: string; displayName?: string }): { id: string; name: string } {
  return { id: user.id, name: user.displayName ?? user.id }
}

/** Resolves a case in the caller's facility; a cross-facility read is a 404. */
function requireSession(req: Request, sessionId: string): void {
  const session = getSession(sessionId)
  if (!session || session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
}

function readFilter(req: Request): FeedbackFilter {
  const q = req.query
  const filter: FeedbackFilter = {}
  const str = (key: string): string | undefined => (typeof q[key] === 'string' ? (q[key] as string) : undefined)
  const sessionId = str('sessionId')
  if (sessionId) filter.sessionId = sessionId
  const targetType = str('targetType')
  if (targetType && isFeedbackTargetType(targetType)) filter.targetType = targetType
  const layerId = str('layerId')
  if (layerId && isLayerId(layerId)) filter.layerId = layerId
  const verdict = str('verdict')
  if (verdict && isFeedbackVerdict(verdict)) filter.verdict = verdict
  const reasonCode = str('reasonCode')
  if (reasonCode && isFeedbackReasonCode(reasonCode)) filter.reasonCode = reasonCode
  const severity = str('severity')
  if (severity && isFeedbackSeverity(severity)) filter.severity = severity
  const status = str('status')
  if (status && isFeedbackStatus(status)) filter.status = status
  const actorId = str('actorId')
  if (actorId) filter.actorId = actorId
  const since = str('since')
  if (since) filter.since = since
  const until = str('until')
  if (until) filter.until = until
  return filter
}

/* --- Static paths (declared before /:id so they are never shadowed) --- */

/* GET /api/feedback/dashboard — facility-wide rollup (facility-admin). */
feedbackRouter.get('/dashboard', requireRole('facility-admin'), (req, res) => {
  const facilityId = facilityIdOf(req)
  const user = authUser(req)
  addAudit({
    sessionId: 'feedback',
    facilityId,
    actor: user.id,
    role: user.role,
    action: 'feedback.aggregate-viewed',
    detail: 'Feedback dashboard viewed.',
    category: 'view',
  })
  res.json(buildFeedbackDashboard(facilityId))
})

/* GET /api/feedback/aggregate — rolled-up evidence (facility-admin). */
feedbackRouter.get('/aggregate', requireRole('facility-admin'), (req, res) => {
  const facilityId = facilityIdOf(req)
  const user = authUser(req)
  const since = typeof req.query.since === 'string' ? req.query.since : undefined
  const until = typeof req.query.until === 'string' ? req.query.until : undefined
  addAudit({
    sessionId: 'feedback',
    facilityId,
    actor: user.id,
    role: user.role,
    action: 'feedback.aggregate-viewed',
    detail: 'Feedback aggregate viewed.',
    category: 'view',
  })
  res.json(aggregateFeedback(facilityId, { since, until }))
})

/* POST /api/feedback/export — portable copy of a facility's feedback (facility-admin). */
feedbackRouter.post('/export', requireRole('facility-admin'), (req, res) => {
  const facilityId = facilityIdOf(req)
  const user = authUser(req)
  const body = (req.body ?? {}) as { sessionId?: unknown; since?: unknown; until?: unknown }
  const input: { sessionId?: string; since?: string; until?: string; actor: { id: string; name: string; role: typeof user.role } } = {
    actor: { ...userIdOf(user), role: user.role },
  }
  if (typeof body.sessionId === 'string' && body.sessionId) input.sessionId = body.sessionId
  if (typeof body.since === 'string' && body.since) input.since = body.since
  if (typeof body.until === 'string' && body.until) input.until = body.until
  res.json(exportFeedback(facilityId, input))
})

/* GET /api/feedback/sessions/:sessionId — feedback recorded against one case (staff). */
feedbackRouter.get('/sessions/:sessionId', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const sessionId = String(req.params.sessionId)
  requireSession(req, sessionId)
  res.json(listFeedback(facilityIdOf(req), { sessionId }))
})

/* --- Collection --- */

/* GET /api/feedback — facility feedback list (staff). */
feedbackRouter.get('/', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  res.json(listFeedback(facilityIdOf(req), readFilter(req)))
})

/* POST /api/feedback — record a verdict (staff). */
feedbackRouter.post('/', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const validation = validateFeedbackCreate(body)
  if (!validation.ok) throw new HttpError(400, 'Invalid feedback.', { fields: validation.errors })
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null
  if (sessionId) requireSession(req, sessionId)
  const feedback = submitFeedback({
    facilityId,
    sessionId,
    targetType: String(body.targetType),
    targetId: String(body.targetId),
    targetLabel: typeof body.targetLabel === 'string' ? body.targetLabel : null,
    layerId: typeof body.layerId === 'string' ? body.layerId : null,
    verdict: String(body.verdict),
    reasonCode: String(body.reasonCode),
    reasonText: typeof body.reasonText === 'string' ? body.reasonText : null,
    severity: typeof body.severity === 'string' ? body.severity : undefined,
    suggestedFix: typeof body.suggestedFix === 'string' ? body.suggestedFix : null,
    actor: { id: user.id, role: user.role },
  })
  res.status(201).json(feedback)
})

/* --- Item (declared last) --- */

/* GET /api/feedback/:id — one item (staff). */
feedbackRouter.get('/:id', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const feedback = getFeedback(facilityIdOf(req), String(req.params.id))
  if (!feedback) throw new HttpError(404, 'Feedback not found.')
  res.json(feedback)
})

/* PATCH /api/feedback/:id — edit a verdict (own feedback or a facility-admin). */
feedbackRouter.patch('/:id', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const validation = validateFeedbackUpdate(body)
  if (!validation.ok) throw new HttpError(400, 'Invalid feedback update.', { fields: validation.errors })
  const facilityId = facilityIdOf(req)
  const existing = getFeedback(facilityId, String(req.params.id))
  if (!existing) throw new HttpError(404, 'Feedback not found.')
  const user = authUser(req)
  const isAdmin = user.role === 'facility-admin' || user.role === 'admin' || user.role === 'system-admin'
  if (!isAdmin && existing.actorId !== user.id) throw new HttpError(403, 'You may only edit your own feedback.')
  const updated = updateFeedback(
    facilityId,
    existing.id,
    {
      verdict: typeof body.verdict === 'string' ? body.verdict : undefined,
      reasonCode: typeof body.reasonCode === 'string' ? body.reasonCode : undefined,
      reasonText: body.reasonText === undefined ? undefined : typeof body.reasonText === 'string' ? body.reasonText : null,
      severity: typeof body.severity === 'string' ? body.severity : undefined,
      suggestedFix: typeof body.suggestedFix === 'string' ? body.suggestedFix : body.suggestedFix === null ? null : undefined,
      targetLabel: typeof body.targetLabel === 'string' ? body.targetLabel : undefined,
    },
    { id: user.id, role: user.role },
  )
  res.json(updated)
})

/* DELETE /api/feedback/:id — withdraw a verdict (own feedback or a facility-admin). */
feedbackRouter.delete('/:id', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const facilityId = facilityIdOf(req)
  const existing = getFeedback(facilityId, String(req.params.id))
  if (!existing) throw new HttpError(404, 'Feedback not found.')
  const user = authUser(req)
  const isAdmin = user.role === 'facility-admin' || user.role === 'admin' || user.role === 'system-admin'
  if (!isAdmin && existing.actorId !== user.id) throw new HttpError(403, 'You may only withdraw your own feedback.')
  res.json(deleteFeedback(facilityId, existing.id, { id: user.id, role: user.role }))
})

/* GET /api/feedback/:id is declared last; keep static + nested paths above. */
