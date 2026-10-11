import { randomUUID } from 'node:crypto'
import { HttpError } from '../middleware/errorHandler'
import type { AuthUser } from './authStore'
import { addAudit } from './auditStore'
import { ingestVisualImage, STORED_IMAGE_MIME } from './imageIngestService'
import { deleteRedactedImage, getRedactedImage, saveRedactedImage } from './imageStore'
import { extractWordsFromImage } from './ocrService'
import { detectPii } from './piiDetectionService'
import { redactImage } from './redactionService'
import { buildCoverage, matchesFromImageRegions } from './unifiedAnonymizer'
import { storeReport } from './anonymisationReportService'
import {
  addVisualToSession,
  findVisual,
  getVisualsForSession,
  removeVisual,
  replaceVisual,
} from './sessionStore'
import { analyzeVisualImage, VISUAL_DISCLAIMER } from './visualFeatureService'
import type { PatientSession, VisualRecord, VisualType, VisualUploadFile } from '../types'

/**
 * Visual upload pipeline (P0-2).
 *
 * Order is strict and never re-arranged:
 *   1. ingest — magic-byte guard, ≤ 10 MB, HEIC/HEIF/WEBP/PNG → JPEG, rotate,
 *      downscale to ≤ 4096 px, EXIF (incl. GPS) stripped
 *   2. PII scan — OCR word boxes + face heuristic (both documented substitutes)
 *   3. redact — black-box the PII regions in the image
 *   4. analyse — NON-DIAGNOSTIC descriptors computed ONLY on redaction-excluded pixels
 *   5. store the REDACTED bytes, drop the original, audit
 *
 * Raw pixels and raw OCR text never leave this function: the API returns the
 * redacted image and region type/bbox lists, nothing else.
 */

export interface VisualsView {
  visuals: VisualRecord[]
  disclaimer: string
}

export interface ProcessedVisual {
  visual: VisualRecord
  warnings: string[]
}

export const MAX_VISUALS_PER_REQUEST = 5

