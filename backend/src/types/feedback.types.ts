/**
 * Clinician feedback loop model (P2-15).
 *
 * Hard rules (mirrors the platform contract):
 *  - Feedback is about WORKFLOW QUALITY only (was the extraction/ordering
 *    useful?), never about a patient's clinical condition.
 *  - Every free-text field is anonymised (PII-scrubbed) and de-diagnosed before
 *    it is stored.
 *  - Feedback is advisory. It never auto-applies to a rule, threshold or score;
 *    a human still decides.
 *  - Nothing here diagnoses, prescribes or advises treatment.
 */

import type { LayerId } from './modelcard.types'
import type { UserRole } from './index'

/** The fourteen thing-kinds a reviewer can give feedback about. */
export const FEEDBACK_TARGET_TYPES = [
  'urgency-flag',
  'missing-info',
  'lab-value',
  'vital',
  'visual',
  'timeline-event',
  'follow-up-question',
  'priority-component',
  'anonymisation-match',
  'report-type',
  'language-detection',
  'ocr-result',
  'triage-note',
  'rule',
] as const

export type FeedbackTargetType = (typeof FEEDBACK_TARGET_TYPES)[number]

/** How useful the reviewer found the output. */
export const FEEDBACK_VERDICTS = ['useful', 'not-useful', 'partially-useful', 'unclear'] as const
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

/** Why the reviewer reached that verdict. */
export const FEEDBACK_REASON_CODES = [
  'correct',
  'false-positive',
  'false-negative',
  'irrelevant',
  'missing-context',
  'wrong-language',
  'over-redacted',
  'under-redacted',
  'misprioritised',
  'other',
] as const
export type FeedbackReasonCode = (typeof FEEDBACK_REASON_CODES)[number]

/** How much the reviewer thinks this matters. Defaults to `medium`. */
export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high'] as const
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number]

export const FEEDBACK_STATUSES = ['active', 'edited', 'deleted'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const FEEDBACK_REASON_MAX = 500
export const FEEDBACK_FIX_MAX = 500

/** A single reviewer verdict against one AI output. */
export interface Feedback {
  id: string
  facilityId: string
  /** The case the feedback is about; null for facility-level `rule` feedback. */
  sessionId: string | null
  targetType: FeedbackTargetType
  targetId: string
  /** Human-readable, anonymised label of the target. */
  targetLabel: string
  /** Which model layer produced the target (optional — `rule` items may omit it). */
  layerId: LayerId | null
  verdict: FeedbackVerdict
  reasonCode: FeedbackReasonCode
  /** Anonymised, non-diagnostic free text (≤ 500 chars). */
  reasonText: string | null
  severity: FeedbackSeverity
  /** Anonymised suggestion for the maintainers (≤ 500 chars). */
  suggestedFix: string | null
  actorId: string
  actorRole: UserRole
  createdAt: string
  updatedAt: string
  editedAt?: string
  editedBy?: string
  deletedAt?: string
  deletedBy?: string
  status: FeedbackStatus
}

export interface FeedbackCreateInput {
  sessionId?: string | null
  targetType: FeedbackTargetType
  targetId: string
  targetLabel?: string
  layerId?: LayerId | null
  verdict: FeedbackVerdict
  reasonCode: FeedbackReasonCode
  reasonText?: string | null
  severity?: FeedbackSeverity
  suggestedFix?: string | null
}

export interface FeedbackUpdateInput {
  verdict?: FeedbackVerdict
  reasonCode?: FeedbackReasonCode
  reasonText?: string | null
  severity?: FeedbackSeverity
  suggestedFix?: string | null
  targetLabel?: string
}

export interface FeedbackFilter {
  sessionId?: string
  targetType?: FeedbackTargetType
  layerId?: LayerId
  verdict?: FeedbackVerdict
  reasonCode?: FeedbackReasonCode
  severity?: FeedbackSeverity
  actorId?: string
  status?: FeedbackStatus
  /** ISO lower bound (inclusive) on `createdAt`. */
  since?: string
  /** ISO upper bound (inclusive) on `createdAt`. */
  until?: string
}

/** One rollup line in an aggregate / dashboard view. */
export interface FeedbackRollupRow {
  key: string
  label: string
  total: number
  useful: number
  notUseful: number
  partiallyUseful: number
  unclear: number
  highSeverity: number
  /** notUseful / total, 0..1. */
  notUsefulRate: number
}

export interface FeedbackAggregate {
  facilityId: string
  generatedAt: string
  since: string | null
  until: string | null
  total: number
  byTargetType: FeedbackRollupRow[]
  byLayer: FeedbackRollupRow[]
  byReasonCode: FeedbackRollupRow[]
  /** Rules with the most "not useful" verdicts, highest first. */
  topProblematicRules: FeedbackRollupRow[]
}

export interface FeedbackDashboard {
  facilityId: string
  generatedAt: string
  total: number
  active: number
  edited: number
  deleted: number
  byVerdict: Record<FeedbackVerdict, number>
  bySeverity: Record<FeedbackSeverity, number>
  byReasonCode: Record<FeedbackReasonCode, number>
  byTargetType: FeedbackRollupRow[]
  topProblematicRules: FeedbackRollupRow[]
  lastFeedbackAt: string | null
}

export interface FeedbackExportRequest {
  sessionId?: string
  since?: string
  until?: string
}

/** A portable, non-diagnostic copy of the feedback held for a facility. */
export interface FeedbackExport {
  exportId: string
  facilityId: string
  generatedAt: string
  generatedBy: string
  generatedByRole: UserRole
  disclaimer: string
  total: number
  feedback: Feedback[]
}

export function isFeedbackTargetType(value: unknown): value is FeedbackTargetType {
  return typeof value === 'string' && (FEEDBACK_TARGET_TYPES as readonly string[]).includes(value)
}

export function isFeedbackVerdict(value: unknown): value is FeedbackVerdict {
  return typeof value === 'string' && (FEEDBACK_VERDICTS as readonly string[]).includes(value)
}

export function isFeedbackReasonCode(value: unknown): value is FeedbackReasonCode {
  return typeof value === 'string' && (FEEDBACK_REASON_CODES as readonly string[]).includes(value)
}

export function isFeedbackSeverity(value: unknown): value is FeedbackSeverity {
  return typeof value === 'string' && (FEEDBACK_SEVERITIES as readonly string[]).includes(value)
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(value)
}
