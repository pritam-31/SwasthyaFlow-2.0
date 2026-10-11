import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authUser, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import type { AuthUser } from '../services/authStore'
import { getSession } from '../services/sessionStore'
import {
  deleteVisual,
  isVisualType,
  locateVisual,
  processVisualUpload,
  redactedImageBytes,
  rejectVisual,
  sessionVisualsView,
  verifyVisual,
  visualDetailView,
} from '../services/visualService'
import type { PatientSession, VisualUploadFile, VisualType } from '../types'

/**
 * Visual input endpoints (P0-2). Mounted at `/api`; route layout mirrors the
 * report endpoints:
 *   GET/POST  /api/sessions/:sessionId/visuals
 *   GET       /api/visuals/:visualId            (JSON detail)
 *   GET       /api/visuals/:visualId/image      (redacted JPEG bytes)
 *   POST      /api/visuals/:visualId/verify     (doctor / admin)
 *   POST      /api/visuals/:visualId/reject     (doctor / admin)
 *   DELETE    /api/visuals/:visualId            (doctor / admin)
 *
 * Hard rules:
 *  - upload: any authenticated role (a patient only on their own session)
 *  - verify / reject / delete: doctor or admin only
 *  - `/image` returns ONLY the redacted JPEG (no-store); the JSON API never
 *    embeds image bytes, and a stranger's photo answers 404.
 */
export const visualsRouter = Router()

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

/** Patients only ever see their own sessions' photos — a stranger's id answers 404. */
function requireSession(req: Request, sessionId: string): { session: PatientSession; user: AuthUser } {
  const user = authUser(req)
  const session = getSession(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (user.role === 'patient' && session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  return { session, user }
}

function toUploadFiles(req: Request): VisualUploadFile[] {
  const files = req.files
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, 'At least one image is required (field name "files").')
  }
  return files.map((f) => ({
    buffer: f.buffer,
    originalName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  }))
}

function declaredType(req: Request): VisualType | undefined {
  const value = typeof req.body?.visualType === 'string' ? req.body.visualType.trim() : ''
  if (!value) return undefined
  if (!isVisualType(value)) {
    throw new HttpError(
      400,
      `Unknown visual type "${value}" — use one of: wound, rash, report-photo, xray, scan, swelling, bruise, eye, oral, ear, general, unknown.`,
    )
  }
  return value
}

function currentView(session: PatientSession, user: AuthUser) {
  const fresh = getSession(session.id)
  if (fresh && !(user.role === 'patient' && fresh.ownerId !== user.id)) return sessionVisualsView(fresh)
  return sessionVisualsView(session)
}

/* ------------------------------------------------------------------ */
/*  /api/sessions/:sessionId/visuals                                    */
/* ------------------------------------------------------------------ */

visualsRouter.get('/sessions/:sessionId/visuals', (req, res) => {
  const { session } = requireSession(req, req.params.sessionId)
  res.json(sessionVisualsView(session))
})

visualsRouter.post(
  '/sessions/:sessionId/visuals',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const { session, user } = requireSession(req, req.params.sessionId)
    const results = await processVisualUpload(session, user, toUploadFiles(req), declaredType(req))
    res.status(201).json({ ...currentView(session, user), processing: results })
  }),
)

/* ------------------------------------------------------------------ */
/*  /api/visuals/:visualId                                             */
/* ------------------------------------------------------------------ */

visualsRouter.get('/visuals/:visualId', (req, res) => {
  const { session, visual } = locateVisual(req.params.visualId, authUser(req))
  res.json({ visual: visualDetailView(session, visual.id) })
})

/** The stored image is ALWAYS the redacted version — nothing raw is served. */
visualsRouter.get('/visuals/:visualId/image', (req, res) => {
  const { visual } = locateVisual(req.params.visualId, authUser(req))
  const { buffer, mimeType } = redactedImageBytes(visual)
  res.setHeader('Content-Type', mimeType)
  res.setHeader('Content-Length', String(buffer.length))
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(buffer)
})

/** Human-in-the-loop: verify the photo descriptions (doctor / admin only). */
visualsRouter.post('/visuals/:visualId/verify', requireRole('doctor'), (req, res) => {
  const { session, visual } = locateVisual(req.params.visualId, authUser(req))
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null
  res.json({ visual: verifyVisual(session, authUser(req), visual.id, note) })
})

/** Human-in-the-loop: reject a wrong / unusable photo (doctor / admin only). */
visualsRouter.post('/visuals/:visualId/reject', requireRole('doctor'), (req, res) => {
  const { session, visual } = locateVisual(req.params.visualId, authUser(req))
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
  res.json({ visual: rejectVisual(session, authUser(req), visual.id, reason) })
})

/** Remove a photo from a session (doctor / admin only). */
visualsRouter.delete('/visuals/:visualId', requireRole('doctor'), (req, res) => {
  const { session, visual } = locateVisual(req.params.visualId, authUser(req))
  const view = deleteVisual(session, authUser(req), visual.id)
  res.json({ deleted: true, fileName: visual.fileName, ...view })
})