import { Router, type Request } from 'express'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { rateLimit } from '../middleware/rateLimit'
import type { AuthUser } from '../services/authStore'
import { addAudit } from '../services/auditStore'
import { getSessionIncludingDeleted } from '../services/sessionStore'
import {
  generateConsentReceipt,
  getConsentCoverage,
  getConsentForSession,
  getConsentHistory,
  getConsentReceipt,
  listConsentForOwner,
  listConsentVersions,
  previewConsentWithdrawal,
  reGrantConsent,
  upgradeConsentVersion,
  withdrawConsent,
} from '../services/consentRetentionService'
import type { ConsentReceipt, ConsentWithdrawalRequest } from '../types'

/**
 * Consent lifecycle API (P2-17).
 *
 *  GET  /sessions/:id                 consent status            case-scoped
 *  GET  /sessions/:id/history         consent history           case-scoped
 *  GET  /sessions/:id/impact          withdrawal impact preview case-scoped
 *  POST /sessions/:id/revoke          withdraw consent          patient-own only
 *  POST /sessions/:id/re-grant        re-grant consent          patient-own only
 *  POST /sessions/:id/upgrade-version upgrade policy version    patient-own only
 *  POST /sessions/:id/receipt         generate a receipt        case-scoped
 *  GET  /receipt/:ref                 download a receipt        authenticated
 *  GET  /facility/coverage            facility consent coverage facility-admin
 *  GET  /me                           the caller's own consent  patient
 *  GET  /versions                     published policy versions any authed
 */
export const consentRouter = Router()

