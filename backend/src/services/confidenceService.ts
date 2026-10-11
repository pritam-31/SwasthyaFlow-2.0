/**
 * Deterministic confidence scoring engine (P2-14).
 *
 * Pure module: raw signals in → ConfidenceScore out. No sessions, no storage,
 * no audit, no randomness. Every value is the deterministic consequence of
 * observable inputs, clamped to [0.05, 0.99], and carries a non-diagnostic,
 * PII-free explanation in the item's own language.
 *
 * Hard rules (mirror types/confidence.types.ts):
 *  - Confidence is a WORKFLOW label about extraction reliability. It is never
 *    a diagnosis, prognosis or probability of a medical outcome.
 *  - The numeric `confidence` fields that already exist on items (report rows,
 *    timeline events, language detection, OCR, …) are NEVER changed — this
 *    feature only attaches the richer `confidenceScore` beside them.
 *  - Every free-text summary/detail runs through `enforceNonDiagnostic` before
 *    it can reach storage or a response.
 */

import { enforceNonDiagnostic, reportTypeKeywordHits } from './reportParser'
import { CONFIDENCE_BANDS } from '../types/confidence.types'
import type { PIIMatch } from '../types/anonymisation.types'
import type {
  ConfidenceBand,
  ConfidenceExplanation,
  ConfidenceScore,
  ConfidenceSignal,
  ConfidenceSignalDirection,
  ConfidenceThresholds,
  DetectedLanguage,
  FollowUpSourceType,
  LowConfidenceItem,
  LowConfidenceItemType,
  PatientSession,
  PriorityComponentKey,
  ReportOcrMeta,
  SessionConfidence,
  SupportedLanguage,
  TimelineEvent,
  TimePrecision,
  UrgencyFlag,
  VisualFeature,
} from '../types'

/** Draft signal used while composing an explanation (before sanitising). */
type SignalDraft = {
  key: string
  label: string
  direction: ConfidenceSignalDirection
  contribution: number
  detail: string
}

export const MIN_CONFIDENCE = 0.05
export const MAX_CONFIDENCE = 0.99

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  lowConfidenceThreshold: 0.6,
  veryLowConfidenceThreshold: 0.4,
  aggregateAlertThreshold: 0.6,
}

/** Fixed bounds for every facility policy (system level, mirrors POLICY_BOUNDS). */
export const CONFIDENCE_POLICY_BOUNDS = {
  lowConfidenceThreshold: { min: MIN_CONFIDENCE, max: MAX_CONFIDENCE },
  veryLowConfidenceThreshold: { min: MIN_CONFIDENCE, max: MAX_CONFIDENCE },
  aggregateAlertThreshold: { min: MIN_CONFIDENCE, max: MAX_CONFIDENCE },
} as const

export const TRIAGE_WEIGHTS = {
  urgency: 0.4,
  missing: 0.15,
  labs: 0.2,
  vitals: 0.15,
  timeline: 0.1,
} as const

export function bandForValue(value: number): ConfidenceBand {
  for (const { band, min } of CONFIDENCE_BANDS) {
    if (value >= min) return band
  }
  return 'very-low'
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return MIN_CONFIDENCE
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, value))
}

/** Rounding helper used at every aggregation point (kept full precision below). */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/* ------------------------------------------------------------------ */
/*  Localised explanation phrasing                                     */
/* ------------------------------------------------------------------ */

interface ConfidenceStrings {
  summaryLine: (value: string) => string
  noData: string
  reviewHint: string
  signalUp: string
  signalDown: string
  signalNeutral: string
}

