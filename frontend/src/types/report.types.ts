/**
 * Medical report upload / extraction model (P0-1).
 *
 * Mirrors backend/src/types/report.types.ts. Same hard rules:
 *  - Raw OCR text never leaves the backend — only `redactedText`.
 *  - Extracted values are extraction *suggestions* for a human to verify:
 *    nothing here is a diagnosis, a prescription or a treatment plan.
 *  - Human-in-the-loop: every report starts as `pending-review`; only a
 *    doctor (or admin) can verify or reject it.
 */

import type { AnonymizationReport, UserRole } from './triage'

export type ReportSource = 'pdf' | 'image'

export type ReportType = 'lab' | 'vitals' | 'imaging' | 'discharge' | 'prescription' | 'vaccination' | 'other'

export type ReportReviewStatus = 'pending-review' | 'verified' | 'rejected'

export type ReportLanguage = 'English' | 'Hindi' | 'Odia' | 'Mixed' | 'Unknown'

/** Comparison of an extracted value against the reference range printed in the report. */
export type ValueFlag = 'high' | 'low' | 'normal' | 'unknown'

export interface ExtractedLabValue {
  id: string
  name: string
  value: number
  unit: string
  referenceRange: string | null
  flag: ValueFlag
  /** 0..1 extraction confidence (how well the text matched) — never a clinical confidence. */
  confidence: number
  /** Report the value was extracted from — traceability after a merge. */
  reportId: string
}

export interface ExtractedVital {
  id: string
  name: string
  value: number
  unit: string
  flag: ValueFlag
  confidence: number
  /** When the report itself carries a measurement time/date, otherwise null. */
  recordedAt: string | null
  reportId: string
}

export interface ReportOcrMeta {
  /** `pdf-text` = native text layer, `tesseract` = OCR, `nothing` = nothing could be read. */
  engine: 'pdf-text' | 'tesseract' | 'nothing'
  /** 0..100 — OCR confidence, 100 for a native text layer, 0 when nothing was read. */
  confidence: number
  /** Pages/screenshots that were processed. */
  pages: number
}

export interface ExtractedReport {
  id: string
  sessionId: string
  patientId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  source: ReportSource
  type: ReportType
  language: ReportLanguage
  /** ISO date printed on the report (collection/report date) when one could be read. */
  reportDate: string | null
  status: ReportReviewStatus
  /** Anonymised text only — the raw OCR output never leaves the backend. */
  redactedText: string
  anonymization: AnonymizationReport
  labValues: ExtractedLabValue[]
  vitals: ExtractedVital[]
  /** Impression lines copied from the document, passed through the non-diagnostic guard. */
  findings: string[]
  warnings: string[]
  ocr: ReportOcrMeta
  disclaimer: string
  reviewedBy: string | null
  reviewedByRole: UserRole | null
  reviewNote: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

/** Cross-report view: one row per measurement, latest report wins. */
export interface MergedReportView {
  sessionId: string
  reportIds: string[]
  labValues: ExtractedLabValue[]
  vitals: ExtractedVital[]
  findings: string[]
  mergedAt: string
  disclaimer: string
}

/** Result of processing one uploaded file (stored report + its warnings). */
export interface ReportExtractionResult {
  report: ExtractedReport
  warnings: string[]
}

/** GET /sessions/:id/reports and POST /reports/:sessionId/reports responses. */
export interface ReportsView {
  reports: ExtractedReport[]
  merged: MergedReportView | null
}

/** POST upload response — the session view plus per-file processing results. */
export interface UploadReportsResponse extends ReportsView {
  processing: ReportExtractionResult[]
}

/** GET /reports/:id, POST verify/reject responses. */
export interface ReportDetailResponse {
  report: ExtractedReport
  merged: MergedReportView | null
}

/** DELETE /reports/:id response. */
export interface DeleteReportResponse extends ReportsView {
  deleted: true
  fileName: string
}