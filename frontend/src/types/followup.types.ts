/**
 * Dynamic follow-up questions (P0-5) — frontend mirror of
 * backend/src/types/followup.types.ts and backend/src/types/index.ts
 * (FollowUpQuestion).
 *
 * Follow-up questions are context-aware, language-aware suggestions for a
 * healthcare worker: they organise and clarify what the patient already
 * reported, never request personal identifiers and never diagnose. The
 * generator lives server-side; this module only mirrors the wire shape plus
 * the rendering labels.
 *
 * Lifecycle (human-in-the-loop):
 *   suggested ──ask──▶ asked ──answer──▶ answered
 *      │                        └──skip──▶ skipped
 *      └──────skip──▶ skipped
 */

import type { LanguageCode } from './language.types'

/** Mirrors SupportedLanguage — 'en' | 'hi' | 'or'. */
export type FollowUpLanguage = LanguageCode

export type FollowUpStatus = 'suggested' | 'asked' | 'answered' | 'skipped'

/** Who a follow-up question is put to. */
export type FollowUpTarget = 'patient' | 'staff'

export type FollowUpSourceType =
  | 'missing-info'
  | 'urgency-flag'
  | 'report-lab'
  | 'report-vital'
  | 'report-text'
  | 'visual'
  | 'timeline-gap'
  | 'clinician'
  | 'fallback'

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

/** Stored question — mirrors backend FollowUpQuestion exactly. */
export interface FollowUpQuestion {
  id: string
  question: string
  language: FollowUpLanguage
  category: FollowUpCategory
  target: FollowUpTarget
  /** Display order (1 = asks this first). */
  priority: number
  /** Why this question matters — in the question's language. */
  reason: string
  /** What source triggered this question (urgency flag, report photo …). */
  sourceType: FollowUpSourceType
  /** Source the question came from: rule id, field label, report id, 'standard'. */
  sourceRef: string
  status: FollowUpStatus
  /** When the staff put this question to the patient / team. */
  askedAt?: string
  answeredAt?: string
  answeredBy?: string
  /** Anonymised, verbatim answer recorded in the patient's own language. */
  answer?: string
  answerLanguage?: FollowUpLanguage
  createdAt: string
  updatedAt: string
}

/** Clinician-authored question input (add / PATCH). */
export interface ClinicianFollowUpInput {
  text: string
  language: FollowUpLanguage
  category: FollowUpCategory
  target: FollowUpTarget
}

/** Human-in-the-loop correction of a suggested question. */
export interface FollowUpEditPatch {
  question?: string
  category?: FollowUpCategory
  target?: FollowUpTarget
  priority?: number
}

/* ------------------------------------------------------------------ */
/*  Rendering labels (mirror backend FOLLOW_UP_*_LABELS)               */
/* ------------------------------------------------------------------ */

export const FOLLOW_UP_SOURCE_LABELS: Record<FollowUpLanguage, Record<FollowUpSourceType, string>> = {
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

export const FOLLOW_UP_TARGET_LABELS: Record<FollowUpLanguage, Record<FollowUpTarget, string>> = {
  en: { patient: 'For the patient', staff: 'For the clinic team' },
  hi: { patient: 'रोगी के लिए', staff: 'क्लिनिक टीम के लिए' },
  or: { patient: 'ରୋଗୀଙ୍କ ପାଇଁ', staff: 'କ୍ଲିନିକ ଦଳ ପାଇଁ' },
}

export const FOLLOW_UP_CATEGORY_LABELS: Record<FollowUpLanguage, Record<FollowUpCategory, string>> = {
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

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpLanguage, Record<FollowUpStatus, string>> = {
  en: {
    suggested: 'Suggested',
    asked: 'Asked',
    answered: 'Answered',
    skipped: 'Skipped',
  },
  hi: {
    suggested: 'सुझाया गया',
    asked: 'पूछा गया',
    answered: 'उत्तर दिया गया',
    skipped: 'छोड़ दिया गया',
  },
  or: {
    suggested: 'ପରାମର୍ଶିତ',
    asked: 'ପଚରାଗଲା',
    answered: 'ଉତ୍ତର ମିଳିଲା',
    skipped: 'ଏଡ଼ାଇ ଦିଆଗଲା',
  },
}