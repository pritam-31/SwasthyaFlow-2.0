import { randomUUID } from 'node:crypto'
import type { AuthUser } from './authStore'
import { HttpError } from '../middleware/errorHandler'
import type { ExtractedLabValue, ExtractedReport, ExtractedVital, ParsedReport, PatientSession, RedactionCategory, ReportExtractionResult, ReportUploadFile } from '../types'
import type { PIICategory } from '../types/anonymisation.types'
import { addAudit } from './auditStore'
import { anonymiseFilename, anonymiseText } from './unifiedAnonymizer'
import { extractTextFromImage, extractTextFromPdf } from './ocrService'
import { enforceNonDiagnostic, NON_DIAGNOSTIC_DISCLAIMER, parseReport } from './reportParser'
import { mergeReports } from './reportMerger'
import { addReportToSession, findReport, getReportsForSession, removeReport, replaceReport } from './sessionStore'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILES = 5
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png'])

function validateFile(file: ReportUploadFile): 'pdf' | 'image' {
  if (!file.size || !file.buffer.length) throw new HttpError(400, 'The uploaded file is empty.')
  if (file.size > MAX_FILE_BYTES || file.buffer.length > MAX_FILE_BYTES) throw new HttpError(413, 'Each report must be 10 MB or smaller.')
  if (file.mimeType === 'application/pdf') {
    if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new HttpError(400, 'The uploaded PDF is corrupt or invalid.')
    if (file.buffer.includes(Buffer.from('/Encrypt'))) throw new HttpError(400, 'Password-protected PDFs are not supported.')
    return 'pdf'
  }
  if (ALLOWED_IMAGE_TYPES.has(file.mimeType)) {
    const isPng = file.mimeType === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const isJpeg = file.mimeType === 'image/jpeg' && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer.at(-2) === 0xff && file.buffer.at(-1) === 0xd9
    if (!isPng && !isJpeg) throw new HttpError(400, 'The uploaded image is corrupt or invalid.')
    return 'image'
  }
  throw new HttpError(415, 'Only PDF, JPEG, and PNG reports are supported.')
}

