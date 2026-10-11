import type { AnalyzeRequest, TriageNote } from '../types'
import { fromIntakeLanguage } from './languageDetectionService'
import { analyzeWithFallback } from './multilingualTriageService'

/**
 * Legacy-compatible triage entry point (P0-3).
 *
 * Keeps the classic `analyze({ text, language })` contract for callers that
 * think in product-level display enums, backing onto the multilingual pipeline
 * with English as the default language.
 */
export function analyze(req: AnalyzeRequest): TriageNote {
  const code = fromIntakeLanguage(req.language ?? 'English')
  return analyzeWithFallback({ text: req.text, language: code }).note
}