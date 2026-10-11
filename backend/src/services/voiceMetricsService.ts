import { HttpError } from '../middleware/errorHandler'
import type { SupportedLanguage, VoiceIntakeMetrics } from '../types'

/**
 * Voice intake metrics (P2-18 item I).
 *
 * Descriptive metrics about a voice capture — duration, detected language,
 * transcript length and extraction confidence. This is never a clinical score:
 * it exists so a facility can see how often voice intake is used and how well
 * the transcription ran. Stored in-memory (one latest record per session).
 */

const metrics = new Map<string, VoiceIntakeMetrics>()

export interface RecordVoiceMetricsInput {
  sessionId: string
  durationMs: number
  languageDetected: SupportedLanguage
  transcriptLength: number
  confidence: number
  recordedBy: string
  recordedAt?: string
}

export function buildVoiceIntakeMetrics(input: RecordVoiceMetricsInput): VoiceIntakeMetrics {
  if (!input.sessionId.trim()) throw new HttpError(400, 'sessionId is required.')
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    throw new HttpError(400, 'durationMs must be a non-negative number.')
  }
  if (!Number.isInteger(input.transcriptLength) || input.transcriptLength < 0) {
    throw new HttpError(400, 'transcriptLength must be a non-negative integer.')
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new HttpError(400, 'confidence must be between 0 and 1.')
  }
  return {
    sessionId: input.sessionId.trim(),
    durationMs: Math.round(input.durationMs),
    languageDetected: input.languageDetected,
    transcriptLength: input.transcriptLength,
    confidence: input.confidence,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    recordedBy: input.recordedBy,
  }
}

export function recordVoiceIntakeMetrics(input: RecordVoiceMetricsInput): VoiceIntakeMetrics {
  const record = buildVoiceIntakeMetrics(input)
  metrics.set(record.sessionId, record)
  return record
}

export function getVoiceIntakeMetrics(sessionId: string): VoiceIntakeMetrics | undefined {
  return metrics.get(sessionId)
}

export function listVoiceIntakeMetrics(): VoiceIntakeMetrics[] {
  return [...metrics.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}

export function clearVoiceIntakeMetrics(): void {
  metrics.clear()
}
