/**
 * Confidence model (P2-14) — frontend mirror of backend/src/types/confidence.types.ts.
 *
 * Every rule-engine output carries an optional ConfidenceScore that tells the
 * reviewer HOW the value was produced and how reliable the extraction signal is.
 * Hard rules mirrored everywhere in this feature:
 *
 *  - Confidence is a WORKFLOW label about extraction/reporting reliability, NOT
 *    a diagnosis, prognosis or probability of any medical outcome.
 *  - Values are deterministic and always clamp to [0.05, 0.99].
 *  - Explanations are transmitted in the ITEM's language, are non-diagnostic and
 *    never carry raw PII — signal details reference spans/placeholders only.
 *  - Bands: high 0.85-1.00 · medium 0.60-0.84 · low 0.40-0.59 · very-low 0.05-0.39.
 */

import type { UserRole } from './triage'
import type { LanguageCode } from './language.types'

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'very-low'

export const CONFIDENCE_BANDS: ReadonlyArray<{ band: ConfidenceBand; min: number }> = [
  { band: 'high', min: 0.85 },
  { band: 'medium', min: 0.6 },
  { band: 'low', min: 0.4 },
  { band: 'very-low', min: 0.05 },
]

export type ConfidenceSignalDirection = 'up' | 'down' | 'neutral'

/** One observable contributor to a confidence value. */
export interface ConfidenceSignal {
  /** Stable key (e.g. `word-boundary`, `unit-inferred`, `image-quality`). */
  key: string
  /** Human label for the contributor (localised by the caller). */
  label: string
  /** Whether this contributor raised, lowered or left the value alone. */
  direction: ConfidenceSignalDirection
  /** Numeric contribution to the final value (can be negative). */
  contribution: number
  /** Localised, non-diagnostic, PII-free explanation of the contributor. */
  detail: string
}

export interface ConfidenceExplanation {
  signals: ConfidenceSignal[]
  /** One-sentence summary in the item's language. */
  summary: string
  band: ConfidenceBand
  /** Language of every free-text string in this explanation (the item's own). */
  language: LanguageCode
  /** ISO timestamp of when the value was computed. */
  computedAt: string
}

export interface ConfidenceScore {
  /** 0..1 (0.05..0.99 after clamping). */
  value: number
  band: ConfidenceBand
  explanation: ConfidenceExplanation
}

export interface ConfidenceThresholds {
  /** Below this the item is surfaced as low-confidence. Default 0.6. */
  lowConfidenceThreshold: number
  /** Below this the item/aggregate is flagged very-low. Default 0.4. */
  veryLowConfidenceThreshold: number
  /** Session aggregate below this alerts the dashboard. Default 0.6. */
  aggregateAlertThreshold: number
}

/** Which rule-engine output a score belongs to (drives routing + review). */
export type LowConfidenceItemType =
  | 'urgency'
  | 'missing-info'
  | 'lab'
  | 'vital'
  | 'visual'
  | 'timeline'
  | 'follow-up'
  | 'priority-component'
  | 'anonymisation'
  | 'report-type'
  | 'language'
  | 'ocr'
  | 'triage-note'

export const LOW_CONFIDENCE_ITEM_TYPES: LowConfidenceItemType[] = [
  'urgency',
  'missing-info',
  'lab',
  'vital',
  'visual',
  'timeline',
  'follow-up',
  'priority-component',
  'anonymisation',
  'report-type',
  'language',
  'ocr',
  'triage-note',
]

/** One under-threshold rule-engine output, ready for human review. */
export interface LowConfidenceItem {
  itemType: LowConfidenceItemType
  /** Id of the source item (flag id / lab name / report id / …). */
  itemId: string
  /** Stable human label for routing in the UI (id or canonical name). */
  itemLabel: string
  /** The raw confidence value below the threshold. */
  value: number
  band: ConfidenceBand
  explanation: ConfidenceExplanation
}

export type LowConfidenceVerdict = 'accepted' | 'needs-attention' | 'dismissed'

export const LOW_CONFIDENCE_VERDICTS: LowConfidenceVerdict[] = ['accepted', 'needs-attention', 'dismissed']

/** A human decision recorded against one low-confidence item (HITL). */
export interface LowConfidenceReviewAction {
  id: string
  sessionId: string
  itemType: LowConfidenceItemType
  itemId: string
  verdict: LowConfidenceVerdict
  /** Human explanation — REQUIRED for `needs-attention` and `dismissed`. */
  reason?: string
  actorId: string
  actorRole: UserRole
  createdAt: string
}

/**
 * Per-facility confidence thresholds. The `global` row (facilityId 'global')
 * is the system-wide default every facility inherits unless it has its own row.
 */
export interface ConfidencePolicy {
  facilityId: string
  thresholds: ConfidenceThresholds
  /** ISO timestamp of the last update. */
  updatedAt: string
  /** User id of the last editor (never a display name — PII-free). */
  updatedBy: string
}

/** The aggregate view of one case's confidence (worst-case + item list). */
export interface SessionConfidence {
  sessionId: string
  /** Weighted mean across every rule-engine output of the case. */
  aggregate: ConfidenceScore
  /** The lowest-confidence output — the case's limiting signal. */
  worst: ConfidenceScore
  /** Human label of the worst contributor (e.g. `lab / <placeholder>`). */
  limitingFactor: string
  /** Every output currently under the facility's low threshold. */
  items: LowConfidenceItem[]
}
