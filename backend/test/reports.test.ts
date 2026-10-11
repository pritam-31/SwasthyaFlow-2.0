import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { parseReport, parseReportDate, detectLanguage, detectReportType, enforceNonDiagnostic, findDiagnosticLanguage } from '../src/services/reportParser'
import { shutdownOcr } from '../src/services/ocrService'
import type { ExtractedVital, ParsedLabValue, ParsedVital, ReportOcrMeta } from '../src/types'
import { buildTextPdf, buildImagePdf, renderPdfToPng } from './helpers/report-assets'

const PDF_META: ReportOcrMeta = { engine: 'pdf-text', confidence: 100, pages: 1 }
const TESS_META: ReportOcrMeta = { engine: 'tesseract', confidence: 60, pages: 1 }

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const VITALS = ['BP 130/90 MMHG', 'PULSE 72 BPM', 'SPO2 98 %', 'TEMP 98.6 F', 'RR 16 /MIN']

const CBC_OLD = [
  'Care Diagnostics',
  'Patient Name: Ramesh Kumar',
  'Age: 45 Y   Sex: M',
  'UHID: DH-4567',
  'Phone: 98765 43210',
  'Report Date: 05/10/2026',
  '',
  'CBC + Lipids',
  'Haemoglobin 13.5 g/dL 13.0-17.0',
  'WBC Count 12750 4000-11000',
  'Platelet Count 245000 150000-450000',
  'Fasting Blood Glucose 92 mg/dL 70-100',
  'Total Cholesterol 198 mg/dL 125-200',
  '',
  'Impression: Mostly within range.',
  'Diagnosis: Anaemia suspected',
].join('\n')

/** Newer Hb on a later report — the merged view must prefer it. */
const CBC_NEW = CBC_OLD.replace('Report Date: 05/10/2026', 'Report Date: 06/10/2026').replace('Haemoglobin 13.5 g/dL 13.0-17.0', 'Haemoglobin 14.2 g/dL 13.0-17.0')

function labValue(values: ParsedLabValue[], name: string): ParsedLabValue {
  const found = values.find((v) => v.name === name)
  assert.ok(found, `expected a lab value named "${name}"`)
  return found
}

function vitalValue(values: ParsedVital[], name: string): ParsedVital {
  const found = values.find((v) => v.name === name)
  assert.ok(found, `expected a vital named "${name}"`)
  return found
}

/* ------------------------------------------------------------------ */
/*  Parser unit tests                                                  */
/* ------------------------------------------------------------------ */

