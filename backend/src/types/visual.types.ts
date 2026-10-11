/**
 * Visual input (photo) capture model (P0-2).
 *
 * Hard rules:
 *  - Images are accepted as JPG / PNG / HEIC / HEIF / WEBP and normalised to a
 *    JPEG with all EXIF metadata (including GPS location) stripped before
 *    anything else happens. The original bytes are never stored.
 *  - PII is detected (OCR text scan + a documented face heuristic) and painted
 *    over in-black IN the image BEFORE storage. The stored bytes are the
 *    redacted JPEG; the original is deleted. The redacted image and region
 *    type/bbox list are the only things ever returned — never a raw original
 *    and never raw PII text.
 *  - Nothing produced here is a diagnosis, a prescription or a treatment plan:
 *    the extraction layer emits descriptive, non-diagnostic observations plus
 *    concern flags phrased as questions for the healthcare worker. The `label`
 *    vocabulary is a fixed safe list (see safetyPolicy on the frontend), so a
 *    translation row can never become advice.
 *  - Human-in-the-loop: every visual starts as `pending-review`; only a doctor
 *    (or admin) can verify, reject or delete it.
 */

import type { UserRole } from './index'
import type { ConfidenceScore } from './confidence.types'

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
  /** How the region was found. */
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
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
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
  /** Basis/evidence for the inferred visual type (keywords, image stats, …). */
  typeBasis: string
  /** Short non-diagnostic observations about what the photo itself shows. */
  appearance: string[]
  features: VisualFeature[]
  concerns: VisualConcern[]
  /** Number of OCR words that were scanned for text-based PII. */
  annotatedWords: number
  /** Average OCR confidence (0..100); 0 when no words were read. */
  ocrConfidence: number
}

export interface VisualRecord {
  id: string
  sessionId: string
  patientId: string
  fileName: string
  /** Mimetype as uploaded (before normalisation). */
  originalMimeType: string
  /** Original size of the uploaded file in bytes (before normalisation). */
  originalSizeBytes: number
  /** Stored bytes are always a redacted JPEG. */
  storedMimeType: 'image/jpeg'
  width: number
  height: number
  visualType: VisualType
  status: VisualReviewStatus
  /** Redaction overlays that exist on the stored image. */
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

export interface VisualProcessedResult {
  visual: VisualRecord
  warnings: string[]
}

/** One file handed to the visual pipeline (multer memory storage). */
export interface VisualUploadFile {
  buffer: Buffer
  originalName: string
  mimeType: string
  size: number
}