const VISUAL_TYPES: VisualType[] = [
  'wound',
  'rash',
  'report-photo',
  'xray',
  'scan',
  'swelling',
  'bruise',
  'eye',
  'oral',
  'ear',
  'general',
  'unknown',
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function describePiiSummary(regions: VisualRecord['piiSummary']): string {
  if (regions.regionCount === 0) return 'no PII regions found'
  const parts = regions.byType.map(({ type, count }) => `${count} ${type}`)
  return `${regions.regionCount} PII region(s): ${parts.join(', ')}`
}

export async function processVisualUpload(
  session: PatientSession,
  user: AuthUser,
  files: VisualUploadFile[],
  declaredType?: VisualType,
): Promise<ProcessedVisual[]> {
  const results: ProcessedVisual[] = []

  for (const file of files) {
    // 1. Ingest + normalise + strip EXIF.
    const ingested = await ingestVisualImage(file)
    const warnings: string[] = []
    if (ingested.sourceExifStripped) {
      warnings.push('EXIF metadata (including GPS location if present) was stripped before storing the photo.')
    }

    // 2. PII scan (OCR words + face heuristic).
    const ocr = await extractWordsFromImage(ingested.buffer)
    warnings.push(...ocr.warnings.filter((w) => !w.startsWith('No readable text')))
    const pii = await detectPii(ingested, ocr.words)

    // 3. Black-box redaction — this is the byte stream that gets stored.
    const redactedBuffer = await redactImage(ingested.buffer, ingested.width, ingested.height, pii.regions)

    // 3b. Record the run for coverage + audit (P0-7). Only typed region metadata
    //     is stored here — never the raw pixels or OCR text.
    const anonMatches = matchesFromImageRegions(pii.regions, 'visual-ocr', 'en')
    storeReport({
      id: `anon-${randomUUID()}`,
      sessionId: session.id,
      sourceModality: 'visual-ocr',
      matches: anonMatches,
      redactedCount: anonMatches.length,
      warnings: [],
      coverage: buildCoverage(anonMatches),
      createdAt: new Date().toISOString(),
      actorId: user.id,
      actorRole: user.role,
      language: 'en',
    })
    addAudit({
      sessionId: session.id,
      actor: user.username,
      role: user.role,
      action: 'anonymisation.run',
      detail: `Anonymised visual-ocr · ${anonMatches.length} match(es).`,
      category: 'system',
    })

    // 4. Non-diagnostic analysis on redaction-excluded pixels only.
    const analysis = await analyzeVisualImage({
      image: ingested,
      piiRegions: pii.regions,
      ocrWords: pii.annotatedWords,
      ocrConfidence: pii.ocrConfidence,
      sourceText: session.displayText,
      declaredType,
    })
    warnings.push(...analysis.warnings)

    // 5. Store redacted bytes only; original buffer and raw OCR text are dropped here.
    const timestamp = new Date().toISOString()
    const visualId = `vis-${randomUUID()}`
    const visual: VisualRecord = {
      id: visualId,
      sessionId: session.id,
      patientId: session.patientId,
      fileName: analysis.extraction.visualType + '-' + visualId.slice(4, 12) + '.jpg',
      originalMimeType: ingested.originalMimeType,
      originalSizeBytes: ingested.originalSizeBytes,
      storedMimeType: STORED_IMAGE_MIME,
      width: ingested.width,
      height: ingested.height,
      visualType: analysis.extraction.visualType,
      status: 'pending-review',
      pii: pii.regions,
      piiSummary: pii.summary,
      extraction: analysis.extraction,
      warnings,
      disclaimer: VISUAL_DISCLAIMER,
      reviewedBy: null,
      reviewedByRole: null,
      reviewNote: null,
      rejectionReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    saveRedactedImage(visual.id, redactedBuffer, { sessionId: session.id })
    addVisualToSession(session.id, visual)

    const convertedNote = ingested.converted ? ' (converted to JPEG)' : ''
    addAudit({
      sessionId: session.id,
      actor: user.displayName,
      role: user.role,
      action: 'visual.uploaded',
      detail: `Uploaded photo "${file.originalName}" (${formatSize(ingested.originalSizeBytes)}${convertedNote}) — normalised to ${ingested.width}×${ingested.height}; original not stored.`,
      category: 'system',
    })
    addAudit({
      sessionId: session.id,
      actor: user.displayName,
      role: user.role,
      action: 'visual.pii_detected',
      detail: `${describePiiSummary(pii.summary)} via OCR text scan + face heuristic.`,
      category: 'system',
    })
    addAudit({
      sessionId: session.id,
      actor: user.displayName,
      role: user.role,
      action: 'visual.redacted',
      detail: `Redacted image stored (${pii.summary.regionCount} black-boxed region(s)); EXIF${ingested.sourceExifStripped ? ' (incl. GPS)' : ''} stripped; original deleted.`,
      category: 'system',
    })
    addAudit({
      sessionId: session.id,
      actor: user.displayName,
      role: user.role,
      action: 'visual.extracted',
      detail: `Auto-classified as "${visual.visualType}" (${analysis.extraction.typeBasis}) — ${analysis.extraction.features.length} descriptive rows + ${analysis.extraction.concerns.length} concern flag(s); awaiting doctor verification.`,
      category: 'system',
    })

    results.push({ visual, warnings })
  }

  return results
}

/* ------------------------------------------------------------------ */
/*  Read views                                                         */
/* ------------------------------------------------------------------ */

export function sessionVisualsView(session: PatientSession): VisualsView {
  return { visuals: session.visuals, disclaimer: VISUAL_DISCLAIMER }
}

export function visualDetailView(session: PatientSession, visualId: string): VisualRecord {
  const visual = session.visuals.find((v) => v.id === visualId)
  if (!visual) throw new HttpError(404, 'Visual not found.')
  return visual
}

export function findVisualInSession(session: PatientSession, visualId: string): VisualRecord {
  const visual = session.visuals.find((v) => v.id === visualId)
  if (!visual) throw new HttpError(404, 'Visual not found.')
  return visual
}

/** Resolves `/api/visuals/:visualId` across all sessions with patient-hiding. */
export function locateVisual(visualId: string, user: AuthUser): { session: PatientSession; visual: VisualRecord } {
  const found = findVisual(visualId)
  if (!found) throw new HttpError(404, 'Visual not found.')
  if (user.role === 'patient' && found.session.ownerId !== user.id) {
    throw new HttpError(404, 'Visual not found.')
  }
  return found
}

/** The stored bytes are always the redacted JPEG — nothing raw is ever kept. */
export function redactedImageBytes(visual: VisualRecord): { buffer: Buffer; mimeType: 'image/jpeg' } {
  const buffer = getRedactedImage(visual.id)
  if (!buffer) throw new HttpError(404, 'Stored redacted image is unavailable.')
  return { buffer, mimeType: STORED_IMAGE_MIME }
}

/* ------------------------------------------------------------------ */
/*  Human-in-the-loop review                                           */
/* ------------------------------------------------------------------ */

export function verifyVisual(
  session: PatientSession,
  user: AuthUser,
  visualId: string,
  reviewNote: string | null,
): VisualRecord {
  const target = findVisualInSession(session, visualId)
  if (target.status === 'verified') {
    throw new HttpError(409, 'This photo description is already verified.')
  }
  const verified: VisualRecord = {
    ...target,
    status: 'verified',
    reviewedBy: user.displayName,
    reviewedByRole: user.role,
    reviewNote: reviewNote ? reviewNote.slice(0, 500) : null,
    rejectionReason: null,
    updatedAt: new Date().toISOString(),
  }
  replaceVisual(session.id, verified)

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'visual.verified',
    detail: `Photo "${verified.fileName}" verified by a human reviewer — its descriptive notes are ready for triage use.`,
    category: 'decision',
  })

  return verified
}

export function rejectVisual(
  session: PatientSession,
  user: AuthUser,
  visualId: string,
  reason: string,
): VisualRecord {
  const cleaned = reason.trim()
  if (cleaned.length < 3 || cleaned.length > 500) {
    throw new HttpError(400, 'A rejection reason between 3 and 500 characters is required.')
  }
  const target = findVisualInSession(session, visualId)
  const rejected: VisualRecord = {
    ...target,
    status: 'rejected',
    reviewedBy: user.displayName,
    reviewedByRole: user.role,
    reviewNote: null,
    rejectionReason: cleaned,
    updatedAt: new Date().toISOString(),
  }
  replaceVisual(session.id, rejected)

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'visual.rejected',
    detail: `Photo "${rejected.fileName}" rejected by a human reviewer — reason: ${cleaned.slice(0, 120)}`,
    category: 'decision',
  })

  return rejected
}

export function deleteVisual(session: PatientSession, user: AuthUser, visualId: string): VisualsView {
  const target = findVisualInSession(session, visualId)
  removeVisual(session.id, visualId)
  // The redacted bytes are deleted with the record — nothing survives deletion.
  deleteRedactedImage(visualId)

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'visual.deleted',
    detail: `Photo "${target.fileName}" deleted from the session by a human reviewer (redacted image purged).`,
    category: 'edit',
  })

  const fresh = getVisualsForSession(session.id)
  return { visuals: fresh, disclaimer: VISUAL_DISCLAIMER }
}

export function isVisualType(value: string | undefined): value is VisualType {
  return typeof value === 'string' && VISUAL_TYPES.includes(value as VisualType)
}