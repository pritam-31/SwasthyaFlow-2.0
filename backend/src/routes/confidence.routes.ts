import { Router, type Request } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { facilityIdOf, facilityScope } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { rateLimit } from '../middleware/rateLimit'
import { getEffectivePolicy, updateThresholds } from '../services/confidencePolicyService'
import { buildSessionConfidence } from '../services/confidenceService'
import {
  getSessionConfidence,
  getLowConfidenceItems,
  listReviewActions,
  recordReviewAction,
  validateReviewAction,
} from '../services/lowConfidenceService'
import { getSession, updateSession } from '../services/sessionStore'
import { addAudit } from '../services/auditStore'
import type { AuthUser } from '../services/authStore'
import {
  type LowConfidenceItemType,
  type LowConfidenceVerdict,
  type PatientSession,
} from '../types'

/**
 * Confidence + explainability routes (P2-14).
 *
 * Every route is auth + facility-scoped + rate-limited on the sensitive tier.
 * Cross-facility session reads answer 404 (tenants cannot probe ids) and a
 * patient is blocked from staff confidence views. Policy read/write is admin
 * only. Nothing here diagnoses — it only surfaces, explains and records human
 * review of extraction confidence.
 */

export const confidenceRouter = Router()

confidenceRouter.use(requireAuth, facilityScope, rateLimit('sensitive'))

/** Staff-only session scoping: patient → 403, cross-facility → 404. */
function requireStaffSession(req: Request, id: string): { session: PatientSession; user: AuthUser } {
  const user = authUser(req)
  if (user.role === 'patient') throw new HttpError(403, 'This view is for clinical staff.')
  const session = getSession(id)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  return { session, user }
}

/* GET /api/confidence/sessions/:sessionId — full SessionConfidence. */
confidenceRouter.get('/sessions/:sessionId', requireRole('nurse', 'doctor', 'facility-admin'), async (req, res) => {
  const { session } = requireStaffSession(req, String(req.params.sessionId))
  res.json(await getSessionConfidence(session))
})

/* GET /api/confidence/sessions/:sessionId/low — only under-threshold items. */
confidenceRouter.get('/sessions/:sessionId/low', requireRole('nurse', 'doctor', 'facility-admin'), async (req, res) => {
  const { session } = requireStaffSession(req, String(req.params.sessionId))
  res.json(await getLowConfidenceItems(session))
})

/* POST /api/confidence/sessions/:sessionId/low/:itemType/:itemId/review — record a HITL verdict. */
confidenceRouter.post(
  '/sessions/:sessionId/low/:itemType/:itemId/review',
  requireRole('nurse', 'doctor', 'facility-admin'),
  (req, res) => {
    const { session, user } = requireStaffSession(req, String(req.params.sessionId))
    const itemType = String(req.params.itemType)
    const itemId = String(req.params.itemId)
    const body = (req.body ?? {}) as { verdict?: unknown; reason?: unknown }
    const verdict = typeof body.verdict === 'string' ? body.verdict : ''
    const reason = typeof body.reason === 'string' ? body.reason : undefined

    const validation = validateReviewAction(itemType, verdict, reason)
    if (!validation.ok) throw new HttpError(400, validation.errors.join(', '))

    const action = recordReviewAction({
      session,
      itemType: itemType as LowConfidenceItemType,
      itemId,
      verdict: verdict as LowConfidenceVerdict,
      reason,
      actor: { id: user.id, role: user.role },
    })
    res.status(201).json(action)
  },
)

/* GET /api/confidence/sessions/:sessionId/review-actions — audit of human decisions. */
confidenceRouter.get('/sessions/:sessionId/review-actions', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const { session } = requireStaffSession(req, String(req.params.sessionId))
  res.json(listReviewActions(session.id))
})

/* GET /api/confidence/policy — effective thresholds (admin). */
confidenceRouter.get('/policy', requireRole('facility-admin'), async (req, res) => {
  res.json(await getEffectivePolicy(facilityIdOf(req)))
})

/* PATCH /api/confidence/policy — validated threshold update (admin). */
confidenceRouter.patch('/policy', requireRole('facility-admin'), async (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const patch: Record<string, number> = {}
  for (const key of ['lowConfidenceThreshold', 'veryLowConfidenceThreshold', 'aggregateAlertThreshold']) {
    if (body[key] !== undefined) {
      const value = Number(body[key])
      if (!Number.isFinite(value)) throw new HttpError(400, `${key} must be a number.`)
      patch[key] = value
    }
  }
  const updated = await updateThresholds(facilityId, patch, { id: user.id, role: user.role })
  addAudit({
    sessionId: '',
    facilityId,
    actor: user.id,
    role: user.role,
    action: 'confidence.policy-updated',
    detail: `Confidence policy updated for facility ${facilityId}: ${Object.keys(patch).join(', ')}.`,
    category: 'system',
  })
  res.json(updated)
})

/* POST /api/confidence/recompute/:sessionId — recompute on the fly (staff). */
confidenceRouter.post('/recompute/:sessionId', requireRole('nurse', 'doctor', 'facility-admin'), async (req, res) => {
  const { session, user } = requireStaffSession(req, String(req.params.sessionId))
  const policy = await getEffectivePolicy(session.facilityId)
  const confidence = buildSessionConfidence(session, policy.thresholds)
  session.sessionConfidence = confidence
  updateSession(session.id, { sessionConfidence: confidence })
  addAudit({
    sessionId: session.id,
    facilityId: session.facilityId,
    actor: user.id,
    role: user.role,
    action: 'confidence.recompute',
    detail: `Confidence recomputed for session (aggregate ${confidence.aggregate.band}).`,
    category: 'system',
  })
  res.json(confidence)
})
