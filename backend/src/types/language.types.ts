/**
 * Multilingual analysis model (P0-3).
 *
 * Every analysis layer — urgency rules, missing-info checks, follow-up
 * question banks, banned (non-diagnostic) phrases, section labels and
 * disclaimers — is registered per language in a {@link LanguageRuleSet}.
 * Consumers must go through the rule registry and never embed language
 * switches.
 */

import type {
  FollowUpQuestion,
  IntakeLanguage,
  MissingInfoItem,
  UrgencyFlag,
} from './index'
import type { ConfidenceScore } from './confidence.types'

export type SupportedLanguage = 'en' | 'hi' | 'or'

export type ScriptKind = 'latin' | 'devanagari' | 'odia' | 'mixed'

export interface DetectedLanguage {
  /** Best-supported-language guess: hi for Hinglish, or for Odlish. */
  code: SupportedLanguage
  /** Max script ratio (0..1) — how confident the script vote is, not a clinical score. */
  confidence: number
  script: ScriptKind
  /** True when more than one script is present (Hinglish / Odlish). */
  isMixed: boolean
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
}

/** One workflow urgency signal: pattern list → flag. Never a diagnosis. */
export interface UrgencyRule {
  id: string
  label: string
  patterns: RegExp[]
  severity: UrgencyFlag['severity']
  reason: string
}

/** A missing-information check. The item is *missing* when no pattern hits. */
export interface MissingInfoCheck {
  id: string
  label: string
  /** Presence patterns: if none match, the field is reported as missing. */
  patterns: RegExp[]
  whyItMatters: string
  /** Who the missing field applies to (P2-18). A workflow label, never clinical. */
  targetType?: 'patient' | 'staff' | 'either'
}

export interface FollowUpQuestionTemplate {
  id: string
  category: string
  text: string
  target: 'patient' | 'staff'
  priority: number
}

export interface BannedPhrase {
  pattern: RegExp
  replacement: string
}

/** Language-specific labels for the structured note build. */
export interface SectionLabels {
  chiefComplaint: string
  history: string
  vitals: string
  timeline: string
  missingInfo: string
  followUps: string
}

export interface LanguageRuleSet {
  language: SupportedLanguage
  urgencyRules: UrgencyRule[]
  missingInfoChecks: MissingInfoCheck[]
  followUpQuestions: FollowUpQuestionTemplate[]
  bannedPhrases: BannedPhrase[]
  sectionLabels: SectionLabels
  disclaimer: string
}

/** Urgency flag enriched with the language + the matched source text. */
export interface TranslatedUrgencyFlag extends UrgencyFlag {
  language: SupportedLanguage
  /** The sentence the signal came from (kept for the human reviewer). */
  originalText: string
  matchedText: string
}

export interface TranslatedMissingInfoItem extends MissingInfoItem {
  language: SupportedLanguage
}

export interface TranslatedFollowUpQuestion extends FollowUpQuestion {
  language: SupportedLanguage
}

export interface MultilingualAnalyzeInput {
  text: string
  /** When omitted (or autoDetect is true) the language is detected. */
  language?: SupportedLanguage
  autoDetect?: boolean
}

export interface MultilingualAnonymizeResult {
  text: string
  report: {
    redactedCount: number
    redactions: Array<{ category: string; count: number }>
    byLanguage: Array<{ language: SupportedLanguage; count: number }>
  }
}

/** Accepts the product-level display enum ('English' | 'Hindi' | 'Odia'). */
export interface LanguageLabel {
  code: SupportedLanguage
  label: IntakeLanguage
}