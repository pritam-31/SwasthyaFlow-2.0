import type { AnonymizationReport, RedactionCategory, SupportedLanguage } from '../types'
import { detectScriptLanguage, normalizeLanguage } from './languageDetectionService'
import { anonymiseText, toLegacyAnonymizationReport } from './unifiedAnonymizer'

/**
 * Language-aware PII stripping (P0-3).
 *
 * @deprecated The rules now live in the unified pipeline (P0-7); this module is
 * a thin backwards-compatible shim. New code should call `anonymiseText` /
 * `runPipeline` from `services/unifiedAnonymizer` / `services/anonymisationPipeline`.
 */

export const REDACTED_LABELS: Record<RedactionCategory, string> = {
  name: '[NAME REDACTED]',
  phone: '[PHONE REDACTED]',
  'id-number': '[ID REDACTED]',
  email: '[EMAIL REDACTED]',
  address: '[ADDRESS REDACTED]',
  'date-of-birth': '[DOB REDACTED]',
  'hospital-id': '[HOSPITAL ID REDACTED]',
  'patient-id': '[PATIENT ID REDACTED]',
  aadhaar: '[AADHAAR REDACTED]',
  pan: '[PAN REDACTED]',
  'voter-id': '[VOTER ID REDACTED]',
  'ration-card': '[RATION CARD REDACTED]',
  'lab-name': '[LAB REDACTED]',
}

export interface MultilingualAnonymizerResult {
  text: string
  report: AnonymizationReport
}

/**
 * Redact PII from free text in any supported language. When `language` is
 * omitted the script is detected; Hinglish/Odlish get the Latin rules too.
 */
export function anonymizeMultilingual(
  text: string,
  language?: SupportedLanguage | undefined,
): MultilingualAnonymizerResult {
  const result = anonymiseText(text, 'intake-text', language)
  const code = result.matches[0]?.language ?? normalizeLanguage(language, text, detectScriptLanguage(text).code)
  return { text: result.text, report: toLegacyAnonymizationReport(result.matches, code) }
}

/**
 * Deep-walk a payload and strip PII from every string it contains. Returns a
 * structurally identical copy; object identity is not preserved.
 */
export function sanitizePII<T>(value: T, language?: SupportedLanguage): T {
  if (typeof value === 'string') {
    return anonymiseText(value, 'audit-detail', language).text as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePII(item, language)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {}
    for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = sanitizePII(sub, language)
    }
    return copy as unknown as T
  }
  return value
}
