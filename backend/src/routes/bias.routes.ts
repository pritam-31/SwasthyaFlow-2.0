import { Router } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import {
  deleteReport,
  getManifest,
  getReport,
  latestReport,
  listReports,
  listRuns,
  performBiasRun,
  recordReportView,
  runLeakTest,
} from '../services/biasReportService'
import type { AuthUser } from '../services/authStore'
import type { ContentActor } from '../services/modelCardService'

/**
 * Bias evaluation API (P2-13) — system administrators only, rate-limited by the
 * sensitive tier in app.ts.
 *
 *  GET    /bias/manifest              dataset manifest + counts              admin
 *  GET    /bias/reports               report history (newest first)          admin
 *  GET    /bias/reports/latest        most recent report                     admin
 *  GET    /bias/reports/:reportId     one report                             admin
 *  DELETE /bias/reports/:reportId     delete a report                        admin
 *  GET    /bias/runs                  run ledger (newest first)              admin
 *  POST   /bias/run                   run the full evaluation                admin
 *  POST   /bias/leak                  run the anonymiser leak test           admin
 */
export const biasRouter = Router()

biasRouter.use('/bias', requireAuth, requireRole('system-admin'))

function actorOf(user: AuthUser): ContentActor {
  return { id: user.id, username: user.username, role: user.role }
}

biasRouter.get('/bias/manifest', (req, res, next) => {
  try {
    res.json({ manifest: getManifest(actorOf(authUser(req))) })
  } catch (err) {
    next(err)
  }
})

biasRouter.get('/bias/reports', (req, res, next) => {
  try {
    authUser(req)
    res.json({ reports: listReports() })
  } catch (err) {
    next(err)
  }
})

biasRouter.get('/bias/reports/latest', (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    const report = latestReport()
    if (!report) throw new HttpError(404, 'No bias reports have been produced yet.')
    recordReportView(report.reportId, actor)
    res.json({ report })
  } catch (err) {
    next(err)
  }
})

biasRouter.get('/bias/reports/:reportId', (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    const report = getReport(req.params.reportId)
    if (!report) throw new HttpError(404, 'Bias report not found.')
    recordReportView(report.reportId, actor)
    res.json({ report })
  } catch (err) {
    next(err)
  }
})

biasRouter.delete('/bias/reports/:reportId', (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    if (!deleteReport(req.params.reportId, actor)) throw new HttpError(404, 'Bias report not found.')
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

biasRouter.get('/bias/runs', (req, res, next) => {
  try {
    authUser(req)
    res.json({ runs: listRuns() })
  } catch (err) {
    next(err)
  }
})

biasRouter.post('/bias/run', (req, res, next) => {
  try {
    const report = performBiasRun(actorOf(authUser(req)))
    res.status(201).json({ report })
  } catch (err) {
    next(err)
  }
})

biasRouter.post('/bias/leak', (req, res, next) => {
  try {
    res.json({ result: runLeakTest(actorOf(authUser(req))) })
  } catch (err) {
    next(err)
  }
})
