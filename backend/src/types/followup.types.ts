/**
 * Dynamic follow-up questions (P0-5).
 *
 * Types for the generator, the stored questions and the language plans. The
 * stored shape lives in `./index` (FollowUpQuestion) — this module only adds
 * the generator-only types and the language labels used when rendering.
 */

import type {
  FollowUpSourceType,
  FollowUpTarget,
  MissingInfoItem,
  SupportedLanguage,
  UrgencyFlag,
} from './index'
import type { ConfidenceScore } from './confidence.types'

export type FollowUpCategory =
  | 'timeline'
  | 'severity'
  | 'vitals'
  | 'hydration'
  | 'medication'
  | 'allergies'
  | 'history'
  | 'responsiveness'
  | 'pain'
  | 'bleeding'
  | 'consciousness'
  | 'symptom-detail'
  | 'report'
  | 'lab-review'
  | 'visual'
  | 'safety-recheck'
  | 'clinician'
  | 'other'

/** One reusable question template for a single language. */
export interface FollowUpTemplate {
  id: string
  category: FollowUpCategory
  text: string
  target: FollowUpTarget
  priority: number
  /** Why this question matters — in the template's language. */
  reason: string
  /** What source this template supplies. */
  sourceType: FollowUpSourceType
  /**
   * Regex-like pattern tested against a missing-info field label (per language).
   * Written to match the rule-set label AND the CHK-xx token as a safety net.
   */
  sourceRefPattern?: string
  /**
   * Canonical urgency rule id this template answers (URG-01 … URG-08).
   * Language-prefixed ids (URG-HI-01 / URG-OR-01) are canonicalised before
   * matching, so one template serves all three languages.
   */
  urgencyRuleId?: string
}

/** Single-language template plan. */
export interface FollowUpLanguagePlan {
  language: SupportedLanguage
  /** Template for a missing-info item no specific pattern caught. */
  genericMissingInfo: FollowUpTemplate
  templates: FollowUpTemplate[]
  /** Static fallback bank (the rule sets' own static questions). */
  staticFallback: FollowUpTemplate[]
}

/** Draft produced by the generator before ids/timestamps are attached. */
export interface FollowUpQuestionDraft {
  question: string
  language: SupportedLanguage
  category: FollowUpCategory
  target: FollowUpTarget
  priority: number
  reason: string
  sourceType: FollowUpSourceType
  sourceRef: string
  /** Explainable confidence of the generating signal (P2-14). */
  confidenceScore?: ConfidenceScore
}

export interface FollowUpGenerationInput {
  language: SupportedLanguage
  displayText: string
  urgencyFlags: UrgencyFlag[]
  missingInformation: MissingInfoItem[]
  /** Optional extra sources already uploaded to the session. */
  reports?: Array<{ id: string; type: string }>
  visuals?: Array<{ id: string }>
  hasTimeline?: boolean
  maxCount?: number
}

export interface FollowUpGenerationResult {
  drafts: FollowUpQuestionDraft[]
  /** Templates skipped on purpose (safety): each entry is human-readable. */
  warnings: string[]
}

/** Rendering labels, per language. Read by the frontend mirror too. */
export const FOLLOW_UP_SOURCE_LABELS: Record<SupportedLanguage, Record<FollowUpSourceType, string>> = {
  en: {
    'missing-info': 'Missing information',
    'urgency-flag': 'Urgency signal',
    'report-lab': 'Lab report',
    'report-vital': 'Vitals report',
    'report-text': 'Report',
    visual: 'Photo',
    'timeline-gap': 'Timeline',
    clinician: 'Clinician-added',
    fallback: 'Standard check',
  },
  hi: {
    'missing-info': 'अनुपलब्ध जानकारी',
    'urgency-flag': 'तात्कालिक संकेत',
    'report-lab': 'प्रयोगशाला रिपोर्ट',
    'report-vital': 'महत्वपूर्ण संकेत रिपोर्ट',
    'report-text': 'रिपोर्ट',
    visual: 'फोटो',
    'timeline-gap': 'समयरेखा',
    clinician: 'चिकित्सक-जोड़ा गया',
    fallback: 'मानक जांच',
  },
  or: {
    'missing-info': 'ଅନୁପସ୍ଥିତ ସୂଚନା',
    'urgency-flag': 'ଜରୁରୀ ସଙ୍କେତ',
    'report-lab': 'ପରୀକ୍ଷାଗାର ରିପୋର୍ଟ',
    'report-vital': 'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ ରିପୋର୍ଟ',
    'report-text': 'ରିପୋର୍ଟ',
    visual: 'ଫଟୋ',
    'timeline-gap': 'ସମୟକ୍ରମ',
    clinician: 'ଚିକିତ୍ସକ-ଯୋଡ଼ା',
    fallback: 'ମାନକ ଯାଞ୍ଚ',
  },
}

