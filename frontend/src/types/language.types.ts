/**
 * Multilingual analysis model (P0-3) — frontend mirror of
 * backend/src/types/language.types.ts plus the intake selector values.
 *
 * The backend remains the source of truth for detection, transliteration,
 * rule sets and disclaimers. This file only mirrors the wire types and the
 * label copy the UI needs to render.
 */

import type { IntakeLanguage } from './triage'

export type LanguageCode = 'en' | 'hi' | 'or'

/** `auto` asks the analysis layer to detect the script from the text. */
export type LanguageSelectorValue = 'auto' | LanguageCode

export interface DetectedLanguageInfo {
  code: LanguageCode
  /** Display label of the detected language (English | Hindi | Odia). */
  label: IntakeLanguage
  /** Max script ratio (0..1) — the script vote, never a clinical score. */
  confidence: number
  script: 'latin' | 'devanagari' | 'odia' | 'mixed'
  /** True when more than one script is present (Hinglish / Odlish). */
  isMixed: boolean
}

/** Mirror of backend SectionLabels (what /language/supported returns). */
export interface SectionLabels {
  chiefComplaint: string
  history: string
  vitals: string
  timeline: string
  missingInfo: string
  followUps: string
}

export interface SupportedLanguage {
  code: LanguageCode
  label: IntakeLanguage
  disclaimer: string
  sectionLabels: SectionLabels
}

/** Native-script names shown in the language picker. */
export const LANGUAGE_NATIVE_LABEL: Record<LanguageCode, string> = {
  en: 'English',
  hi: 'हिन्दी',
  or: 'ଓଡ଼ିଆ',
}

export const INTAKE_LANGUAGE_BY_CODE: Record<LanguageCode, IntakeLanguage> = {
  en: 'English',
  hi: 'Hindi',
  or: 'Odia',
}

export const CODE_BY_INTAKE_LANGUAGE: Record<IntakeLanguage, LanguageCode> = {
  English: 'en',
  Hindi: 'hi',
  Odia: 'or',
}

/** Resolve the language selector (auto + scheme codes) to an intake language. */
export function resolveIntakeLanguage(
  value: LanguageSelectorValue,
  detected: DetectedLanguageInfo | null,
): IntakeLanguage {
  return value === 'auto' ? INTAKE_LANGUAGE_BY_CODE[detected?.code ?? 'en'] : INTAKE_LANGUAGE_BY_CODE[value]
}

/**
 * Frontend section labels for the reviewer's view-only label toggle. Values
 * for the structured fields mirror the backend sectionLabels; the survey
 * sections are labelled so staff can orient patients in their own language.
 */
export interface NoteSectionLabels {
  chiefComplaint: string
  history: string
  vitals: string
  urgencySignals: string
  observations: string
  missingInformation: string
  followUpQuestions: string
}

export const NOTE_SECTION_LABELS: Record<LanguageCode, NoteSectionLabels> = {
  en: {
    chiefComplaint: 'Chief complaint',
    history: 'History',
    vitals: 'Vitals (as reported)',
    urgencySignals: 'Urgency signals',
    observations: 'Extracted observations',
    missingInformation: 'Missing information',
    followUpQuestions: 'Follow-up questions for the patient',
  },
  hi: {
    chiefComplaint: 'मुख्य शिकायत',
    history: 'इतिहास',
    vitals: 'बताए गए महत्वपूर्ण संकेत',
    urgencySignals: 'तात्कालिक संकेत',
    observations: 'निकाले गए अवलोकन',
    missingInformation: 'अनुपलब्ध जानकारी',
    followUpQuestions: 'रोगी के लिए अनुवर्ती प्रश्न',
  },
  or: {
    chiefComplaint: 'ମୁଖ୍ୟ ଅଭିଯୋଗ',
    history: 'ଇତିହାସ',
    vitals: 'ରିପୋର୍ଟ ହୋଇଥିବା ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ',
    urgencySignals: 'ଜରୁରୀ ସଙ୍କେତ',
    observations: 'ବାହାର କରାଯାଇଥିବା ପର୍ଯ୍ୟବେକ୍ଷଣ',
    missingInformation: 'ଅନୁପସ୍ଥିତ ସୂଚନା',
    followUpQuestions: 'ରୋଗୀଙ୍କ ପାଇଁ ଅନୁସରଣ ପ୍ରଶ୍ନ',
  },
}