function anonymizationSummary(matches: ReturnType<typeof anonymiseText>['matches']) {
  const counts = new Map<RedactionCategory, number>()
  const categoryMap: Partial<Record<PIICategory, RedactionCategory>> = {
    'person-name': 'name',
    'honorific-name': 'name',
    'doctor-name': 'name',
    'relative-name': 'name',
    phone: 'phone',
    aadhaar: 'aadhaar',
    pan: 'pan',
    'voter-id': 'voter-id',
    'ration-card': 'ration-card',
    passport: 'id-number',
    'driving-license': 'id-number',
    email: 'email',
    address: 'address',
    dob: 'date-of-birth',
    'age-with-name': 'name',
    'facility-id': 'hospital-id',
    'patient-id': 'patient-id',
    'lab-name': 'lab-name',
    'hospital-name': 'lab-name',
  }
  for (const match of matches) {
    const category = categoryMap[match.category]
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return {
    redactedCount: matches.length,
    redactions: [...counts].map(([category, count]) => ({ category, count })),
  }
}

function attachReportId(parsed: ParsedReport, reportId: string): { labValues: ExtractedLabValue[]; vitals: ExtractedVital[] } {
  return {
    labValues: parsed.labValues.map((value) => ({ ...value, id: `lab-${randomUUID()}`, reportId })),
    vitals: parsed.vitals.map((value) => ({ ...value, id: `vital-${randomUUID()}`, reportId })),
  }
}

function audit(session: PatientSession, actor: AuthUser, action: string, detail: string, category: 'edit' | 'decision' | 'system'): void {
  addAudit({
    sessionId: session.id,
    facilityId: session.facilityId,
    actor: actor.username,
    role: actor.role,
    action,
    detail,
    category,
  })
}

export async function processReportUpload(
  session: PatientSession,
  actor: AuthUser,
  files: ReportUploadFile[],
): Promise<ReportExtractionResult[]> {
  if (files.length === 0) throw new HttpError(400, 'At least one report file is required.')
  if (files.length > MAX_FILES) throw new HttpError(413, 'No more than five reports can be uploaded at once.')

  const results: ReportExtractionResult[] = []
  for (const file of files) {
    const source = validateFile(file)
    const extraction = source === 'pdf' ? await extractTextFromPdf(file.buffer) : await extractTextFromImage(file.buffer)
    const anonymisation = anonymiseText(extraction.text, 'report-text')
    const anonymized = anonymisation.text
    const parsedResult = parseReport(anonymized, { ocr: extraction.meta })
    const { parsed } = parsedResult
    const redactedText = enforceNonDiagnostic(anonymized)
    const fileName = enforceNonDiagnostic(anonymiseFilename(file.originalName)).trim() || 'Unnamed report'
    const id = `report-${randomUUID()}`
    const values = attachReportId(parsed, id)
    const report: ExtractedReport = {
      id,
      sessionId: session.id,
      patientId: session.patientId,
      fileName,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      source,
      type: parsed.type,
      language: parsed.language,
      reportDate: parsed.reportDate,
      status: 'pending-review',
      redactedText,
      anonymization: anonymizationSummary(anonymisation.matches),
      labValues: values.labValues,
      vitals: values.vitals,
      findings: parsed.findings.map(enforceNonDiagnostic),
      warnings: [...extraction.warnings, ...parsed.warnings],
      ocr: extraction.meta,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      reviewedBy: null,
      reviewedByRole: null,
      reviewNote: null,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      detectedLabFormat: parsedResult.detectedLabFormat ?? undefined,
    }
    if (!addReportToSession(session.id, report)) throw new HttpError(404, 'Session not found.')
    audit(session, actor, 'report.uploaded', `Report ${id} uploaded (${source}).`, 'edit')
    audit(session, actor, 'report.extracted', `Report ${id} extraction completed with ${values.labValues.length} lab values and ${values.vitals.length} vitals.`, 'system')
    results.push({ report, warnings: report.warnings })
  }

  if (files.length > 0) audit(session, actor, 'report.merged', `Report values refreshed for ${files.length} upload(s).`, 'system')
  return results
}

export function sessionReportsView(session: PatientSession) {
  const reports = getReportsForSession(session.id)
  return { reports, merged: mergeReports(reports) }
}

export function reportDetailView(session: PatientSession, _reportId: string) {
  return { merged: mergeReports(getReportsForSession(session.id)) }
}

export function locateReport(reportId: string, user: AuthUser): { session: PatientSession; report: ExtractedReport } {
  const found = findReport(reportId)
  if (!found || (user.role === 'patient' && found.session.ownerId !== user.id)) throw new HttpError(404, 'Report not found.')
  if (user.role !== 'patient' && user.activeFacilityId && found.session.facilityId !== user.activeFacilityId) throw new HttpError(404, 'Report not found.')
  return found
}

function requirePending(report: ExtractedReport): void {
  if (report.status !== 'pending-review') throw new HttpError(409, 'This report has already been reviewed.')
}

export function verifyReport(session: PatientSession, actor: AuthUser, reportId: string, note: string | null) {
  const report = getReportsForSession(session.id).find((item) => item.id === reportId)
  if (!report) throw new HttpError(404, 'Report not found.')
  requirePending(report)
  const updated: ExtractedReport = {
    ...report,
    status: 'verified',
    reviewedBy: actor.username,
    reviewedByRole: actor.role,
    reviewNote: note ? enforceNonDiagnostic(note) : null,
    updatedAt: new Date().toISOString(),
  }
  replaceReport(session.id, updated)
  audit(session, actor, 'report.verified', `Report ${reportId} verified.`, 'decision')
  return { report: updated }
}

export function rejectReport(session: PatientSession, actor: AuthUser, reportId: string, reason: string) {
  const report = getReportsForSession(session.id).find((item) => item.id === reportId)
  if (!report) throw new HttpError(404, 'Report not found.')
  requirePending(report)
  const safeReason = enforceNonDiagnostic(reason).trim()
  if (safeReason.length < 10) throw new HttpError(400, 'A rejection reason of at least 10 characters is required.')
  const updated: ExtractedReport = {
    ...report,
    status: 'rejected',
    reviewedBy: actor.username,
    reviewedByRole: actor.role,
    rejectionReason: safeReason,
    updatedAt: new Date().toISOString(),
  }
  replaceReport(session.id, updated)
  audit(session, actor, 'report.rejected', `Report ${reportId} rejected: ${safeReason}`, 'decision')
  return { report: updated }
}

export function deleteReport(session: PatientSession, actor: AuthUser, reportId: string) {
  const report = getReportsForSession(session.id).find((item) => item.id === reportId)
  if (!report) throw new HttpError(404, 'Report not found.')
  removeReport(session.id, reportId)
  audit(session, actor, 'report.deleted', `Report ${reportId} deleted.`, 'system')
  return sessionReportsView({ ...session, reports: getReportsForSession(session.id) })
}
