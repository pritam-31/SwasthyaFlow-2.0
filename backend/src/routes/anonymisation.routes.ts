import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authUser, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import type { AuthUser } from '../services/authStore'
import type { SupportedLanguage } from '../types/language.types'
import type { ReviewerVerdict } from '../types/anonymisation.types'
import { isPIIModality, runPipeline } from '../services/anonymisationPipeline'
import {
  aggregateForSession,
  deleteReport,
  getMetrics,
  getReport,
  listReports,
  scrubRaw,
} from '../services/anonymisationReportService'
import { getFeedbackMetrics, listFeedback, submitFeedback, suggestPatternImprovement } from '../services/reviewerFeedbackService'
import { runLeakTests } from '../services/anonymisationTestHarness'
import { patternInventory } from '../services/piiPatterns'

/**
 * Anonymisation API (P0-7).
 *
 *  POST   /preview                      preview redaction of free text        any authenticated user
 *  POST   /image                        preview redaction of an image         doctor / admin
 *  POST   /run                          run a modality through the pipeline   doctor / admin
 *  GET    /reports                      list stored reports (filter session)  doctor / admin
 *  GET    /reports/:reportId            one report (raw stripped)             doctor / admin
 *  DELETE /reports/:reportId            delete a report                       admin
 *  GET    /sessions/:sessionId/report   aggregated per-case coverage          doctor / admin
 *  POST   /feedback                     reviewer verdict on a match           doctor / admin
 *  GET    /feedback                     feedback list + pattern hints         doctor / admin
 *  GET    /metrics                      coverage / feedback metrics           admin
 *  GET    /patterns                     pattern inventory (counts only)       admin
 *  POST   /leak-tests                   run the synthetic PII leak corpus     admin
 *
 * Every response passes stored reports through `scrubRaw` first, so the internal
 * `raw` match text never leaves the process.
 */
export const anonymisationRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next)
  }

const LANGUAGES: SupportedLanguage[] = ['en', 'hi', 'or']

function asLanguage(value: unknown): SupportedLanguage | undefined {
  return typeof value === 'string' && (LANGUAGES as string[]).includes(value) ? (value as SupportedLanguage) : undefined
}

function actorOf(user: AuthUser): { id: string; username: string; role: AuthUser['role'] } {
  return { id: user.id, username: user.username, role: user.role }
}

/* ------------------------------------------------------------------ */
/*  Preview / run                                                      */
/* ------------------------------------------------------------------ */

anonymisationRouter.post(
  '/preview',
  asyncHandler(async (req, res) => {
    const user = authUser(req)
    const text = req.body?.text
    const result = await runPipeline({
      modality: 'intake-text',
      text: typeof text === 'string' ? text : '',
      language: asLanguage(req.body?.language),
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      actor: actorOf(user),
    })
    res.json({ text: result.text, report: scrubRaw(result.report) })
  }),
)

anonymisationRouter.post(
  '/image',
  requireRole('doctor'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const user = authUser(req)
    const file = req.file
    if (!file) throw new HttpError(400, 'An image file is required (field name "image").')
    const result = await runPipeline({
      modality: 'visual-ocr',
      imageBuffer: file.buffer,
      language: asLanguage(req.body?.language),
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      actor: actorOf(user),
    })
    res.json({
      report: scrubRaw(result.report),
      redactedImage: result.anonymisedImageBuffer?.toString('base64'),
    })
  }),
)

anonymisationRouter.post(
  '/run',
  requireRole('doctor'),
  asyncHandler(async (req, res) => {
    const user = authUser(req)
    const modality = req.body?.modality
    if (!isPIIModality(modality)) throw new HttpError(400, 'A valid modality is required.')
    const result = await runPipeline({
      modality,
      text: typeof req.body?.text === 'string' ? req.body.text : '',
      language: asLanguage(req.body?.language),
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      actor: actorOf(user),
    })
    res.json({ text: result.text, report: scrubRaw(result.report) })
  }),
)

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

anonymisationRouter.get('/reports', requireRole('doctor'), (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined
  res.json({ reports: listReports(sessionId).map(scrubRaw) })
})

anonymisationRouter.get('/reports/:reportId', requireRole('doctor'), (req, res) => {
  const report = getReport(req.params.reportId)
  if (!report) throw new HttpError(404, 'Anonymisation report not found.')
  res.json({ report: scrubRaw(report) })
})

anonymisationRouter.delete('/reports/:reportId', requireRole('admin'), (req, res) => {
  deleteReport(req.params.reportId, actorOf(authUser(req)))
  res.json({ ok: true })
})

anonymisationRouter.get('/sessions/:sessionId/report', requireRole('doctor'), (req, res) => {
  res.json({ report: scrubRaw(aggregateForSession(req.params.sessionId)) })
})

/* ------------------------------------------------------------------ */
/*  Reviewer feedback                                                  */
/* ------------------------------------------------------------------ */

const VERDICTS: ReviewerVerdict[] = ['false-positive', 'false-negative', 'correct']

anonymisationRouter.post('/feedback', requireRole('doctor'), (req, res) => {
  const user = authUser(req)
  const verdict = req.body?.verdict
  if (!VERDICTS.includes(verdict)) throw new HttpError(400, 'verdict must be correct | false-positive | false-negative.')
  const reportId = req.body?.reportId
  const modality = req.body?.modality
  if (typeof reportId !== 'string' || !isPIIModality(modality)) {
    throw new HttpError(400, 'reportId and a valid modality are required.')
  }
  const matchIndex = Number(req.body?.matchIndex)
  if (!Number.isInteger(matchIndex) || matchIndex < 0) throw new HttpError(400, 'matchIndex must be a non-negative integer.')
  const feedback = submitFeedback(
    {
      reportId,
      modality,
      matchIndex,
      verdict,
      note: typeof req.body?.note === 'string' ? req.body.note : undefined,
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      actorId: user.id,
      actorRole: user.role,
    },
    actorOf(user),
  )
  res.json({ feedback })
})

anonymisationRouter.get('/feedback', requireRole('doctor'), (req, res) => {
  const reportId = typeof req.query.reportId === 'string' ? req.query.reportId : undefined
  res.json({ feedback: listFeedback(reportId), metrics: getFeedbackMetrics(), suggestions: suggestPatternImprovement() })
})

/* ------------------------------------------------------------------ */
/*  Metrics / diagnostics                                              */
/* ------------------------------------------------------------------ */

anonymisationRouter.get('/metrics', requireRole('admin'), (_req, res) => {
  res.json({ metrics: getMetrics() })
})

anonymisationRouter.get('/patterns', requireRole('admin'), (_req, res) => {
  res.json({ inventory: patternInventory() })
})

anonymisationRouter.post('/leak-tests', requireRole('admin'), (_req, res) => {
  res.json({ result: runLeakTests() })
})