const STRINGS: Record<SupportedLanguage, ConfidenceStrings> = {
  en: {
    summaryLine: (v) => `Extraction confidence ${v} — check the item against its source; this is a workflow label, not a diagnosis.`,
    noData: 'No item was produced, so there is no value to verify — the signal carries full confidence by default.',
    reviewHint: 'This row is under the facility threshold and is surfaced for human review.',
    signalUp: 'raises the value',
    signalDown: 'lowers the value',
    signalNeutral: 'does not change the value',
  },
  hi: {
    summaryLine: (v) => `निष्कर्षण विश्वास ${v} — इस वस्तु को उसके स्रोत से जाँचें; यह एक कार्य-प्रवाह लेबल है, निदान नहीं।`,
    noData: 'कोई वस्तु नहीं बनी, इसलिए जाँचने के लिए कोई मान नहीं है — सिग्नल में पूर्ण विश्वास है।',
    reviewHint: 'यह पंक्ति सुविधा सीमा से नीचे है और मानव समीक्षा के लिए सामने रखी गई है।',
    signalUp: 'मान बढ़ाता है',
    signalDown: 'मान घटाता है',
    signalNeutral: 'मान नहीं बदलता',
  },
  or: {
    summaryLine: (v) => `ନିଷ୍କର୍ଷଣ ବିଶ୍ୱାସ ${v} — ଏହାକୁ ଉତ୍ସ ସହ ଯାଞ୍ଚ କରନ୍ତୁ; ଏହା ଏକ କାର୍ଯ୍ୟ ପ୍ରବାହ ଲେବଲ୍, ରୋଗ ନିର୍ଣ୍ଣୟ ନୁହେଁ।`,
    noData: 'କେବଳ ବିନ୍ଦୁ ଅନୁପସ୍ଥିତ, ତେଣୁ ଯାଞ୍ଚ କରିବାକୁ କିଛି ନାହିଁ — ସଙ୍କେତରେ ସମ୍ପୂର୍ଣ୍ଣ ବିଶ୍ୱାସ।',
    reviewHint: 'ଏହି ଧାଡ଼ି ସୁବିଧା ସୀମା ତଳେ ଏବଂ ମାନବ ସମୀକ୍ଷା ପାଇଁ ଉପସ୍ଥାପିତ।',
    signalUp: 'ମୂଲ୍ୟ ବଢ଼ାଏ',
    signalDown: 'ମୂଲ୍ୟ କମାଏ',
    signalNeutral: 'ମୂଲ୍ୟ ବଦଳାଏ ନାହିଁ',
  },
}

function localised(line: SupportedLanguage): ConfidenceStrings {
  return STRINGS[line]
}

/** Every free-text fragment of an explanation passes the non-diagnostic guard. */
function safe(text: string): string {
  return enforceNonDiagnostic(text)
}

interface ExplanationInput {
  language: SupportedLanguage
  summary: string
  signals: Array<{ key: string; label: string; direction: ConfidenceSignalDirection; contribution: number; detail: string }>
  computedAt?: string
}

export function buildExplanation(input: ExplanationInput): ConfidenceExplanation {
  const signals: ConfidenceSignal[] = input.signals.map((signal) => ({
    key: signal.key,
    label: safe(signal.label),
    direction: signal.direction,
    contribution: round4(signal.contribution),
    detail: safe(signal.detail),
  }))
  const summary = safe(input.summary)
  return {
    signals,
    summary,
    band: bandForValue(
      round4(input.signals.reduce((sum, signal) => sum + signal.contribution, 0)),
    ),
    language: input.language,
    computedAt: input.computedAt ?? new Date().toISOString(),
  }
}

export interface ScoreInput extends ExplanationInput {
  value: number
}

export function score(input: ScoreInput): ConfidenceScore {
  const raw = round4(clampConfidence(input.value))
  const explanation = buildExplanation(input)
  return { value: raw, band: bandForValue(raw), explanation }
}

/** Text-only signals (labels/details) never carry raw PII by construction. */
function noDataSignal(language: SupportedLanguage, key: string): ConfidenceSignal {
  return {
    key,
    label: 'no-data',
    direction: 'neutral',
    contribution: 0,
    detail: localised(language).noData,
  }
}

/* ------------------------------------------------------------------ */
/*  Layer 1 — Urgency signals                                          */
/* ------------------------------------------------------------------ */

/** RegExp#test is stateful with /g — clone without the flag. */
function tests(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags.replace(/g/g, '')
  try {
    return new RegExp(pattern.source, flags).test(text)
  } catch {
    return false
  }
}

const NEGATION_MARKERS =
  /\b(no|not|never|without|denies?|denial|negat|none|nahi|nahin)\b|(नहीं|नहि)|(ନାହିଁ|ନୁହେଁ)/i
const HYPOTHETICAL_MARKERS =
  /\b(if|maybe|perhaps|could|might|possible|probably|shayad|kya)\b|(शायद|हो सकता)|(ହୁଏତ)/i

