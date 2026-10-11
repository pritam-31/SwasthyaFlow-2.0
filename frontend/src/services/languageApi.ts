/**
 * Multilingual endpoints (P0-3).
 *
 * Language detection and analysis always run on the backend — the frontend
 * only posts text and renders results. A tiny script-range fallback exists so
 * the intake selector still labels the text when the backend is unreachable;
 * the backend remains the source of truth for stored sessions.
 */

import { request } from './api'
import type {
  DetectedLanguageInfo,
  LanguageCode,
  SectionLabels,
} from '../types/language.types'
import type { AnonymizationReport, IntakeLanguage, RiskScore, UrgencySeverity } from '../types/triage'

export interface SupportedLanguage {
  code: LanguageCode
  label: IntakeLanguage
  disclaimer: string
  sectionLabels: SectionLabels
}

export function getSupportedLanguages(): Promise<{ languages: SupportedLanguage[] }> {
  return request('/language/supported')
}

export function detectTextLanguage(text: string): Promise<{ detectedLanguage: DetectedLanguageInfo }> {
  return request('/language/detect', { method: 'POST', body: JSON.stringify({ text }) })
}

/** The AI draft returned by the staff-only analyze endpoint. */
export interface AnalyzeNoteDto {
  structuredNote: { chiefComplaint: string; history: string; vitals: string }
  observations: string[]
  urgencyFlags: Array<{ id: string; label: string; severity: UrgencySeverity; reason: string; ruleId: string }>
  missingInformation: Array<{ id: string; field: string; whyItMatters: string }>
  followUpQuestions: Array<{ id: string; question: string }>
  riskScore: RiskScore
  disclaimer: string
}

export interface TriageAnalyzeResult {
  note: AnalyzeNoteDto
  anonymization: AnonymizationReport
  detectedLanguage: DetectedLanguageInfo
  language: LanguageCode
}

/**
 * Staff-only stateless analysis (nurse / doctor / admin). `auto` tells the
 * backend to detect the language instead of trusting a marker.
 */
export function analyzeText(
  text: string,
  language: 'auto' | LanguageCode | IntakeLanguage = 'auto',
): Promise<TriageAnalyzeResult> {
  const body: Record<string, unknown> = { text }
  if (language === 'auto') body.autoDetect = true
  else body.language = language
  return request('/triage/analyze', { method: 'POST', body: JSON.stringify(body) })
}

/* ---------------- Offline fallback (labels only) ---------------- */

const DEVANAGARI = /[\u0900-\u097F]/g
const ODIA = /[\u0B00-\u0B7F]/g
const LATIN = /[A-Za-z]/g

function scriptRatio(text: string, re: RegExp): number {
  const scriptChars = text.match(re)?.length ?? 0
  const letters = text.match(/[\u0900-\u097F\u0B00-\u0B7FA-Za-z]/g)?.length ?? 0
  return letters === 0 ? 0 : scriptChars / letters
}

/**
 * Basic script-vote detection used only when the backend is unreachable. Kept
 * aligned with the backend thresholds so the badge never disagrees in a normal
 * session.
 */
export function detectScriptLanguageFallback(text: string): DetectedLanguageInfo | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const devanagari = scriptRatio(trimmed, DEVANAGARI)
  const odia = scriptRatio(trimmed, ODIA)
  const latin = scriptRatio(trimmed, LATIN)
  const max = Math.max(devanagari, odia, latin)

  if (devanagari > 0.3) {
    return { code: 'hi', label: 'Hindi', confidence: devanagari, script: 'devanagari', isMixed: odia > 0 && devanagari < 1 }
  }
  if (odia > 0.3) {
    return { code: 'or', label: 'Odia', confidence: odia, script: 'odia', isMixed: devanagari > 0 && odia < 1 }
  }
  if (latin > 0.7) {
    return { code: 'en', label: 'English', confidence: latin, script: 'latin', isMixed: false }
  }
  if (max > 0 && devanagari > odia) {
    return { code: 'hi', label: 'Hindi', confidence: devanagari, script: devanagari > 0 && latin > 0 ? 'mixed' : 'devanagari', isMixed: latin > 0 }
  }
  if (max > 0 && odia > devanagari) {
    return { code: 'or', label: 'Odia', confidence: odia, script: odia > 0 && latin > 0 ? 'mixed' : 'odia', isMixed: latin > 0 }
  }
  return null
}