describe('reportParser', () => {
  it('extracts CBC values with exact confidence / flags / printed ranges', () => {
    const parsed = parseReport(CBC_OLD, { ocr: PDF_META })

    assert.equal(parsed.type, 'lab')
    assert.equal(parsed.language, 'English')
    assert.equal(parsed.reportDate, '2026-10-05')
    assert.equal(parsed.labValues.length, 5)

    const hb = labValue(parsed.labValues, 'Haemoglobin')
    assert.deepEqual(
      { value: hb.value, unit: hb.unit, referenceRange: hb.referenceRange, flag: hb.flag, confidence: hb.confidence },
      { value: 13.5, unit: 'g/dL', referenceRange: '13.0-17.0', flag: 'normal', confidence: 0.95 },
    )
    const wbc = labValue(parsed.labValues, 'WBC Count')
    assert.deepEqual(
      { value: wbc.value, unit: wbc.unit, referenceRange: wbc.referenceRange, flag: wbc.flag, confidence: wbc.confidence },
      { value: 12750, unit: '10^3/µL', referenceRange: '4000-11000', flag: 'high', confidence: 0.8 },
    )
    assert.equal(labValue(parsed.labValues, 'Platelet Count').referenceRange, '150000-450000')
    assert.equal(labValue(parsed.labValues, 'Platelet Count').flag, 'normal')
    assert.equal(labValue(parsed.labValues, 'Fasting Blood Glucose').referenceRange, '70-100')
    assert.equal(labValue(parsed.labValues, 'Total Cholesterol').flag, 'normal')

    assert.deepEqual(parsed.findings, ['Mostly within range.'])
    assert.ok(
      parsed.warnings.some((w) => w.includes('neutralised by the non-diagnostic policy')),
      'a diagnosis line was present on the document, so a neutralisation warning is expected',
    )
    assert.ok(!parsed.warnings.some((w) => w.includes('No known lab values')), 'known values were recognised')
  })

  it('extracts vitals incl. a BP pair and a °F temperature', () => {
    const parsed = parseReport(VITALS.join('\n'), { ocr: PDF_META })

    assert.equal(parsed.type, 'vitals')
    assert.equal(parsed.labValues.length, 0)

    const sys = vitalValue(parsed.vitals, 'Systolic BP')
    const dia = vitalValue(parsed.vitals, 'Diastolic BP')
    const pulse = vitalValue(parsed.vitals, 'Pulse')
    const temp = vitalValue(parsed.vitals, 'Temperature')
    const spo2 = vitalValue(parsed.vitals, 'SpO2')
    const rr = vitalValue(parsed.vitals, 'Respiratory Rate')

    assert.equal(sys.value, 130)
    assert.equal(sys.unit, 'mmHg')
    assert.equal(sys.flag, 'normal')
    assert.equal(dia.value, 90)
    assert.equal(pulse.value, 72)
    assert.equal(pulse.unit, 'BPM')
    assert.equal(pulse.flag, 'normal')
    // A °F document must be compared against the °F window, not the °C table.
    assert.equal(temp.value, 98.6)
    assert.equal(temp.unit, 'F')
    assert.equal(temp.flag, 'normal')
    assert.equal(spo2.value, 98)
    assert.equal(spo2.flag, 'normal')
    assert.equal(rr.value, 16)
    assert.equal(rr.unit, '/min')
    assert.equal(rr.flag, 'normal')

    assert.equal(sys.confidence, 0.8)
    assert.equal(pulse.confidence, 0.8)
    assert.equal(temp.confidence, 0.7)
    assert.equal(rr.confidence, 0.55)
  })

  it('scales confidence down for uncertain OCR output', () => {
    const parsed = parseReport(VITALS.join('\n'), { ocr: TESS_META })
    assert.equal(vitalValue(parsed.vitals, 'Systolic BP').confidence, 0.48)
    assert.equal(vitalValue(parsed.vitals, 'Pulse').confidence, 0.48)
    assert.equal(vitalValue(parsed.vitals, 'Temperature').confidence, 0.42)
  })

  it('reads Indian day-first dates, ISO dates and named months', () => {
    assert.equal(parseReportDate('Report Date: 15/01/2026'), '2026-01-15')
    assert.equal(parseReportDate('Sample on 01/15/2026'), '2026-01-15')
    assert.equal(parseReportDate('Date: 2026-03-04'), '2026-03-04')
    assert.equal(parseReportDate('Collected 12-April-2026'), '2026-04-12')
    assert.equal(parseReportDate('10/10/2026'), '2026-10-10')
    assert.equal(parseReportDate('no date printed'), null)
  })

  it('detects dominant language by script', () => {
    assert.equal(detectLanguage('Patient reports fever for three days'), 'English')
    assert.equal(detectLanguage('यह एक रोगी की रिपोर्ट है जो हिंदी में लिखी गई है'), 'Hindi')
    assert.equal(detectLanguage('ଏହା ରୋଗୀର ରିପୋର୍ଟ ଓଡ଼ିଆରେ ଲେଖାଯାଇଛି'), 'Odia')
    assert.equal(detectLanguage('hi'), 'Unknown')
  })

  it('picks the most specific report type', () => {
    assert.equal(detectReportType('Discharge Summary: chest pain, kept overnight'), 'discharge')
    assert.equal(detectReportType('Rx: Metformin 500 mg tablet twice daily'), 'prescription')
    assert.equal(detectReportType('Chest X-Ray, PA view'), 'imaging')
    assert.equal(detectReportType('Complete Blood Count (CBC)'), 'lab')
    assert.equal(detectReportType('BP 130/90 and pulse 72 today'), 'vitals')
    assert.equal(detectReportType('BCG given at birth'), 'vaccination')
    assert.equal(detectReportType('routine follow up'), 'other')
  })

  it('neutralises diagnosis / prescription language', () => {
    const out = enforceNonDiagnostic('You have malaria. Take this medicine and rest.')
    assert.ok(!/you have|take this/i.test(out))
    assert.ok(out.includes('the patient reports'))
    assert.ok(out.includes('review current medicines with a healthcare worker'))
    assert.ok(findDiagnosticLanguage('Diagnosis of dengue, prescribe paracetamol').length > 0)
    assert.equal(findDiagnosticLanguage(out).length, 0)
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP integration tests                                             */
/* ------------------------------------------------------------------ */

describe('report API (HTTP)', () => {
  let server: Server
  let base = ''

  before(async () => {
    seedUsers()
    clearAudit()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await shutdownOcr()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const text = await res.text()
    assert.equal(res.status, 200, text)
    return (JSON.parse(text) as { token: string }).token
  }

  async function createTriageSession(token: string, text: string): Promise<string> {
    const res = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, consentAcknowledged: true, language: 'English' }),
    })
    const bodyText = await res.text()
    assert.equal(res.status, 201, bodyText)
    return (JSON.parse(bodyText) as { session: { id: string } }).session.id
  }

  interface UploadFile {
    name: string
    type: string
    buffer: Buffer
  }

  async function uploadFiles(token: string, route: string, sessionId: string | null, files: UploadFile[]): Promise<{ status: number; body: Record<string, unknown> }> {
    const form = new FormData()
    if (sessionId) form.append('sessionId', sessionId)
    for (const file of files) form.append('files', new File([file.buffer], file.name, { type: file.type }))
    const res = await fetch(`${base}/api${route}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  interface ApiResult {
    status: number
    body: Record<string, unknown>
  }

  async function api(token: string, method: string, path: string, payload?: Record<string, unknown>): Promise<ApiResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  it('requires an authenticated session for report routes', async () => {
    const res = await fetch(`${base}/api/sessions/sess-nope/reports`)
    assert.equal(res.status, 401)
  })

  it('runs the full nurse → doctor lifecycle with merging and audit', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const sid = await createTriageSession(nurse, 'Fever since three days, no vomiting.')

    const first = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'cbc-report.pdf', type: 'application/pdf', buffer: buildTextPdf(CBC_OLD.split('\n')) },
    ])
    assert.equal(first.status, 201)
    const firstBody = first.body as { reports: Array<Record<string, unknown>>; merged: unknown; processing: Array<Record<string, unknown>> }
    assert.equal(firstBody.reports.length, 1)
    const report = firstBody.processing[0].report as Record<string, unknown>
    assert.equal(report.status, 'pending-review')
    assert.equal(report.type, 'lab')
    assert.equal(report.reportDate, '2026-10-05')
    assert.equal((report as { ocr: { engine: string } }).ocr.engine, 'pdf-text')

    const redactedText = report.redactedText as string
    assert.ok(redactedText.includes('[NAME REDACTED]'))
    assert.ok(redactedText.includes('[PHONE REDACTED]'))
    assert.ok(redactedText.includes('[HOSPITAL ID REDACTED]'))
    assert.ok(!redactedText.includes('Ramesh Kumar'))
    assert.ok(!redactedText.includes('98765'))
    assert.ok(!/diagnos/i.test(redactedText))
    assert.ok((report.anonymization as { redactedCount: number }).redactedCount >= 3)
    assert.ok((report.warnings as string[]).some((w) => w.includes('neutralised by the non-diagnostic policy')))

    const firstReportId = report.id as string

    // Second report via the /reports shortcut, dated one day later, Hb risen.
    const second = await uploadFiles(nurse, '/reports', sid, [
      { name: 'cbc-followup.pdf', type: 'application/pdf', buffer: buildTextPdf(CBC_NEW.split('\n')) },
    ])
    assert.equal(second.status, 201)
    const secondBody = second.body as { reports: Array<Record<string, unknown>>; merged: { labValues: ParsedLabValue[]; reportIds: string[] } }
    assert.equal(secondBody.reports.length, 2)
    assert.ok(secondBody.merged, 'two reports must produce a merged view')
    const mergedHb = secondBody.merged.labValues.find((v) => v.name === 'Haemoglobin')
    assert.ok(mergedHb, 'merged view should carry Haemoglobin')
    assert.equal(mergedHb.value, 14.2)
    const secondReportId = secondBody.reports[1].id as string
    assert.deepEqual(secondBody.merged.reportIds.slice(0, 2), [secondReportId, firstReportId])

    // Nurse cannot verify / reject / delete — doctor only.
    const forbidden = await api(nurse, 'POST', `/api/reports/${firstReportId}/verify`)
    assert.equal(forbidden.status, 403)

    // Verify the first report as a doctor.
    const verified = await api(doctor, 'POST', `/api/reports/${firstReportId}/verify`, { note: 'Matches the patient record.' })
    assert.equal(verified.status, 200)
    const verifiedReport = verified.body.report as { status: string; reviewedByRole: string; reviewNote: string }
    assert.equal(verifiedReport.status, 'verified')
    assert.equal(verifiedReport.reviewedByRole, 'doctor')
    assert.equal(verifiedReport.reviewNote, 'Matches the patient record.')

    const doubleVerify = await api(doctor, 'POST', `/api/reports/${firstReportId}/verify`)
    assert.equal(doubleVerify.status, 409)

    // Reject needs a real reason.
    const shortReason = await api(doctor, 'POST', `/api/reports/${secondReportId}/reject`, { reason: 'x' })
    assert.equal(shortReason.status, 400)
    const rejected = await api(doctor, 'POST', `/api/reports/${secondReportId}/reject`, { reason: 'Values do not match the scan.' })
    assert.equal(rejected.status, 200)
    assert.equal((rejected.body.report as { status: string; rejectionReason: string }).status, 'rejected')
    assert.equal((rejected.body.report as { rejectionReason: string }).rejectionReason, 'Values do not match the scan.')

    // Doctor deletes the verified report; the session keeps the remaining one.
    const deleted = await api(doctor, 'DELETE', `/api/reports/${firstReportId}`)
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body.deleted, true)
    assert.equal((deleted.body.reports as unknown[]).length, 1)
    assert.ok((deleted.body.merged as { labValues: ParsedLabValue[] } | null)?.labValues?.some((v) => v.name === 'Haemoglobin'))

    const gone = await api(doctor, 'GET', `/api/reports/${firstReportId}`)
    assert.equal(gone.status, 404)

    // Full audit trail for this session.
    const trail = listAudit(sid)
    const actions = new Set(trail.map((e) => e.action))
    for (const action of ['report.uploaded', 'report.extracted', 'report.merged', 'report.verified', 'report.rejected', 'report.deleted']) {
      assert.ok(actions.has(action), `expected audit entry "${action}" for the session`)
    }
    const verifiedEntry = trail.find((e) => e.action === 'report.verified')
    assert.equal(verifiedEntry?.category, 'decision')
    assert.equal(verifiedEntry?.role, 'doctor')
    assert.ok(trail.every((e) => e.sessionId === sid))
  })

  it('OCR extracts the same vitals from a rendered image', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sid = await createTriageSession(nurse, 'Routine check-up.')

    const png = await renderPdfToPng(buildTextPdf(VITALS))
    const upload = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'vitals.png', type: 'image/png', buffer: png },
    ])
    assert.equal(upload.status, 201)
    const body = upload.body as { processing: Array<{ report: Record<string, unknown> }> }
    const report = body.processing[0].report
    assert.equal((report as { ocr: { engine: string } }).ocr.engine, 'tesseract')
    const vitals = report.vitals as ExtractedVital[]
    assert.ok(vitals.length >= 5, `expected at least 5 vitals from OCR, got ${vitals.length}: ${JSON.stringify(vitals.map((v) => v.name))}`)
    const byName = new Map(vitals.map((v) => [v.name, v]))
    assert.ok(byName.has('Systolic BP'))
    assert.ok(byName.has('Diastolic BP'))
    assert.ok(byName.has('Pulse'))
    assert.ok(byName.has('Temperature'))
    assert.ok(byName.has('SpO2'))
    const sys = byName.get('Systolic BP')!
    assert.ok(sys.value > 90 && sys.value < 200, `systolic plausibility check failed: ${sys.value}`)
  })

  it('a scanned (image-only) PDF degrades gracefully instead of failing', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sid = await createTriageSession(nurse, 'Scanned upload test.')

    const upload = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'scan.pdf', type: 'application/pdf', buffer: buildImagePdf(VITALS) },
    ])
    assert.equal(upload.status, 201)
    const body = upload.body as { processing: Array<{ report: Record<string, unknown> }> }
    const report = body.processing[0].report
    const engine = (report as { ocr: { engine: string } }).ocr.engine
    assert.ok(['tesseract', 'nothing'].includes(engine), `expected OCR or graceful fallback, got ${engine}`)
    if (engine === 'tesseract') {
      assert.ok((report.warnings as string[]).some((w) => w.includes('OCR')), 'OCR output must carry a verification warning')
    }
  })

  it('rejects unsupported, empty, corrupt and password-protected files', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sid = await createTriageSession(nurse, 'Validation tests.')

    const unsupported = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'note.txt', type: 'text/plain', buffer: Buffer.from('hello') },
    ])
    assert.equal(unsupported.status, 415)

    const empty = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'empty.pdf', type: 'application/pdf', buffer: Buffer.alloc(0) },
    ])
    assert.equal(empty.status, 400)

    const corrupt = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'broken.pdf', type: 'application/pdf', buffer: Buffer.from('definitely not a pdf') },
    ])
    assert.equal(corrupt.status, 400)

    const encrypted = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Encrypt /Standard >>\nendobj\n'),
      Buffer.from('%%EOF'),
    ])
    const protectedPdf = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'locked.pdf', type: 'application/pdf', buffer: encrypted },
    ])
    assert.equal(protectedPdf.status, 400)
  })

  it('enforces the 10 MB-per-file and 5-file ceilings', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sid = await createTriageSession(nurse, 'Limits test.')

    const big = Buffer.concat([buildTextPdf(['x']), Buffer.alloc(10 * 1024 * 1024 + 1024)])
    const oversized = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      { name: 'big.pdf', type: 'application/pdf', buffer: big },
    ])
    assert.equal(oversized.status, 413)

    const small = () => ({ name: 'a.pdf', type: 'application/pdf' as const, buffer: buildTextPdf(['Haemoglobin 13.5 g/dL 13.0-17.0']) })
    const tooMany = await uploadFiles(nurse, `/sessions/${sid}/reports`, null, [
      small(), small(), small(), small(), small(), small(),
    ])
    assert.equal(tooMany.status, 413)
  })

  it('hides a patient from sessions and reports that are not their own', async () => {
    const nurse = await login('nurse', 'Nurse@123')

    const suffix = Date.now().toString(36)
    const registered = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `patient_${suffix}`, displayName: 'Test Patient', password: 'Passw0rd123' }),
    })
    assert.equal(registered.status, 201)
    const patient = ((await registered.json()) as { token: string }).token

    const stranger = await login('patient', 'Patient@123')
    const ownSession = await createTriageSession(patient, 'My own complaint.')

    // A stranger gets a 404 — never a hint that the session exists.
    const strangerList = await api(stranger, 'GET', `/api/sessions/${ownSession}/reports`)
    assert.equal(strangerList.status, 404)

    // Staff upload a report to the patient's session; patient sees it, stranger does not.
    const staffSession = await createTriageSession(nurse, 'Staff-created session.')
    const upload = await uploadFiles(nurse, `/sessions/${ownSession}/reports`, null, [
      { name: 'cbc.pdf', type: 'application/pdf', buffer: buildTextPdf(CBC_OLD.split('\n')) },
    ])
    assert.equal(upload.status, 201)
    const reportId = (upload.body as { processing: Array<{ report: { id: string } }> }).processing[0].report.id

    const ownView = await api(patient, 'GET', `/api/sessions/${ownSession}/reports`)
    assert.equal(ownView.status, 200)
    assert.equal((ownView.body.reports as unknown[]).length, 1)

    const strangerReport = await api(stranger, 'GET', `/api/reports/${reportId}`)
    assert.equal(strangerReport.status, 404)
    const ownerReport = await api(patient, 'GET', `/api/reports/${reportId}`)
    assert.equal(ownerReport.status, 200)

    // A patient cannot upload to someone else's session either.
    const strangerUpload = await uploadFiles(patient, `/sessions/${staffSession}/reports`, null, [
      { name: 'cbc.pdf', type: 'application/pdf', buffer: buildTextPdf(CBC_OLD.split('\n')) },
    ])
    assert.equal(strangerUpload.status, 404)
  })
})