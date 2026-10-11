import { randomUUID } from 'node:crypto'
import { HttpError } from '../middleware/errorHandler'
import type {
  AnonymisationPipelineInput,
  AnonymisationPipelineResult,
  AnonymisationReport,
  PIIMatch,
  PIIModality,
} from '../types/anonymisation.types'
import { addAudit } from './auditStore'
import {
  anonymiseErrorMessage,
  anonymiseImage,
  anonymiseLog,
  anonymiseText,
  buildCoverage,
} from './unifiedAnonymizer'

/**
 * The single anonymisation entry point (P0-7).
 *
 * Every PII-bearing service routes through {@link runPipeline}: it dispatches by
 * modality, aggregates matches into one report, writes an audit entry and never
 * stores or returns raw PII. It is idempotent — placeholders contain no PII, so
 * a second pass finds nothing new.
 */

export const PII_MODALITIES: PIIModality[] = [
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

const IMAGE_MODALITIES: PIIModality[] = ['report-image-ocr', 'visual-ocr', 'visual-metadata']

export function isPIIModality(value: unknown): value is PIIModality {
  return typeof value === 'string' && (PII_MODALITIES as string[]).includes(value)
}

const MAX_TEXT_LENGTH = 20000

function assertText(input: AnonymisationPipelineInput): string {
  const text = input.text
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new HttpError(400, 'Text is required')
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new HttpError(400, `Text exceeds the ${MAX_TEXT_LENGTH}-character limit.`)
  }
  return text
}

function auditRun(input: AnonymisationPipelineInput, report: AnonymisationReport): void {
  addAudit({
    sessionId: input.sessionId ?? 'anonymisation',
    actor: input.actor.username,
    role: input.actor.role,
    action: 'anonymisation.run',
    detail:
      `Anonymised ${input.modality} · ${report.redactedCount} match(es) · ` +
      `coverage ${report.coverage.coverageRatio.toFixed(2)} · ${report.warnings.length} warning(s).`,
    category: 'system',
  })
}

export async function runPipeline(input: AnonymisationPipelineInput): Promise<AnonymisationPipelineResult> {
  if (!isPIIModality(input.modality)) throw new HttpError(400, 'Unknown modality')

  let matches: PIIMatch[] = []
  let warnings: string[] = []
  let text: string | undefined
  let anonymisedImageBuffer: Buffer | undefined

  if (input.imageBuffer) {
    if (!IMAGE_MODALITIES.includes(input.modality) && input.modality !== 'report-metadata') {
      throw new HttpError(400, 'This modality does not accept an image.')
    }
    const image = await anonymiseImage(input.imageBuffer, input.modality, input.language)
    anonymisedImageBuffer = image.redactedImageBuffer
    matches = image.report.matches
    warnings = image.report.warnings
  } else if (input.modality === 'log-message') {
    const source = assertText(input)
    const result = anonymiseText(source, input.modality, input.language)
    matches = result.matches
    warnings = result.warnings
    text = anonymiseLog(source)
  } else if (input.modality === 'error-message') {
    const source = assertText(input)
    const result = anonymiseText(source, input.modality, input.language)
    matches = result.matches
    warnings = result.warnings
    text = anonymiseErrorMessage(source)
  } else {
    const source = assertText(input)
    const result = anonymiseText(source, input.modality, input.language)
    matches = result.matches
    warnings = result.warnings
    text = result.text
  }

  const report: AnonymisationReport = {
    id: `anon-${randomUUID()}`,
    sessionId: input.sessionId,
    sourceModality: input.modality,
    matches,
    redactedCount: matches.length,
    warnings,
    coverage: buildCoverage(matches),
    createdAt: new Date().toISOString(),
    actorId: input.actor.id,
    actorRole: input.actor.role,
    language: input.language ?? matches[0]?.language,
  }

  auditRun(input, report)

  return { text, anonymisedImageBuffer, report }
}