/** Loads a facility-scoped session; a patient only ever sees their own. */
function requireCaseSession(req: Request, id: string): { session: NonNullable<ReturnType<typeof getSessionIncludingDeleted>>; user: AuthUser } {
  const user = authUser(req)
  const session = getSessionIncludingDeleted(id)
  if (!session || session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  if (user.role === 'patient' && session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  return { session, user }
}

consentRouter.get('/sessions/:id', (req, res) => {
  requireCaseSession(req, req.params.id)
  res.json({ consent: getConsentForSession(req.params.id) })
})

consentRouter.get('/sessions/:id/history', (req, res) => {
  const { session, user } = requireCaseSession(req, req.params.id)
  const history = getConsentHistory(req.params.id, facilityIdOf(req))
  addAudit({
    facilityId: session.facilityId,
    sessionId: req.params.id,
    actor: user.displayName,
    role: user.role,
    action: 'consent.history-viewed',
    detail: `Consent history viewed (${history.length} event(s)).`,
    category: 'view',
  })
  res.json({ history })
})

consentRouter.get('/sessions/:id/impact', (req, res) => {
  requireCaseSession(req, req.params.id)
  res.json({ preview: previewConsentWithdrawal(req.params.id, facilityIdOf(req)) })
})

function readReasonBody(body: unknown): ConsentWithdrawalRequest {
  const input = (body ?? {}) as Record<string, unknown>
  return {
    reasonCode: input.reasonCode as ConsentWithdrawalRequest['reasonCode'],
    ...(typeof input.reasonText === 'string' ? { reasonText: input.reasonText } : {}),
  }
}

consentRouter.post('/sessions/:id/revoke', rateLimit('sensitive'), (req, res) => {
  const user = authUser(req)
  if (user.role !== 'patient') throw new HttpError(403, 'Only the patient may withdraw their own consent.')
  const session = getSessionIncludingDeleted(req.params.id)
  if (!session || session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  const result = withdrawConsent({
    sessionId: req.params.id,
    facilityId: facilityIdOf(req),
    user,
    request: readReasonBody(req.body),
  })
  res.json({ result })
})

consentRouter.post('/sessions/:id/re-grant', rateLimit('sensitive'), (req, res) => {
  const user = authUser(req)
  if (user.role !== 'patient') throw new HttpError(403, 'Only the patient may re-grant their own consent.')
  const session = getSessionIncludingDeleted(req.params.id)
  if (!session || session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  const result = reGrantConsent({ sessionId: req.params.id, facilityId: facilityIdOf(req), user })
  res.json(result)
})

consentRouter.post('/sessions/:id/upgrade-version', rateLimit('sensitive'), (req, res) => {
  const user = authUser(req)
  if (user.role !== 'patient') throw new HttpError(403, 'Only the patient may upgrade their consent version.')
  const session = getSessionIncludingDeleted(req.params.id)
  if (!session || session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  const result = upgradeConsentVersion({ sessionId: req.params.id, facilityId: facilityIdOf(req), user })
  res.status(201).json(result)
})

consentRouter.post('/sessions/:id/receipt', rateLimit('sensitive'), (req, res) => {
  const user = authUser(req)
  requireCaseSession(req, req.params.id)
  const receipt = generateConsentReceipt({ sessionId: req.params.id, facilityId: facilityIdOf(req), user })
  res.status(201).json({ receipt })
})

consentRouter.get('/receipt/:ref', (req, res, next) => {
  const receipt = getConsentReceipt(req.params.ref)
  if (!receipt) throw new HttpError(404, 'Receipt not found — references expire after 1 day.')
  const format = req.query.format === 'pdf' ? 'pdf' : 'json'
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="consent-receipt-${receipt.ref}.json"`)
    res.send(Buffer.from(JSON.stringify(receipt, null, 2), 'utf8'))
    return
  }
  buildReceiptPdf(receipt)
    .then((buffer) => {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="consent-receipt-${receipt.ref}.pdf"`)
      res.send(buffer)
    })
    .catch((err) => next(err))
})

consentRouter.get('/facility/coverage', requireRole('facility-admin'), (req, res) => {
  const user = authUser(req)
  const coverage = getConsentCoverage(facilityIdOf(req))
  addAudit({
    sessionId: 'consent',
    actor: user.displayName,
    role: user.role,
    action: 'consent.coverage-viewed',
    detail: `Consent coverage viewed for ${coverage.total} case(s).`,
    category: 'view',
  })
  res.json({ coverage })
})

consentRouter.get('/me', (req, res) => {
  const user = authUser(req)
  const consent = listConsentForOwner(user.id).map((entry) => entry.record)
  addAudit({
    sessionId: 'consent',
    actor: user.displayName,
    role: user.role,
    action: 'consent.patient-viewed',
    detail: `Patient viewed ${consent.length} of their own consent record(s).`,
    category: 'view',
  })
  res.json({ consent })
})

consentRouter.get('/versions', (_req, res) => {
  res.json({ versions: listConsentVersions() })
})

function winAnsiSafe(text: string): string {
  let out = ''
  for (const char of text) {
    out += char.codePointAt(0)! <= 255 ? char : '?'
  }
  return out
}

async function buildReceiptPdf(receipt: ConsentReceipt): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([595, 842])
  const margin = 48
  let y = 790

  const title = winAnsiSafe('Consent Receipt')
  page.drawText(title, { x: margin, y, size: 20, font: bold, color: rgb(0.1, 0.12, 0.18) })
  y -= 26
  page.drawText(winAnsiSafe(`Reference ${receipt.ref}`), { x: margin, y, size: 10, font, color: rgb(0.35, 0.38, 0.45) })
  y -= 28

  const rows: Array<[string, string]> = [
    ['Session', receipt.sessionId],
    ['Consent record', receipt.consentRecordId],
    ['Policy version', receipt.policyVersion],
    ['Granted at', receipt.grantedAt],
    ['Granted by', `${receipt.grantedBy} (${receipt.grantedByRole})`],
    ['Purposes', receipt.purposes.join('; ')],
    ['Withdrawn at', receipt.revokedAt ?? 'not withdrawn'],
    ['Reason code', receipt.withdrawalReasonCode ?? 'n/a'],
    ['Generated at', receipt.generatedAt],
  ]

  for (const [label, value] of rows) {
    page.drawText(winAnsiSafe(label), { x: margin, y, size: 10, font: bold, color: rgb(0.2, 0.22, 0.3) })
    const lines = wrap(winAnsiSafe(value), 460, 10)
    for (const line of lines) {
      page.drawText(line, { x: margin + 130, y, size: 10, font, color: rgb(0.15, 0.17, 0.22) })
      y -= 16
    }
  }

  y -= 12
  for (const line of wrap(winAnsiSafe(receipt.disclaimer), 500, 9)) {
    page.drawText(line, { x: margin, y, size: 9, font, color: rgb(0.45, 0.48, 0.55) })
    y -= 13
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

function wrap(text: string, width: number, size: number): string[] {
  const approxChar = size * 0.52
  const maxChars = Math.max(20, Math.floor(width / approxChar))
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars) {
      if (current) lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}