export interface UrgencyConfidenceInput {
  flag: UrgencyFlag
  /** The sentence the flag fired on (already anonymised). */
  sentence: string
  /** True when the match came from the transliterated latin form. */
  viaLatin: boolean
  /** True when an independent rule corroborates this signal. */
  corroborated: boolean
}

export function computeUrgencyConfidence(input: UrgencyConfidenceInput): ConfidenceScore {
  const language: SupportedLanguage = (input.flag as { language?: SupportedLanguage }).language ?? 'en'
  const s = localised(language)
  const base = input.viaLatin ? 0.5 : 0.7
  const corroboration = input.corroborated ? 0.05 : 0
  const negated = tests(NEGATION_MARKERS, input.sentence) ? -0.15 : 0
  const hypothetical = tests(HYPOTHETICAL_MARKERS, input.sentence) ? -0.1 : 0
  const raw = base + corroboration + negated + hypothetical
  const signals: Array<{ key: string; label: string; direction: ConfidenceSignalDirection; contribution: number; detail: string }> = [
    {
      key: 'match-type',
      label: input.viaLatin ? 'match-type·transliterated' : 'match-type·plain',
      direction: 'neutral',
      contribution: input.viaLatin ? 0 : base,
      detail: input.viaLatin
        ? 'The signal was matched through the transliterated (latin) form — the least reliable match path.'
        : 'The signal was matched directly in the narrative.',
    },
    {
      key: 'corroboration',
      label: 'corroboration',
      direction: corroboration > 0 ? 'up' : 'neutral',
      contribution: corroboration,
      detail: corroboration > 0 ? 'An independent rule matched the same signal, raising reliability.' : 'No independent rule corroborated the signal.',
    },
    {
      key: 'negation',
      label: 'negation',
      direction: negated < 0 ? 'down' : 'neutral',
      contribution: negated,
      detail: negated < 0 ? 'A negation marker appears in the same phrase — the signal may be weaker.' : 'No negation marker nearby.',
    },
    {
      key: 'hypothetical',
      label: 'hypothetical',
      direction: hypothetical < 0 ? 'down' : 'neutral',
      contribution: hypothetical,
      detail: hypothetical < 0 ? 'A hypothetical/conditional phrase was detected — flag framing is uncertain.' : 'No hypothetical marker nearby.',
    },
  ]
  return score({
    language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 2 — Missing-information items                                */
/* ------------------------------------------------------------------ */

export interface MissingInfoConfidenceInput {
  /** Number of patterns the check ran (multi-pattern checks are stronger). */
  patternCount: number
  /** Narrative length in characters (very short narratives are weaker). */
  narrativeLength: number
  language: SupportedLanguage
}

export function computeMissingInfoConfidence(input: MissingInfoConfidenceInput): ConfidenceScore {
  const s = localised(input.language)
  const multiPattern = input.patternCount >= 2 ? 0.05 : 0
  const shortNarrative = input.narrativeLength < 20 ? -0.1 : 0
  const raw = 0.85 + multiPattern + shortNarrative
  const signals: SignalDraft[] = [
    {
      key: 'multi-pattern',
      label: 'multi-pattern',
      direction: multiPattern > 0 ? 'up' : 'neutral',
      contribution: multiPattern,
      detail: multiPattern > 0 ? 'The check used multiple independent patterns, lowering false omissions.' : 'The check used a single pattern.',
    },
    {
      key: 'narrative-length',
      label: 'narrative-length',
      direction: shortNarrative < 0 ? 'down' : 'neutral',
      contribution: shortNarrative,
      detail: shortNarrative < 0 ? 'The narrative is very short — an absence may mean not-had, not not-reported.' : 'The narrative is long enough for absence to be meaningful.',
    },
  ]
  return score({
    language: input.language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 3 — Report type                                              */
/* ------------------------------------------------------------------ */

export function computeReportTypeConfidence(text: string, language: SupportedLanguage = 'en'): ConfidenceScore {
  const s = localised(language)
  const hits = reportTypeKeywordHits(text)
  const raw = hits >= 3 ? 0.9 : hits === 2 ? 0.7 : hits === 1 ? 0.5 : 0.3
  const signals = [
    {
      key: 'keyword-hits',
      label: 'keyword-hits',
      direction: 'neutral' as const,
      contribution: hits >= 1 ? raw : 0,
      detail: `${hits} report-keyword group(s) matched — ${hits === 0 ? 'no type could be inferred from the text.' : hits >= 3 ? 'strong evidence for the inferred type.' : hits === 2 ? 'reasonable evidence for the inferred type.' : 'weak evidence for the inferred type.'}`,
    },
  ]
  return score({
    language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 4 — Language detection                                       */
/* ------------------------------------------------------------------ */

export function computeLanguageConfidence(detected: DetectedLanguage): ConfidenceScore {
  const language = detected.code
  const s = localised(language)
  let base = 0.7
  if (detected.confidence >= 0.9) base = 0.95
  else if (detected.confidence >= 0.7) base = 0.85
  const mixedPenalty = detected.isMixed ? -0.05 : 0
  const raw = base + mixedPenalty
  const signals = [
    {
      key: 'script-ratio',
      label: 'script-ratio',
      direction: 'neutral' as const,
      contribution: base,
      detail: `The dominant-script ratio reads ${Math.round(detected.confidence * 100)}%.`,
    },
    {
      key: 'mixed-script',
      label: 'mixed-script',
      direction: (mixedPenalty < 0 ? 'down' : 'neutral') as ConfidenceSignalDirection,
      contribution: mixedPenalty,
      detail: detected.isMixed
        ? 'More than one script is present (Hinglish/Odlish) — the language guess is softer.'
        : 'The text is single-script, so the guess is stable.',
    },
  ]
  return score({
    language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 5 — OCR                                                      */
/* ------------------------------------------------------------------ */

export function computeOcrConfidence(meta: ReportOcrMeta): ConfidenceScore {
  if (meta.engine === 'nothing') {
    return score({
      language: 'en',
      value: 1,
      summary: STRINGS.en.summaryLine('no text was read — nothing to verify'),
      signals: [noDataSignal('en', 'no-ocr')],
    })
  }
  let raw: number
  if (meta.engine === 'pdf-text') raw = 0.95
  else raw = clampConfidence(meta.confidence / 100)
  const signals = [
    {
      key: 'ocr-engine',
      label: 'ocr-engine',
      direction: 'neutral' as const,
      contribution: meta.engine === 'pdf-text' ? raw : 0,
      detail: meta.engine === 'pdf-text'
        ? 'The text came from the native PDF text layer.'
        : `The text came from OCR (${meta.confidence}% average word confidence).`,
    },
  ]
  return score({
    language: 'en',
    value: raw,
    summary: STRINGS.en.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 6 — Anonymisation matches                                    */
/* ------------------------------------------------------------------ */

const HIGH_SPECIFICITY = new Set([
  'aadhaar',
  'pan',
  'voter-id',
  'ration-card',
  'passport',
  'driving-license',
  'phone',
  'email',
  'vehicle-number',
  'insurance-number',
  'bank-account',
  'ip-address',
  'gps',
])
const MEDIUM_SPECIFICITY = new Set([
  'dob',
  'age-with-name',
  'hospital-id',
  'patient-id',
  'lab-name',
  'person-name',
  'qr-barcode',
  'url-with-id',
])

/** Category specificity groups — broad overlap with clinical terms lowers it. */
function specificityBase(match: PIIMatch): number {
  if (HIGH_SPECIFICITY.has(match.category)) return 0.95
  if (MEDIUM_SPECIFICITY.has(match.category)) return 0.85
  return 0.7
}

export function computeAnonymisationConfidence(match: PIIMatch): ConfidenceScore {
  const base = specificityBase(match)
  const clinicalOverlap = /(test|report|unit|glucose|blood|pressure|culture|result|band|plate|clinic|ward)/i.test(match.replacement)
    ? -0.1
    : 0
  const raw = base + clinicalOverlap
  const signals = [
    {
      key: 'specificity',
      label: 'specificity',
      direction: 'neutral' as const,
      contribution: base,
      detail: `The detector rule for "${match.category}" is ${base >= 0.9 ? 'highly' : base >= 0.8 ? 'moderately' : 'weakly'} specific.`,
    },
    {
      key: 'clinical-overlap',
      label: 'clinical-overlap',
      direction: (clinicalOverlap < 0 ? 'down' : 'neutral') as ConfidenceSignalDirection,
      contribution: clinicalOverlap,
      detail: clinicalOverlap < 0 ? 'The placeholder overlaps clinical vocabulary — the match could be a false positive.' : 'No overlap with clinical vocabulary.',
    },
  ]
  return score({
    language: match.language,
    value: raw,
    summary: STRINGS[match.language].summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 7 — Visual features                                          */
/* ------------------------------------------------------------------ */

export type ImageQuality = 'good' | 'fair' | 'poor'

export interface VisualConfidenceInput {
  feature: VisualFeature
  imageQuality: ImageQuality
  ocrCorroborated: boolean
}

export function computeVisualFeatureConfidence(input: VisualConfidenceInput): ConfidenceScore {
  const qualityPenalty = input.imageQuality === 'poor' ? -0.2 : input.imageQuality === 'fair' ? -0.1 : 0
  const ocrBonus = input.ocrCorroborated ? 0.05 : 0
  const raw = input.feature.confidence + qualityPenalty + ocrBonus
  const signals: SignalDraft[] = [
    {
      key: 'feature-confidence',
      label: 'feature-confidence',
      direction: 'neutral' as const,
      contribution: input.feature.confidence,
      detail: `The feature row was read with a base reliability of ${Math.round(input.feature.confidence * 100)}%.`,
    },
    {
      key: 'image-quality',
      label: 'image-quality',
      direction: (qualityPenalty < 0 ? 'down' : qualityPenalty > 0 ? 'up' : 'neutral') as ConfidenceSignalDirection,
      contribution: qualityPenalty,
      detail: input.imageQuality === 'poor'
        ? 'The photo is low quality (low contrast / detail) — pixel-derived rows are softer.'
        : input.imageQuality === 'fair'
          ? 'The photo is fair quality — pixel-derived rows carry a small penalty.'
          : 'The photo is good quality for analysis.',
    },
    {
      key: 'ocr-corroboration',
      label: 'ocr-corroboration',
      direction: ocrBonus > 0 ? 'up' : 'neutral',
      contribution: ocrBonus,
      detail: ocrBonus > 0 ? 'OCR text read in the photo corroborates this row.' : 'No OCR corroboration available.',
    },
  ]
  return score({
    language: 'en',
    value: raw,
    summary: STRINGS.en.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 8 — Timeline events                                          */
/* ------------------------------------------------------------------ */

function baseByPrecision(precision: TimePrecision): number {
  switch (precision) {
    case 'exact':
      return 0.9
    case 'approximate':
      return 0.6
    case 'relative':
      return 0.7
    case 'unknown':
      return 0.7
  }
}

export function computeTimelineEventConfidence(event: Pick<TimelineEvent, 'timePrecision' | 'eventText'>, language: SupportedLanguage = 'en'): ConfidenceScore {
  const s = localised(language)
  const base = baseByPrecision(event.timePrecision)
  const short = event.eventText.trim().length < 15 ? -0.1 : 0
  const raw = base + short
  const signals = [
    {
      key: 'time-anchor',
      label: 'time-anchor',
      direction: 'neutral' as const,
      contribution: base,
      detail: event.timePrecision === 'exact'
        ? 'The event carries an explicit, exact time anchor.'
        : event.timePrecision === 'approximate'
          ? 'The event time is approximate ("around…", "a few…").'
          : event.timePrecision === 'relative'
            ? 'The event time is relative to the intake and could not be pinned to a calendar date.'
            : 'No readable time anchor — the event is kept only because it still talks about a symptom.',
    },
    {
      key: 'sentence-length',
      label: 'sentence-length',
      direction: (short < 0 ? 'down' : 'neutral') as ConfidenceSignalDirection,
      contribution: short,
      detail: short < 0 ? 'The event text is very short — context is thin.' : 'The event text is long enough to anchor reliably.',
    },
  ]
  return score({
    language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 9 — Follow-up questions                                      */
/* ------------------------------------------------------------------ */

export interface FollowUpConfidenceInput {
  sourceType: FollowUpSourceType
  /** True when a generic/fallback template produced the question. */
  generic: boolean
  /** Confidence of the source the question was generated from. */
  sourceConfidence: number
  language: SupportedLanguage
}

export function computeFollowUpConfidence(input: FollowUpConfidenceInput): ConfidenceScore {
  const s = localised(input.language)
  const genericPenalty = input.generic ? -0.2 : 0
  const highSource = input.sourceConfidence >= 0.8 ? 0.05 : 0
  const raw = 0.85 + genericPenalty + highSource
  const signals: SignalDraft[] = [
    {
      key: 'template-type',
      label: 'template-type',
      direction: (genericPenalty < 0 ? 'down' : 'neutral') as ConfidenceSignalDirection,
      contribution: genericPenalty,
      detail: genericPenalty < 0
        ? 'The question came from the generic/standard bank rather than a context-specific template.'
        : 'The question was generated from a context-specific template.',
    },
    {
      key: 'source-confidence',
      label: 'source-confidence',
      direction: highSource > 0 ? 'up' : 'neutral',
      contribution: highSource,
      detail: highSource > 0 ? 'Its source surfaced above the high-confidence line.' : 'Its source is of average confidence.',
    },
  ]
  return score({
    language: input.language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 10 — Priority components                                     */
/* ------------------------------------------------------------------ */

export interface PriorityComponentConfidenceInput {
  componentKey: PriorityComponentKey
  /** Mean confidence of the underlying signals the component scored. */
  dataConfidence: number
  /** False when the component had no signal at all (e.g. no vitals). */
  hasSignal: boolean
  language: SupportedLanguage
}

export function computePriorityComponentConfidence(input: PriorityComponentConfidenceInput): ConfidenceScore {
  const s = localised(input.language)
  if (!input.hasSignal) {
    return score({
      language: input.language,
      value: 1,
      summary: s.summaryLine('no signal'),
      signals: [noDataSignal(input.language, 'no-signal')],
    })
  }
  const raw = input.dataConfidence >= 0.8 ? 0.9 : input.dataConfidence * 0.95
  const signals = [
    {
      key: 'data-confidence',
      label: 'data-confidence',
      direction: 'neutral' as const,
      contribution: input.dataConfidence,
      detail: `The component's underlying reads average ${Math.round(input.dataConfidence * 100)}% confidence.`,
    },
    {
      key: 'scoring-rule',
      label: 'scoring-rule',
      direction: 'neutral' as const,
      contribution: raw - input.dataConfidence,
      detail: input.dataConfidence >= 0.8 ? 'Confident underlying data → scoring table value.' : 'Softer underlying data → scaled by the data confidence.',
    },
  ]
  return score({
    language: input.language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

/* ------------------------------------------------------------------ */
/*  Layer 11 — Triage note / session aggregate                         */
/* ------------------------------------------------------------------ */

export interface AggregateConfidenceInput {
  /** Worst urgency-flag confidence (1.0 when no flags were produced). */
  urgency: number
  /** Worst missing-information item confidence (1.0 when none). */
  missing: number
  /** Worst lab confidence across reports (1.0 when none). */
  labs: number
  /** Worst vital confidence across reports (1.0 when none). */
  vitals: number
  /** Worst timeline-event confidence (1.0 when none). */
  timeline: number
  language: SupportedLanguage
}

/** Weighted mean of the five triage layers; absent layers count as "no data". */
export function computeTriageNoteConfidence(input: AggregateConfidenceInput): ConfidenceScore {
  const s = localised(input.language)
  const layers = [
    { key: 'urgency', weight: TRIAGE_WEIGHTS.urgency, value: input.urgency, present: input.urgency < MAX_CONFIDENCE },
    { key: 'missing', weight: TRIAGE_WEIGHTS.missing, value: input.missing, present: input.missing < MAX_CONFIDENCE },
    { key: 'labs', weight: TRIAGE_WEIGHTS.labs, value: input.labs, present: input.labs < MAX_CONFIDENCE },
    { key: 'vitals', weight: TRIAGE_WEIGHTS.vitals, value: input.vitals, present: input.vitals < MAX_CONFIDENCE },
    { key: 'timeline', weight: TRIAGE_WEIGHTS.timeline, value: input.timeline, present: input.timeline < MAX_CONFIDENCE },
  ]
  const raw = layers.reduce((sum, layer) => sum + layer.weight * layer.value, 0)
  const signals = layers.map((layer) => {
    const contribution = layer.weight * (layer.value - 1)
    return {
      key: `weight-${layer.key}`,
      label: layer.key,
      direction: (contribution < -0.005 ? 'down' : contribution > 0.005 ? 'up' : 'neutral') as ConfidenceSignalDirection,
      contribution,
      detail: layer.present
        ? `${inputLanguageLabel(input.language, layer.key)} at ${Math.round(layer.value * 100)}% — weighted ${layer.weight}.`
        : `${inputLanguageLabel(input.language, layer.key)} had no data — counted at full confidence.`,
    }
  })
  return score({
    language: input.language,
    value: raw,
    summary: s.summaryLine(String(Math.round(clampConfidence(raw) * 100) / 100)),
    signals,
  })
}

function inputLanguageLabel(language: SupportedLanguage, key: string): string {
  const labels: Record<SupportedLanguage, Record<string, string>> = {
    // Avoid tokens the PII guard treats as facility names ("lab…").
    en: { urgency: 'Urgency signals', missing: 'Missing information', labs: 'Blood panel', vitals: 'Vitals', timeline: 'Timeline' },
    hi: { urgency: 'प्राथमिकता संकेत', missing: 'लापता जानकारी', labs: 'रक्त परीक्षण', vitals: 'जीवन-संकेत', timeline: 'समयरेखा' },
    or: { urgency: 'ଜରୁରୀ ସଙ୍କେତ', missing: 'ଅନୁପସ୍ଥିତ ସୂଚନା', labs: 'ରକ୍ତ ପରୀକ୍ଷା', vitals: 'ଜୀବନ-ଚିହ୍ନ', timeline: 'ସମୟକ୍ରମ' },
  }
  return labels[language][key] ?? key
}

/* ------------------------------------------------------------------ */
/*  Session-level assembly (worst-case + limiting factor)              */
/* ------------------------------------------------------------------ */

export interface SessionLayerScore {
  itemType: LowConfidenceItemType
  itemId: string
  itemLabel: string
  score: ConfidenceScore
}

/**
 * Every per-layer score for one case, in a stable order. Used by both the
 * low-confidence listing and the session aggregate.
 */
export function sessionLayerScores(session: PatientSession): {
  scores: SessionLayerScore[]
  aggregateInputs: AggregateConfidenceInput
} {
  const s = session.note?.language ?? (session.language === 'Hindi' ? 'hi' : session.language === 'Odia' ? 'or' : 'en')
  const scores: SessionLayerScore[] = []

  let worstUrgency = 1
  for (const flag of session.note?.urgencyFlags ?? []) {
    const score = computeUrgencyConfidence({
      flag,
      sentence: (flag as { originalText?: string }).originalText ?? flag.reason,
      viaLatin: false,
      corroborated: false,
    })
    scores.push({ itemType: 'urgency', itemId: flag.id, itemLabel: flag.label, score })
    worstUrgency = Math.min(worstUrgency, score.value)
  }

  let worstMissing = 1
  for (const item of session.note?.missingInformation ?? []) {
    const score = computeMissingInfoConfidence({
      patternCount: 1,
      narrativeLength: session.displayText.trim().length,
      language: s,
    })
    scores.push({ itemType: 'missing-info', itemId: item.id, itemLabel: item.field, score })
    worstMissing = Math.min(worstMissing, score.value)
  }

  let worstLabs = 1
  let worstVitals = 1
  for (const report of session.reports) {
    for (const lab of report.labValues) {
      const score = scoreFromNumeric(lab.confidence, s, 'lab', `Extracted measurement (${lab.name}).`)
      scores.push({ itemType: 'lab', itemId: lab.id, itemLabel: lab.name, score })
      worstLabs = Math.min(worstLabs, score.value)
    }
    for (const vital of report.vitals) {
      const score = scoreFromNumeric(vital.confidence, s, 'vital', `Extracted vital reading (${vital.name}).`)
      scores.push({ itemType: 'vital', itemId: vital.id, itemLabel: vital.name, score })
      worstVitals = Math.min(worstVitals, score.value)
    }
    const reportScore = computeReportTypeConfidence(report.redactedText, s)
    scores.push({ itemType: 'report-type', itemId: report.id, itemLabel: `Report type · ${report.type}`, score: reportScore })
    const ocrScore = computeOcrConfidence(report.ocr)
    scores.push({ itemType: 'ocr', itemId: report.id, itemLabel: `OCR · ${report.ocr?.engine ?? 'unknown'}`, score: ocrScore })
  }

  let worstTimeline = 1
  for (const event of session.timeline?.events ?? []) {
    const score = computeTimelineEventConfidence(event, s)
    scores.push({ itemType: 'timeline', itemId: event.eventId, itemLabel: `Timeline · ${event.timePrecision}`, score })
    worstTimeline = Math.min(worstTimeline, score.value)
  }

  for (const visual of session.visuals) {
    for (const feature of visual.extraction.features) {
      const score = computeVisualFeatureConfidence({ feature, imageQuality: 'good', ocrCorroborated: visual.extraction.ocrConfidence >= 70 })
      scores.push({ itemType: 'visual', itemId: feature.id, itemLabel: feature.label, score })
    }
  }

  for (const question of session.note?.followUpQuestions ?? []) {
    const score = computeFollowUpConfidence({
      sourceType: question.sourceType,
      generic: question.sourceType === 'fallback',
      sourceConfidence: 0.8,
      language: question.language,
    })
    scores.push({ itemType: 'follow-up', itemId: question.id, itemLabel: `Follow-up · ${question.sourceType}`, score })
  }

  for (const redaction of session.anonymization.redactions) {
    const score = scoreFromNumeric(0.9, s, 'anonymisation', `Anonymisation run removed ${redaction.count} instance(s) of ${redaction.category}.`)
    scores.push({
      itemType: 'anonymisation',
      itemId: redaction.category,
      itemLabel: `Anonymisation · ${redaction.category}`,
      score,
    })
  }

  return {
    scores,
    aggregateInputs: {
      urgency: worstUrgency,
      missing: worstMissing,
      labs: worstLabs,
      vitals: worstVitals,
      timeline: worstTimeline,
      language: s,
    },
  }
}

/** Converts an existing 0..1 numeric item confidence into an explained score. */
export function scoreFromNumeric(
  value: number,
  language: SupportedLanguage,
  kind: string,
  detail: string,
): ConfidenceScore {
  const raw = clampConfidence(Number.isFinite(value) ? value : 0.5)
  const s = localised(language)
  return score({
    language,
    value: raw,
    summary: s.summaryLine(String(Math.round(raw * 100) / 100)),
    signals: [
      {
        key: 'item-confidence',
        label: kind,
        direction: 'neutral',
        contribution: raw,
        detail,
      },
    ],
  })
}

/** The lowest-confidence layer item + its human label (the case's limiter). */
export function limitingFactorOf(scores: SessionLayerScore[]): { score: ConfidenceScore; label: string } {
  if (scores.length === 0) return { score: scoreFromNumeric(1, 'en', 'none', 'No rule-engine output was produced yet.'), label: 'No AI output yet' }
  const sorted = [...scores].sort((a, b) => a.score.value - b.score.value)
  return { score: sorted[0].score, label: sorted[0].itemLabel }
}

export function isLowConfidence(value: number, thresholds: ConfidenceThresholds): boolean {
  return value < thresholds.lowConfidenceThreshold
}

export function isVeryLowConfidence(value: number, thresholds: ConfidenceThresholds): boolean {
  return value < thresholds.veryLowConfidenceThreshold
}

/** Builds the full SessionConfidence for one case under the facility thresholds. */
export function buildSessionConfidence(
  session: PatientSession,
  thresholds: ConfidenceThresholds,
): SessionConfidence {
  const { scores, aggregateInputs } = sessionLayerScores(session)
  const aggregate = computeTriageNoteConfidence(aggregateInputs)
  const worst = limitingFactorOf(scores)
  const items: LowConfidenceItem[] = scores
    .filter((entry) => isLowConfidence(entry.score.value, thresholds))
    .map((entry) => ({
      itemType: entry.itemType,
      itemId: entry.itemId,
      itemLabel: entry.itemLabel,
      value: entry.score.value,
      band: entry.score.band,
      explanation: entry.score.explanation,
    }))
  return {
    sessionId: session.id,
    aggregate,
    worst: worst.score,
    limitingFactor: worst.label,
    items,
  }
}