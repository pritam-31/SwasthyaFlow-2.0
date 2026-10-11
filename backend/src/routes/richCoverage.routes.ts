import { Router, type NextFunction, type Request, type Response } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { addAudit } from '../services/auditStore'
import { listBodyRegions } from '../services/bodyRegionService'
import {
  buildCaseSummaryOnePager,
  buildShiftHandoverReport,
  listSlaBreachNotifications,
} from '../services/richReportingService'
import { getSession, listSessionsForFacility } from '../services/sessionStore'
import { buildTriageSummaryPdf, getStoredTriageSummaryPdfBytes } from '../services/triageSummaryPdfService'
import { getVoiceIntakeMetrics, recordVoiceIntakeMetrics } from '../services/voiceMetricsService'
import type { PatientSession, PriorityBand, SupportedLanguage } from '../types'

/**
 * Rich coverage read/report endpoints (P2-18 items I / J / O / U / V / W).
 *
 * Every route is facility-scoped (cross-facility ids answer 404), RBAC-gated for
 * clinical staff, and audit-logged. Nothing computed here is clinical: priority
 * bands and urgency labels are workflow concepts, and every payload carries the
 * non-diagnostic disclaimer.
 */

export const richCoverageRouter = Router()

const STAFF_ROLES = ['nurse', 'doctor', 'admin', 'facility-admin', 'system-admin'] as const
const LANG_CODES: SupportedLanguage[] = ['en', 'hi', 'or']
const BANDS: PriorityBand[] = ['critical', 'high', 'medium', 'low', 'routine']

const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next)
  }

function requireStaffSession(req: Request, id: string): PatientSession {
  const user = authUser(req)
  const session = getSession(id)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  // Staff-only endpoints: never expose a patient's own case through these reports.
  if (user.role === 'patient') throw new HttpError(403, 'Clinical staff only.')
  return session
}

function readOptionalLanguage(value: unknown): SupportedLanguage | undefined {
  if (value === undefined || value === '') return undefined
  if (!LANG_CODES.includes(value as SupportedLanguage)) throw new HttpError(400, 'language must be en, hi or or.')
  return value as SupportedLanguage
}

function readBandList(value: unknown): PriorityBand[] | undefined {
  if (value === undefined || value === '') return undefined
  const raw = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (raw.length === 0) return undefined
  for (const band of raw) {
    if (!BANDS.includes(band as PriorityBand)) throw new HttpError(400, `band must be one of: ${BANDS.join(', ')}.`)
  }
  return raw as PriorityBand[]
}

/* ------------------------------------------------------------------ */
/*  W — Case summary one-pager                                         */
/* ------------------------------------------------------------------ */

richCoverageRouter.get('/sessions/:id/case-summary', requireRole(...STAFF_ROLES), (req, res) => {
  const session = requireStaffSession(req, req.params.id)
  const user = authUser(req)
  const summary = buildCaseSummaryOnePager(session, {
    generatedBy: user.displayName,
    language: readOptionalLanguage(req.query.language),
  })
  addAudit({
    facilityId: session.facilityId,
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'case.summary-viewed',
    detail: `Case one-pager viewed (band ${summary.priorityBand}).`,
    category: 'view',
  })
  res.json({ summary })
})

/* ------------------------------------------------------------------ */
/*  O — Triage summary PDF                                             */
/* ------------------------------------------------------------------ */

richCoverageRouter.post(
  '/sessions/:id/summary-pdf',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const session = requireStaffSession(req, req.params.id)
    const user = authUser(req)
    const pdf = await buildTriageSummaryPdf(
      session.id,
      { name: user.displayName, role: user.role },
      readOptionalLanguage(req.body?.language),
    )
    res.status(201).json({ pdf })
  }),
)

richCoverageRouter.get('/sessions/:id/summary-pdf/:ref', requireRole(...STAFF_ROLES), (req, res) => {
  const session = requireStaffSession(req, req.params.id)
  const bytes = getStoredTriageSummaryPdfBytes(req.params.ref, session.id)
  if (!bytes) throw new HttpError(404, 'Summary PDF not found.')
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="triage-summary-${session.id}.pdf"`)
  res.send(bytes)
})

/* ------------------------------------------------------------------ */
/*  V — Shift handover                                                 */
/* ------------------------------------------------------------------ */

richCoverageRouter.get('/shift-handover', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const report = buildShiftHandoverReport({
    facilityId,
    generatedBy: user.displayName,
    sessions: listSessionsForFacility(facilityId),
    filter: {
      assignedTo: typeof req.query.assignedTo === 'string' && req.query.assignedTo.trim() ? req.query.assignedTo.trim() : undefined,
      band: readBandList(req.query.band),
      language: readOptionalLanguage(req.query.language),
    },
    language: readOptionalLanguage(req.query.uiLanguage),
  })
  addAudit({
    facilityId,
    sessionId: 'shift-handover',
    actor: user.displayName,
    role: user.role,
    action: 'shift.handover-viewed',
    detail: `Shift-handover report viewed (${report.totalCases} case(s)).`,
    category: 'view',
  })
  res.json({ report })
})

/* ------------------------------------------------------------------ */
/*  U — SLA breach notifications (in-app only)                         */
/* ------------------------------------------------------------------ */

richCoverageRouter.get('/sla/notifications', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const notifications = listSlaBreachNotifications(listSessionsForFacility(facilityId))
  addAudit({
    facilityId,
    sessionId: 'sla-notifications',
    actor: user.displayName,
    role: user.role,
    action: 'sla.notifications-viewed',
    detail: `SLA breach inbox viewed (${notifications.length} breach(es)).`,
    category: 'view',
  })
  res.json({ notifications, count: notifications.length })
})

/* ------------------------------------------------------------------ */
/*  J — Body-region diagram                                            */
/* ------------------------------------------------------------------ */

richCoverageRouter.get('/body-regions', (req, res) => {
  const view = req.query.view === 'front' || req.query.view === 'back' ? req.query.view : undefined
  res.json({ regions: listBodyRegions(view) })
})

/* ------------------------------------------------------------------ */
/*  I — Voice intake metrics                                           */
/* ------------------------------------------------------------------ */

richCoverageRouter.post('/sessions/:id/voice-metrics', requireRole(...STAFF_ROLES), (req, res) => {
  const session = requireStaffSession(req, req.params.id)
  const user = authUser(req)
  const body = req.body ?? {}
  const metrics = recordVoiceIntakeMetrics({
    sessionId: session.id,
    durationMs: Number(body.durationMs),
    languageDetected: readOptionalLanguage(body.languageDetected) ?? 'en',
    transcriptLength: Number(body.transcriptLength),
    confidence: Number(body.confidence),
    recordedBy: user.displayName,
  })
  addAudit({
    facilityId: session.facilityId,
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'voice.metrics-recorded',
    detail: `Voice intake metrics recorded (${metrics.durationMs}ms, ${metrics.languageDetected}).`,
    category: 'edit',
  })
  res.status(201).json({ metrics })
})

richCoverageRouter.get('/sessions/:id/voice-metrics', requireRole(...STAFF_ROLES), (req, res) => {
  const session = requireStaffSession(req, req.params.id)
  res.json({ metrics: getVoiceIntakeMetrics(session.id) ?? null })
})
