/**
 * Unified anonymisation model (P0-7) — frontend mirror of the backend contract
 * in backend/src/types/anonymisation.types.ts.
 *
 * Hard rules:
 *  - PII is stripped BEFORE storage, analysis, return, logging or export.
 *  - Raw PII is NEVER returned to the browser: the backend strips the internal
 *    `raw` match field (`scrubRaw`) before every response, so it is absent here.
 *  - Anonymisation never alters clinical meaning: only identifiers are removed.
 *  - Nothing here diagnoses, prescribes or advises treatment.
 */

import type { LanguageCode } from './language.types'
import type { UserRole } from './triage'

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

/**
 * A single detected identifier. The internal `raw` substring is never sent to
 * the browser; only the category, span, typed replacement and confidence.
 */
export interface PIIMatch {
  category: PIICategory
  modality: PIIModality
  /** Character range in the ORIGINAL text (0/0 for image regions). */
  span: { start: number; end: number }
  replacement: string
  confidence: number
  language: LanguageCode
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
  language?: LanguageCode
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

export interface FeedbackMetrics {
  falsePositives: number
  falseNegatives: number
  correct: number
  total: number
}

export interface HarnessFailure {
  case: string
  leak: string
}

export interface HarnessResult {
  passed: number
  failed: number
  failures: HarnessFailure[]
}

export interface AnonymisationPreviewResult {
  text: string
  report: AnonymisationReport
}

export interface AnonymisationImageResult {
  report: AnonymisationReport
  redactedImage?: string
}
