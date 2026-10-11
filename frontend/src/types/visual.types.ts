/**
 * Visual input (photo) model (P0-2).
 *
 * Mirrors backend/src/types/visual.types.ts. Same hard rules:
 *  - The stored image is ALWAYS the redacted JPEG (EXIF/GPS stripped, PII
 *    black-boxed). The raw original never reaches the browser.
 *  - Extraction output is descriptive and non-diagnostic: concern flags are
 *    questions for a human, never advice.
 *  - Human-in-the-loop: every photo starts as `pending-review`; only a doctor
 *    (or admin) can verify, reject or delete it.
 */

import type { UserRole } from './triage'

export type VisualType =
  | 'wound'
  | 'rash'
  | 'report-photo'
  | 'xray'
  | 'scan'
  | 'swelling'
  | 'bruise'
  | 'eye'
  | 'oral'
  | 'ear'
  | 'general'
  | 'unknown'

export type VisualReviewStatus = 'pending-review' | 'verified' | 'rejected'

/** Normalised 0..1 bounding box (resolution-independent). */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export type PiiType =
  | 'face'
  | 'name-plate'
  | 'hospital-band'
  | 'wristband'
  | 'phone'
  | 'address'
  | 'id-number'
  | 'email'
  | 'date-of-birth'
  | 'hospital-id'
  | 'patient-id'
  | 'aadhaar'
  | 'pan'
  | 'voter-id'
  | 'ration-card'
  | 'lab-name'

export interface PiiRegion {
  id: string
  type: PiiType
  bbox: BoundingBox
  /** 0..1 confidence that the region genuinely holds PII — never a clinical score. */
  confidence: number
  source: 'face-heuristic' | 'ocr-label'
}

export interface PiiSummary {
  regionCount: number
  byType: Array<{ type: PiiType; count: number }>
}

/** One row of non-diagnostic, descriptive output (safe vocabulary only). */
export interface VisualFeature {
  id: string
  label: string
  value: string
  confidence: number
}

/** A neutral observation that should make a human look again — not a diagnosis. */
export interface VisualConcern {
  id: string
  severity: 'amber'
  label: string
  reason: string
  ruleId: string
  /** A follow-up question or an in-person inspection request — never care advice. */
  suggestedAction: string
}

export interface VisualExtraction {
  visualType: VisualType
  typeConfidence: number
  typeBasis: string
  appearance: string[]
  features: VisualFeature[]
  concerns: VisualConcern[]
  annotatedWords: number
  ocrConfidence: number
}

export interface VisualRecord {
  id: string
  sessionId: string
  patientId: string
  fileName: string
  originalMimeType: string
  originalSizeBytes: number
  storedMimeType: 'image/jpeg'
  width: number
  height: number
  visualType: VisualType
  status: VisualReviewStatus
  pii: PiiRegion[]
  piiSummary: PiiSummary
  extraction: VisualExtraction
  warnings: string[]
  disclaimer: string
  reviewedBy: string | null
  reviewedByRole: UserRole | null
  reviewNote: string | null
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

/** GET /sessions/:id/visuals response. */
export interface VisualsView {
  visuals: VisualRecord[]
  disclaimer: string
}

/** Result of processing one uploaded photo (stored record + its warnings). */
export interface VisualExtractionResult {
  visual: VisualRecord
  warnings: string[]
}

/** POST upload response — the session view plus per-file processing results. */
export interface UploadVisualsResponse extends VisualsView {
  processing: VisualExtractionResult[]
}

/** GET /visuals/:id, POST verify/reject responses. */
export interface VisualDetailResponse {
  visual: VisualRecord
}

/** DELETE /visuals/:id response. */
export interface DeleteVisualResponse extends VisualsView {
  deleted: true
  fileName: string
}
