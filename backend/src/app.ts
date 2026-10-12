import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { requireAuth } from './middleware/auth'
import { csrfProtection } from './middleware/csrf'
import { facilityScope } from './middleware/facilityScope'
import { anomalyDetection } from './middleware/anomalyDetection'
import { errorHandler, notFound } from './middleware/errorHandler'
import { inputValidation } from './middleware/inputValidation'
import { ipAllowlist } from './middleware/ipAllowlist'
import { rateLimit } from './middleware/rateLimit'
import { requestId } from './middleware/requestId'
import { securityHeaders } from './middleware/securityHeaders'
import { applyTrustProxy } from './middleware/trustProxy'
import { anonymisationRouter } from './routes/anonymisation.routes'
import { auditRouter } from './routes/audit.routes'
import { authRouter } from './routes/auth.routes'
import { biasRouter } from './routes/bias.routes'
import { consentRouter } from './routes/consent.routes'
import { retentionUiRouter } from './routes/retentionUi.routes'
import { modelCardRouter } from './routes/modelcard.routes'
import { securityRouter } from './routes/security.routes'
import { confidenceRouter } from './routes/confidence.routes'
import { feedbackRouter } from './routes/feedback.routes'
import { dbHealthMiddleware, dbHealthReport } from './middleware/dbHealth'
import { idempotency } from './middleware/idempotency'
import { offlineOrigin } from './middleware/offlineOrigin'
import { facilitiesRouter } from './routes/facilities.routes'
import { languageRouter } from './routes/language.routes'
import { syncRouter } from './routes/sync.routes'
import { reportsRouter } from './routes/reports.routes'
import { retentionRouter } from './routes/retention.routes'
import { queueRouter } from './routes/queue.routes'
import { queueStreamRouter } from './routes/queueStream.routes'
import { richCoverageRouter } from './routes/richCoverage.routes'
import { sessionsRouter } from './routes/sessions.routes'
import { triageRouter } from './routes/triage.routes'
import { visualsRouter } from './routes/visuals.routes'
import { departmentsRouter } from './routes/departments.routes'
import { doctorsRouter } from './routes/doctors.routes'
import { appointmentsRouter } from './routes/appointments.routes'
import { notificationsRouter } from './routes/notifications.routes'
import { adminAppointmentsRouter } from './routes/adminAppointments.routes'
import { aiTriageRouter } from './routes/aiTriage.routes'


const ALLOWED_ORIGINS = ( process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173,https://swasthya-flow-2-0.vercel.app' )
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)


/**
 * Application wiring (P1-12 hardening).
 *
 * Request pipeline (order is deliberate):
 *   trust proxy → request id → security headers → CORS → cookie parse → CSRF →
 *   JSON body → input validation → anomaly screen → health → rate limit →
 *   auth routes → session auth → facility scope → IP allowlist → sensitive
 *   limiter → security admin routes → offline/idempotency → feature routers.
 */
export function createApp(): express.Express {
  const app = express()

  applyTrustProxy(app)
  app.use(requestId)
  app.use(securityHeaders())

  // credentials:true lets the browser store/return the auth cookies.
  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
  app.use(cookieParser())
  app.use(csrfProtection)
  app.use(express.json({ limit: '1mb' }))
  app.use(inputValidation)
  app.use(anomalyDetection)

  const health = (_req: express.Request, res: express.Response) => {
    res.json({ service: 'swasthyaflow-backend', time: new Date().toISOString(), ...dbHealthReport() })
  }
  app.get('/health', health)
  app.get('/api/health', health)

  // Fails fast (503) if the Mongo connection has dropped in persistent mode.
  app.use('/api', dbHealthMiddleware)

  // Coarse per-IP limiter, then the tighter limiter for credential endpoints.
  app.use('/api', rateLimit('global'))

  // Login / registration manage their own auth; every other API route below
  // requires a valid login session (role checks happen per route).
  app.use('/api/auth', rateLimit('auth'), authRouter)
  app.use('/api', requireAuth)
  // Resolve the facility in scope for every authenticated request (P1-10).
  app.use('/api', facilityScope)
  // Per-facility CIDR allowlist (no-op unless the facility configures one).
  app.use('/api', ipAllowlist)

  // Security administration is rate-limited more aggressively than the rest.
  app.use('/api/security', rateLimit('sensitive'))
  app.use('/api', securityRouter)
  app.use('/api/feedback', feedbackRouter)

  // Model cards (read: all authenticated; write: system-admin) and bias
  // evaluation (system-admin only, sensitive limiter).
  app.use('/api/bias', rateLimit('sensitive'))
  app.use('/api', modelCardRouter)
  app.use('/api', biasRouter)

  // Offline-origin context then idempotency for the allowlisted write routes.
  app.use('/api', offlineOrigin)
  app.use('/api', idempotency)

  app.use('/api/sync', syncRouter)
  app.use('/api/sessions', sessionsRouter)
  app.use('/api/retention', retentionRouter)
  app.use('/api/retention-ui', retentionUiRouter)
  app.use('/api/consent', consentRouter)
  app.use('/api/anonymisation', anonymisationRouter)
  app.use('/api/triage', triageRouter)
  app.use('/api/ai-triage', aiTriageRouter)
  app.use('/api/language', languageRouter)
  app.use('/api/audit', auditRouter)
  app.use('/api/confidence', confidenceRouter)
  app.use('/api/facilities', facilitiesRouter)
  app.use('/api', reportsRouter)
  app.use('/api', visualsRouter)
  app.use('/api', richCoverageRouter)
  // The SSE route must register before the queue router (whose /queue/:sessionId
  // param would otherwise swallow /queue/stream).
  app.use('/api', queueStreamRouter)
  app.use('/api', queueRouter)

  // Appointment system (bookings, directory, schedules, notifications).
  app.use('/api/departments', departmentsRouter)
  app.use('/api/doctors', doctorsRouter)
  app.use('/api/appointments', appointmentsRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/admin/appointments', adminAppointmentsRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
