/**
 * Bridge from the live triage backend (PatientSession + extracted reports) into
 * the Patient registry / dashboard demo model (CaseRecord + Report).
 *
 * The registry and dashboard read the in-memory AppStore; the real intake
 * creates backend sessions. This module projects a session (and the reports
 * read for it) into that model so a submitted report is visible in the
 * Patient registry and on the dashboard, linked by the anonymized patientId.
 */

import type {
  CaseRecord,
  FollowUpQuestion,
  Report,
  ReportField,
  ReportKind,
  ReviewStatus,
  Symptom,
  TimelineEvent,
  UrgencySignal,
} from '../types'
import type { ExtractedReport } from '../types/report.types'
import type { PatientSession } from '../types/triage'

const KIND_BY_TYPE: Record<ExtractedReport['type'], ReportKind> = {
  lab: 'cbc',
  vitals: 'blood-sugar',
  imaging: 'xray',
  discharge: 'scanned-doc',
  prescription: 'scanned-doc',
  vaccination: 'scanned-doc',
  other: 'scanned-doc',
}

/** Deterministic registry case id for a session, so re-syncs update in place. */
export function sessionCaseId(sessionId: string): string {
  return `case-${sessionId}`
}

/** Project one backend-extracted report into the registry Report shape. */
export function extractedToReport(report: ExtractedReport, caseId: string): Report {
  const fields: ReportField[] = [
    ...report.labValues.map((v) => ({
      id: v.id,
      param: v.name,
      value: String(v.value),
      unit: v.unit || undefined,
      referenceRange: v.referenceRange ?? undefined,
      status: 'needs-verification' as const,
    })),
    ...report.vitals.map((v) => ({
      id: v.id,
      param: v.name,
      value: String(v.value),
      unit: v.unit || undefined,
      referenceRange: undefined,
      status: 'needs-verification' as const,
    })),
  ]

  return {
    id: report.id,
    caseId,
    name: report.fileName,
    type: report.source,
    kind: KIND_BY_TYPE[report.type] ?? 'scanned-doc',
    date: report.reportDate ?? undefined,
    ocrStatus:
      report.ocr.engine === 'nothing'
        ? 'failed'
        : report.ocr.confidence < 60
          ? 'low-quality'
          : 'done',
    aiNote:
      report.findings.length > 0
        ? report.findings.join(' ')
        : report.redactedText
          ? report.redactedText.slice(0, 240)
          : 'No text could be read — nothing was invented.',
    fields,
  }
}

/** Every registry Report read for a session (empty when none uploaded). */
export function sessionReports(session: PatientSession, reports: ExtractedReport[] | undefined): Report[] {
  if (!reports || reports.length === 0) return []
  const caseId = sessionCaseId(session.id)
  return reports.map((r) => extractedToReport(r, caseId))
}

function reviewStatusFor(note: PatientSession['triageNote']): ReviewStatus {
  switch (note?.status) {
    case 'accepted':
    case 'finalized':
      return 'reviewed'
    case 'escalated':
    case 'human-edited':
      return 'awaiting-doctor'
    default:
      return 'awaiting-nurse'
  }
}

/** Project a live session into a registry CaseRecord (linked by patientId). */
export function sessionToCase(
  session: PatientSession,
  reports: ExtractedReport[] | undefined,
): Partial<CaseRecord> {
  const note = session.triageNote

  const symptoms: Symptom[] = (note?.observations ?? []).map((o, i) => ({
    id: `${session.id}-obs-${i}`,
    name: o,
    source: 'AI-prepared note',
    status: 'ai-extracted',
  }))

  const timeline: TimelineEvent[] = (note?.timeline ?? []).map((e) => ({
    id: e.eventId,
    dayLabel: e.timeExpression ?? 'Latest',
    text: e.eventText,
    source: 'AI timeline (draft)',
  }))

  const followUpQuestions: FollowUpQuestion[] = (note?.followUpQuestions ?? []).map((q) => ({
    id: q.id,
    question: q.question,
    status: q.status,
    answer: q.answer,
  }))

  const urgencySignals: UrgencySignal[] = (note?.urgencyFlags ?? []).map((f) => ({
    id: f.id,
    level: f.severity === 'red' ? 'urgent' : 'prompt',
    reason: f.reason,
    rule: f.ruleId,
    status: f.status === 'cleared' ? 'reviewed' : f.status,
  }))

  const missingInfo = (note?.missingInformation ?? []).map((m) => m.field)
  const completeness = Math.max(0, Math.min(100, 100 - missingInfo.length * 10 - (session.displayText ? 0 : 30)))

  return {
    id: sessionCaseId(session.id),
    patientId: session.patientId,
    language: session.raw.language,
    mode: 'opd',
    chiefConcern:
      note?.structuredNote.chiefComplaint?.trim() || session.displayText || 'Reported symptoms under review',
    translatedConcern: session.displayText || undefined,
    originalTranscript: session.raw.voice?.transcript || session.raw.text || undefined,
    transcriptLanguage: session.raw.voice?.transcript ? session.raw.language : undefined,
    symptoms,
    timeline,
    reportedHistory: note?.structuredNote.history ? [note.structuredNote.history] : [],
    reportedMedications: [],
    missingInfo,
    completeness,
    followUpQuestions,
    urgencySignals,
    reviewStatus: reviewStatusFor(note),
    consent: {
      status: session.consent.granted ? 'granted' : 'not-granted',
      at: session.consent.at,
      purpose: session.consent.purposes,
    },
    reportIds: (reports ?? []).map((r) => r.id),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    reporter: 'Patient (self)',
    corrections: [],
    referral: null,
  }
}
