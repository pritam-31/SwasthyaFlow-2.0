import { Router } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { addAudit } from '../services/auditStore'
import { getSession } from '../services/sessionStore'
import {
  aiServiceConfigured,
  aiServiceHealth,
  buildPayloadFromSession,
  predictSeverityForSession,
  predictSeverityPayload,
  submitSeverityOverride,
  type AiPatientPayload,
  type TriageLevel,
} from '../services/aiTriageService'

export const aiTriageRouter = Router()

const CLINICAL_ROLES = ['nurse', 'doctor', 'facility-admin'] as const
const FALLBACK_LEVELS: TriageLevel[] = ['LOW', 'MODERATE', 'URGENT', 'CRITICAL']

function readBody(req: { body?: unknown }): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>
}

/**
 * POST /api/ai-triage/predict-severity
 *
 * Two modes:
 *   { "sessionId": "sess-..." }  -> pull the stored session and run the AI.
 *   { "patient": { ...raw contract... } } -> evaluate a direct patient payload.
 *
 * The AI service output is decision support only; a clinician confirms/overrides.
 */
aiTriageRouter.post('/predict-severity', requireRole(...CLINICAL_ROLES), async (req, res) => {
  const body = readBody(req)
  const user = authUser(req)
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''

  if (sessionId) {
    const session = getSession(sessionId)
    if (!session) throw new HttpError(404, 'Session not found.')
    if (session.facilityId !== facilityIdOf(req)) {
      throw new HttpError(404, 'Session not found.')
    }
    const result = await predictSeverityForSession(session)
    addAudit({
      sessionId: session.id,
      facilityId: session.facilityId,
      actor: user.displayName,
      role: user.role,
      action: 'ai-triage.predicted',
      detail: `AI severity ${result.severityScore} (${result.triageLevel}) via ${result.source}.`,
      category: 'decision',
    })
    return res.json({ result })
  }

  // Direct payload mode requires the AI service to be reachable.
  const patient = body.patient ?? body
  if (typeof patient !== 'object' || patient === null) {
    throw new HttpError(400, 'A sessionId or a patient payload object is required.')
  }
  if (!aiServiceConfigured()) {
    throw new HttpError(503, 'AI service is not configured (set AI_SERVICE_URL), and no sessionId was supplied for fallback.')
  }
  try {
    const result = await predictSeverityPayload(patient as AiPatientPayload)
    addAudit({
      sessionId: 'ai-triage',
      actor: user.displayName,
      role: user.role,
      action: 'ai-triage.predicted',
      detail: `Direct AI severity ${result.severityScore} (${result.triageLevel}).`,
      category: 'decision',
    })
    return res.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    throw new HttpError(502, `AI service call failed: ${message}`)
  }
})

/**
 * POST /api/ai-triage/override
 * Doctor confirms or overrides the AI level. Recorded as feedback for retraining.
 */
aiTriageRouter.post('/override', requireRole(...CLINICAL_ROLES), async (req, res) => {
  const body = readBody(req)
  const user = authUser(req)
  const doctorLevel = typeof body.doctorLevel === 'string' ? body.doctorLevel.toUpperCase() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!FALLBACK_LEVELS.includes(doctorLevel as TriageLevel)) {
    throw new HttpError(400, `doctorLevel must be one of ${FALLBACK_LEVELS.join(', ')}.`)
  }
  if (!reason) throw new HttpError(400, 'A reason is required for an override.')

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined
  if (sessionId) {
    const session = getSession(sessionId)
    if (!session || session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  }

  try {
    const result = await submitSeverityOverride({
      predictionId: typeof body.predictionId === 'string' ? body.predictionId : null,
      patientId: typeof body.patientId === 'string' ? body.patientId : undefined,
      sessionId,
      doctorLevel: doctorLevel as TriageLevel,
      reason,
      doctorId: user.id,
      doctorRole: user.role,
      aiSeverityScore: typeof body.aiSeverityScore === 'number' ? body.aiSeverityScore : undefined,
      aiTriageLevel: typeof body.aiTriageLevel === 'string' ? body.aiTriageLevel : undefined,
      features: typeof body.features === 'object' && body.features !== null ? (body.features as Record<string, unknown>) : {},
    })
    addAudit({
      sessionId: sessionId ?? 'ai-triage',
      actor: user.displayName,
      role: user.role,
      action: 'ai-triage.override',
      detail: `Doctor set level ${doctorLevel} (${result.agreement ? 'agreed' : 'overrode'}).`,
      category: 'decision',
    })
    return res.status(201).json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    throw new HttpError(502, `AI service override failed: ${message}`)
  }
})

/** GET /api/ai-triage/status — is the AI service configured and reachable? */
aiTriageRouter.get('/status', requireRole(...CLINICAL_ROLES), async (_req, res) => {
  const health = await aiServiceHealth()
  res.json({
    configured: health.configured,
    reachable: health.reachable,
    detail: health.detail ?? null,
    fallbackAvailable: true,
  })
})

/**
 * GET /api/ai-triage/session/:sessionId/payload
 * Returns the exact payload that would be sent to the AI service (transparency).
 */
aiTriageRouter.get('/session/:sessionId/payload', requireRole(...CLINICAL_ROLES), (req, res) => {
  const session = getSession(req.params.sessionId)
  if (!session || session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  res.json({ payload: buildPayloadFromSession(session) })
})
