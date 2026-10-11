/**
 * Unified anonymisation model (P0-7).
 *
 * One pipeline covers every modality — text, transcripts, OCR, images, logs,
 * errors, filenames and structured objects. Hard rules:
 *  - PII is stripped BEFORE storage, analysis, return, logging or export.
 *  - Raw PII is NEVER persisted, returned or logged. The `raw` field on a
 *    {@link PIIMatch} exists only for the in-process test harness; every API
 *    response is scrubbed via `scrubRaw` first.
 *  - Anonymisation never alters clinical meaning: only identifiers are removed.
 *  - Nothing here diagnoses, prescribes or advises treatment.
 */

import type { SupportedLanguage } from './language.types'
import type { UserRole } from './index'
import type { ConfidenceScore } from './confidence.types'

/** Every surface PII can appear on. */
export type PIIModality =
  | 'intake-text'
  | 'voice-transcript'
  | 'report-text'
  | 'report-image-ocr'
  | 'report-metadata'
  | 'report-findings'
  | 'visual-ocr'
  | 'visual-metadata'
  | 'followup-question'
  | 'followup-answer'
  | 'timeline-event'
  | 'timeline-summary'
  | 'clinician-note'
  | 'structured-note'
  | 'referral-note'
  | 'audit-detail'
  | 'export-file'
  | 'log-message'
  | 'error-message'
  | 'toast-pii'
  | 'filename-pii'
  | 'demo-data'
  | 'anonymisation-report'
  | 'redaction-map'

/** Every class of identifier the pipeline detects. */
export type PIICategory =
  | 'person-name'
  | 'honorific-name'
  | 'phone'
  | 'aadhaar'
  | 'pan'
  | 'voter-id'
  | 'ration-card'
  | 'passport'
  | 'driving-license'
  | 'email'
  | 'address'
  | 'dob'
  | 'age-with-name'
  | 'facility-id'
  | 'patient-id'
  | 'lab-name'
  | 'hospital-name'
  | 'doctor-name'
  | 'relative-name'
  | 'vehicle-number'
  | 'insurance-number'
  | 'bank-account'
  | 'ip-address'
  | 'device-id'
  | 'gps'
  | 'url-with-id'
  | 'face-region'
  | 'name-plate-region'
  | 'id-card-region'
  | 'phone-region'
  | 'address-region'
  | 'wristband-region'
  | 'qr-barcode'
  | 'filename-pii'
  | 'session-label-pii'
  | 'toast-pii'
  | 'audit-display-name'
  | 'unknown'

/** A single detector rule. `replacement` is the canonical (English) placeholder. */
export interface PiiPattern {
  category: PIICategory
  pattern: RegExp
  replacement: string
  confidence: number
  /** Language the rule is authored for; absent means it applies to every language. */
  language?: SupportedLanguage
}

export const ALL_PII_CATEGORIES: PIICategory[] = [
  'person-name',
  'honorific-name',
  'phone',
  'aadhaar',
  'pan',
  'voter-id',
  'ration-card',
  'passport',
  'driving-license',
  'email',
  'address',
  'dob',
  'age-with-name',
  'facility-id',
  'patient-id',
  'lab-name',
  'hospital-name',
  'doctor-name',
  'relative-name',
  'vehicle-number',
  'insurance-number',
  'bank-account',
  'ip-address',
  'device-id',
  'gps',
  'url-with-id',
  'face-region',
  'name-plate-region',
  'id-card-region',
  'phone-region',
  'address-region',
  'wristband-region',
  'qr-barcode',
  'filename-pii',
  'session-label-pii',
  'toast-pii',
  'audit-display-name',
  'unknown',
]

export const ALL_PII_MODALITIES: PIIModality[] = [
  'intake-text',
  'voice-transcript',
  'report-text',
  'report-image-ocr',
  'report-metadata',
  'report-findings',
  'visual-ocr',
  'visual-metadata',
  'followup-question',
  'followup-answer',
  'timeline-event',
  'timeline-summary',
  'clinician-note',
  'structured-note',
  'referral-note',
  'audit-detail',
  'export-file',
  'log-message',
  'error-message',
  'toast-pii',
  'filename-pii',
  'demo-data',
  'anonymisation-report',
  'redaction-map',
]

export interface PIIMatch {
  category: PIICategory
  modality: PIIModality
  /** Character range in the ORIGINAL text (0/0 for image regions). */
  span: { start: number; end: number }
  /** Original substring. Populated internally only; removed by `scrubRaw`. */
  raw?: string
  replacement: string
  confidence: number
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
  language: SupportedLanguage
}

export interface ModalityAnonymisationReport {
  modality: PIIModality
  matches: PIIMatch[]
  redactedCount: number
  durationMs: number
  warnings: string[]
}

export interface AnonymisationCoverage {
  totalCandidates: number
  redacted: number
  skipped: number
  unknown: number
  coverageRatio: number
}

export interface AnonymisationReport {
  id: string
  sessionId?: string
  sourceModality: PIIModality
  matches: PIIMatch[]
  redactedCount: number
  warnings: string[]
  coverage: AnonymisationCoverage
  createdAt: string
  actorId: string
  actorRole: UserRole
  language?: SupportedLanguage
}

/** The authenticated actor driving a run. Display name is never carried here — username only. */
export interface AnonymisationActor {
  id: string
  username: string
  role: UserRole
}

export interface AnonymisationPipelineInput {
  modality: PIIModality
  text?: string
  imageBuffer?: Buffer
  language?: SupportedLanguage
  sessionId?: string
  actor: AnonymisationActor
}

export interface AnonymisationPipelineResult {
  text?: string
  anonymisedImageBuffer?: Buffer
  report: AnonymisationReport
}

export type ReviewerVerdict = 'false-positive' | 'false-negative' | 'correct'

export interface ReviewerFeedback {
  id: string
  sessionId?: string
  reportId: string
  modality: PIIModality
  matchIndex: number
  verdict: ReviewerVerdict
  note?: string
  actorId: string
  actorRole: UserRole
  createdAt: string
}

export interface AnonymisationMetrics {
  byCategory: Record<PIICategory, number>
  byModality: Record<PIIModality, number>
  totalRedacted: number
  totalSkipped: number
  totalUnknown: number
  coverageRatio: number
  feedbackCount: number
  falsePositiveCount: number
  falseNegativeCount: number
  lastRunAt: string | null
}
