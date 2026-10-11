/**
 * Medical report upload / extraction model (P0-1).
 *
 * Hard rules:
 *  - Raw OCR text is never stored or returned — only the anonymised text
 *    (`redactedText`) produced by the shared anonymizer.
 *  - Extracted values are extraction *suggestions* for a human to verify:
 *    nothing here is a diagnosis, a prescription or a treatment plan.
 *  - Human-in-the-loop: every report starts as `pending-review`; only a
 *    doctor (or admin) can verify or reject it.
 */

import type { AnonymizationReport, UserRole } from './index'
import type { ConfidenceScore } from './confidence.types'

export type ReportSource = 'pdf' | 'image'

export type ReportType = 'lab' | 'vitals' | 'imaging' | 'discharge' | 'prescription' | 'vaccination' | 'other'

export type ReportReviewStatus = 'pending-review' | 'verified' | 'rejected'

export type ReportLanguage = 'English' | 'Hindi' | 'Odia' | 'Mixed' | 'Unknown'

/** Comparison of an extracted value against the reference range printed in the report. */
export type ValueFlag = 'high' | 'low' | 'normal' | 'unknown'

export interface ParsedLabValue {
  name: string
  value: number
  unit: string
  referenceRange: string | null
  flag: ValueFlag
  /** 0..1 extraction confidence (how well the text matched) — never a clinical confidence. */
  confidence: number
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
}

export interface ParsedVital {
  name: string
  value: number
  unit: string
  flag: ValueFlag
  confidence: number
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
  /** When the report itself carries a measurement time/date, otherwise null. */
  recordedAt: string | null
}

export interface ExtractedLabValue extends ParsedLabValue {
  id: string
  /** Report the value was extracted from — traceability after a merge. */
  reportId: string
}

export interface ExtractedVital extends ParsedVital {
  id: string
  reportId: string
}

export interface ReportOcrMeta {
  /** `pdf-text` = native text layer, `tesseract` = OCR, `nothing` = nothing could be read. */
  engine: 'pdf-text' | 'tesseract' | 'nothing'
  /** 0..100 — OCR confidence, 100 for a native text layer, 0 when nothing was read. */
  confidence: number
  /** Pages/screenshots that were processed. */
  pages: number
  /** Explainability score for the OCR pass (P2-14). */
  confidenceScore?: ConfidenceScore
}

/** Result of processing one uploaded file (stored report + its warnings). */
export interface ReportExtractionResult {
  report: ExtractedReport
  warnings: string[]
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
  /** Anonymised text only — the raw OCR output never leaves the request. */
  redactedText: string
  anonymization: AnonymizationReport
  labValues: ExtractedLabValue[]
  vitals: ExtractedVital[]
  /** Impression lines copied from the document, passed through the non-diagnostic guard. */
  findings: string[]
  warnings: string[]
  ocr: ReportOcrMeta
  /** Explainability score for the inferred report type (P2-14). */
  typeConfidence?: ConfidenceScore
  disclaimer: string
  reviewedBy: string | null
  reviewedByRole: UserRole | null
  reviewNote: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
  /** Detected lab format brand (Thyrocare / Dr. Lal PathLabs / Apollo / SRL / Metropolis),
   *  or null when the generic parser was used. */
  detectedLabFormat?: string
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

/** Parser output before ids / report linkage are attached. */
export interface ParsedReport {
  type: ReportType
  language: ReportLanguage
  reportDate: string | null
  labValues: ParsedLabValue[]
  vitals: ParsedVital[]
  findings: string[]
  warnings: string[]
}

/** One file handed to the extraction pipeline (multer memory storage). */
export interface ReportUploadFile {
  buffer: Buffer
  originalName: string
  mimeType: string
  size: number
}
