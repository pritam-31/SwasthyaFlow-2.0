import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authUser, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import type { AuthUser } from '../services/authStore'
import { getSession } from '../services/sessionStore'
import {
  deleteReport,
  locateReport,
  processReportUpload,
  rejectReport,
  reportDetailView,
  sessionReportsView,
  verifyReport,
} from '../services/reportService'
import type { PatientSession, ReportUploadFile } from '../types'

/**
 * Report upload / verification endpoints (P0-1). Mounted at `/api`; every route
 * pair exists under both `/sessions/:sessionId/reports` and `/reports/:reportId`,
 * plus the upload shortcut `POST /reports` (sessionId in the form body).
 *
 * Hard rules:
 *  - upload: any authenticated role (a patient only on their own session)
 *  - verify / reject / delete: doctor or admin only (`requireRole('doctor')`)
 *  - a report is never destroyed on upload failure — OCR problems are warnings.
 */
export const reportsRouter = Router()

/** 10 MB per file, up to 5 files per request (mirrored in the service guard). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
})

const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next)
  }

/** Patients only ever see their own sessions' reports — a stranger's id answers 404. */
function requireSession(req: Request, sessionId: string): { session: PatientSession; user: AuthUser } {
  const user = authUser(req)
  const session = getSession(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (user.role === 'patient' && session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  return { session, user }
}

function toUploadFiles(req: Request): ReportUploadFile[] {
  const files = req.files
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, 'At least one file is required (field name "files").')
  }
  return files.map((f) => ({
    buffer: f.buffer,
    originalName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  }))
}

function currentView(session: PatientSession, user: AuthUser): ReturnType<typeof sessionReportsView> {
  const fresh = getSession(session.id)
  if (fresh && !(user.role === 'patient' && fresh.ownerId !== user.id)) return sessionReportsView(fresh)
  return sessionReportsView(session)
}

/* ------------------------------------------------------------------ */
/*  /api/sessions/:sessionId/reports                                    */
/* ------------------------------------------------------------------ */

reportsRouter.get('/sessions/:sessionId/reports', (req, res) => {
  const { session } = requireSession(req, req.params.sessionId)
  res.json(sessionReportsView(session))
})

reportsRouter.post(
  '/sessions/:sessionId/reports',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const { session, user } = requireSession(req, req.params.sessionId)
    const results = await processReportUpload(session, user, toUploadFiles(req))
    res.status(201).json({ ...currentView(session, user), processing: results })
  }),
)

/* ------------------------------------------------------------------ */
/*  POST /api/reports — sessionId comes from the multipart form         */
/* ------------------------------------------------------------------ */

reportsRouter.post(
  '/reports',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : ''
    if (!sessionId) throw new HttpError(400, 'A sessionId is required when uploading outside a session route.')
    const { session, user } = requireSession(req, sessionId)
    const results = await processReportUpload(session, user, toUploadFiles(req))
    res.status(201).json({ ...currentView(session, user), processing: results })
  }),
)

/* ------------------------------------------------------------------ */
/*  /api/reports/:reportId                                             */
/* ------------------------------------------------------------------ */

reportsRouter.get('/reports/:reportId', (req, res) => {
  const { session, report } = locateReport(req.params.reportId, authUser(req))
  res.json({ report, merged: reportDetailView(session, report.id).merged })
})

/** Human-in-the-loop: verify the extraction (doctor / admin only). */
reportsRouter.post('/reports/:reportId/verify', requireRole('doctor'), (req, res) => {
  const { session, report } = locateReport(req.params.reportId, authUser(req))
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null
  const { report: verified } = verifyReport(session, authUser(req), report.id, note)
  res.json({ report: verified, merged: reportDetailView(session, report.id).merged })
})

/** Human-in-the-loop: reject a wrong / incomplete extraction (doctor / admin only). */
reportsRouter.post('/reports/:reportId/reject', requireRole('doctor'), (req, res) => {
  const { session, report } = locateReport(req.params.reportId, authUser(req))
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
  const { report: rejected } = rejectReport(session, authUser(req), report.id, reason)
  res.json({ report: rejected, merged: reportDetailView(session, report.id).merged })
})

/** Remove a report from a session (doctor / admin only). */
reportsRouter.delete('/reports/:reportId', requireRole('doctor'), (req, res) => {
  const { session, report } = locateReport(req.params.reportId, authUser(req))
  const view = deleteReport(session, authUser(req), report.id)
  res.json({ deleted: true, fileName: report.fileName, ...view })
})