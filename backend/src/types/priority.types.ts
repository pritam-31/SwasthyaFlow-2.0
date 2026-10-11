/**
 * Queue prioritisation types (P1-11).
 *
 * A PriorityScore is a transparent, deterministic, non-diagnostic ordering of
 * the review queue. Every point awarded is explained by an observable input
 * (urgency flag, vital reading, age band, wait time, lab value, visual finding or
 * a missing-information penalty). Nothing here diagnoses, prescribes, predicts an
 * outcome, or uses an opaque/ML model.
 */

import type { UserRole } from './index'
import type { SupportedLanguage } from './language.types'
import type { ConfidenceScore } from './confidence.types'

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low' | 'routine'

export const PRIORITY_BANDS: PriorityBand[] = ['critical', 'high', 'medium', 'low', 'routine']

export type PriorityOverrideKind = 'score' | 'band' | 'pin' | 'deprioritise' | 'reviewed'

export const PRIORITY_OVERRIDE_KINDS: PriorityOverrideKind[] = ['score', 'band', 'pin', 'deprioritise', 'reviewed']

export type PriorityComponentKey = 'urgency' | 'vitals' | 'age' | 'wait' | 'labs' | 'visual' | 'completeness'

/** One row of the transparent score breakdown. */
export interface PriorityComponent {
  key: PriorityComponentKey
  label: string
  points: number
  maxPoints: number
  /** Observable, non-diagnostic explanations for the points awarded. */
  reasons: string[]
  /** Confidence of the underlying signals this component scored from (P2-14). */
  confidenceScore?: ConfidenceScore
}

export interface PriorityBreakdown {
  components: PriorityComponent[]
  /** Sum before clamping (the completeness penalty can make this negative). */
  totalRaw: number
  /** Final 0..100 score used for sorting. */
  totalClamped: number
}

/** A human override on one aspect of a case's priority (mandatory reason). */
export interface PriorityOverride {
  id: string
  sessionId: string
  facilityId: string
  kind: PriorityOverrideKind
  /** A number 0..100 for `score`, a band for `band`, omitted otherwise. */
  value?: number | PriorityBand
  reason: string
  actorId: string
  actorRole: UserRole
  createdAt: string
}

export interface PriorityScore {
  sessionId: string
  facilityId: string
  /** 0..100 effective score (after any score override). */
  score: number
  band: PriorityBand
  /** Band computed from the raw score, before any band override — transparency. */
  computedBand: PriorityBand
  breakdown: PriorityBreakdown
  computedAt: string
  waitMinutes: number
  slaMinutes: number
  slaBreached: boolean
  /** The score/band override in force, if any. */
  override?: PriorityOverride | null
  assignedTo?: string | null
  assignedToName?: string | null
  pinned: boolean
  deprioritised: boolean
  reviewed: boolean
  /** Language the reason strings were generated in (the session's language). */
  language: SupportedLanguage
  createdAt: string
  updatedAt: string
  /** Non-diagnostic disclaimer — accompanies every score. */
  disclaimer: string
}

export interface SlaConfig {
  critical: number
  high: number
  medium: number
  low: number
  routine: number
}

export interface SlaConfigUpdateInput {
  critical?: number
  high?: number
  medium?: number
  low?: number
  routine?: number
}

export interface PriorityFilterOptions {
  band?: PriorityBand[]
  slaBreached?: boolean
  hasOverride?: boolean
  assignedTo?: string
  language?: SupportedLanguage
}

export type PrioritySortField = 'priority' | 'wait' | 'sla' | 'band' | 'created' | 'updated'

export type PriorityDirection = 'asc' | 'desc'

export interface PrioritySortOptions {
  field: PrioritySortField
  direction: PriorityDirection
}

export interface PriorityOverrideInput {
  kind: PriorityOverrideKind
  value?: number | PriorityBand
  reason: string
}

export interface QueueSummary {
  total: number
  byBand: Record<PriorityBand, number>
  slaBreaches: number
  pinned: number
  overridden: number
  unassigned: number
}

export interface QueueEvent {
  type: 'priority:updated' | 'summary:updated'
  facilityId: string
  sessionId?: string
  at: string
}
