import type {
  DetectedLanguage,
  IntakeLanguage,
  ScriptKind,
  SupportedLanguage,
} from '../types'
import { computeLanguageConfidence } from './confidenceService'

/**
 * Script-ratio language detection (P0-3).
 *
 * Only the written script is consulted — the detector is deliberately small so
 * it has no dictionaries and no opinion about *meaning*. Hinglish = Latin
 * dominant + Devanagari present; Odlish = Latin dominant + Odia present.
 */

/** Devanagari (Hindi) code block, including Devanagari punctuation. */
const DEVANAGARI_RANGE = /[\u0900-\u097F]/gu
/** Odia script block. */
const ODIA_RANGE = /[\u0B00-\u0B7F]/gu
const LATIN_RANGE = /[A-Za-z]/gu
function countMatches(text: string, range: RegExp): number {
  return (text.match(range) ?? []).length
}

/** Purely graphical — script presence, no lexical proof. */
function detectScriptLanguageBase(text: string): DetectedLanguage {
  const devanagari = countMatches(text, DEVANAGARI_RANGE)
  const odia = countMatches(text, ODIA_RANGE)
  const latin = countMatches(text, LATIN_RANGE)
  const nonLatin = devanagari + odia
  const sampleTotal = Math.max(1, nonLatin + latin)
  const latinRatio = latin / sampleTotal
  const devanagariRatio = devanagari / sampleTotal
  const odiaRatio = odia / sampleTotal

  if (devanagariRatio > 0.3) {
    const isMixed = latin > 0 && nonLatin > 0
    return { code: 'hi', confidence: devanagariRatio, script: isMixed ? 'mixed' : 'devanagari', isMixed }
  }

  if (odiaRatio > 0.3) {
    const isMixed = latin > 0 && nonLatin > 0
    return { code: 'or', confidence: odiaRatio, script: isMixed ? 'mixed' : 'odia', isMixed }
  }

  if (latinRatio > 0.7) {
    return { code: 'en', confidence: latinRatio, script: 'latin', isMixed: false }
  }

  // Low-signal input: prefer whichever script is actually present.
  const confidence = Math.max(devanagariRatio, odiaRatio, latinRatio)
  if (devanagari >= odia && devanagari > 0) {
    return { code: 'hi', confidence, script: nonLatin > 0 && latin > 0 ? 'mixed' : 'devanagari', isMixed: latin > 0 && nonLatin > 0 }
  }
  if (odia > 0) {
    return { code: 'or', confidence, script: nonLatin > 0 && latin > 0 ? 'mixed' : 'odia', isMixed: latin > 0 && nonLatin > 0 }
  }
  return { code: 'en', confidence, script: 'latin', isMixed: false }
}

/** Script detection + an attached explainable confidence score (P2-14). */
export function detectScriptLanguage(text: string): DetectedLanguage {
  const detected = detectScriptLanguageBase(text)
  detected.confidenceScore = computeLanguageConfidence(detected)
  return detected
}

/**
 * Normalises a language label from any accepted input ('English', 'en',
 * 'Hindi', 'hi', 'Odia', 'or') to a scheme code. Unknown values resolve to the
 * detected language of the text (never throw).
 */
export function normalizeLanguage(
  value: string | undefined,
  text: string,
  fallback: SupportedLanguage = detectScriptLanguage(text).code,
): SupportedLanguage {
  switch ((value ?? '').toLowerCase()) {
    case 'en':
    case 'english':
      return 'en'
    case 'hi':
    case 'hindi':
      return 'hi'
    case 'or':
    case 'odia':
    case 'oriya':
      return 'or'
    default:
      return fallback
  }
}

/** Maps a scheme code back to the product-level display enum. */
export function toIntakeLanguage(code: SupportedLanguage): IntakeLanguage {
  switch (code) {
    case 'hi':
      return 'Hindi'
    case 'or':
      return 'Odia'
    default:
      return 'English'
  }
}

/** Maps the product enum to a scheme code. */
export function fromIntakeLanguage(label: IntakeLanguage): SupportedLanguage {
  switch (label) {
    case 'Hindi':
      return 'hi'
    case 'Odia':
      return 'or'
    default:
      return 'en'
  }
}

export type { DetectedLanguage, ScriptKind, SupportedLanguage }