export const FOLLOW_UP_TARGET_LABELS: Record<SupportedLanguage, Record<FollowUpTarget, string>> = {
  en: { patient: 'For the patient', staff: 'For the clinic team' },
  hi: { patient: 'रोगी के लिए', staff: 'क्लिनिक टीम के लिए' },
  or: { patient: 'ରୋଗୀଙ୍କ ପାଇଁ', staff: 'କ୍ଲିନିକ ଦଳ ପାଇଁ' },
}

export const FOLLOW_UP_CATEGORY_LABELS: Record<SupportedLanguage, Record<FollowUpCategory, string>> = {
  en: {
    timeline: 'Timeline',
    severity: 'Severity',
    vitals: 'Vitals',
    hydration: 'Hydration',
    medication: 'Medication',
    allergies: 'Allergies',
    history: 'History',
    responsiveness: 'Responsiveness',
    pain: 'Pain',
    bleeding: 'Bleeding',
    consciousness: 'Consciousness',
    'symptom-detail': 'Symptom detail',
    report: 'Report review',
    'lab-review': 'Lab follow-up',
    visual: 'Photo review',
    'safety-recheck': 'Safety re-check',
    clinician: 'Clinician',
    other: 'General check',
  },
  hi: {
    timeline: 'समयरेखा',
    severity: 'गंभीरता',
    vitals: 'महत्वपूर्ण संकेत',
    hydration: 'पानी की कमी',
    medication: 'दवा',
    allergies: 'एलर्जी',
    history: 'इतिहास',
    responsiveness: 'प्रतिक्रिया',
    pain: 'दर्द',
    bleeding: 'खून बहना',
    consciousness: 'चेतना',
    'symptom-detail': 'लक्षण विवरण',
    report: 'रिपोर्ट समीक्षा',
    'lab-review': 'प्रयोगशाला अनुवर्ती',
    visual: 'फोटो समीक्षा',
    'safety-recheck': 'सुरक्षा पुनर्जांच',
    clinician: 'चिकित्सक',
    other: 'सामान्य जांच',
  },
  or: {
    timeline: 'ସମୟକ୍ରମ',
    severity: 'ଗମ୍ଭୀରତା',
    vitals: 'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ',
    hydration: 'ଜଳ ଅଭାବ',
    medication: 'ଔଷଧ',
    allergies: 'ଆଲର୍ଜି',
    history: 'ଇତିହାସ',
    responsiveness: 'ପ୍ରତିକ୍ରିୟା',
    pain: 'ଯନ୍ତ୍ରଣା',
    bleeding: 'ରକ୍ତସ୍ରାବ',
    consciousness: 'ଚେତା',
    'symptom-detail': 'ଲକ୍ଷଣ ବିବରଣୀ',
    report: 'ରିପୋର୍ଟ ସମୀକ୍ଷା',
    'lab-review': 'ପରୀକ୍ଷାଗାର ଅନୁସରଣ',
    visual: 'ଫଟୋ ସମୀକ୍ଷା',
    'safety-recheck': 'ସୁରକ୍ଷା ପୁନଃଯାଞ୍ଚ',
    clinician: 'ଚିକିତ୍ସକ',
    other: 'ସାଧାରଣ ଯାଞ୍ଚ',
  },
}