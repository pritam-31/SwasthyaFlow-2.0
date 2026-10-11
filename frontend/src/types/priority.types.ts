/**
 * Queue prioritisation types (P1-11).
 *
 * Mirrors `backend/src/types/priority.types.ts`. A PriorityScore is a
 * transparent, deterministic, non-diagnostic ordering of the review queue:
 * every point is explained by an observable input and nothing here diagnoses,
 * prescribes or predicts an outcome.
 */

import type { Role } from './index'

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low' | 'routine'

export const PRIORITY_BANDS: PriorityBand[] = ['critical', 'high', 'medium', 'low', 'routine']

export const PRIORITY_BAND_LABELS: Record<PriorityBand, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  routine: 'Routine',
}

/** Band cut-offs (inclusive lower bound) — kept in step with the backend. */
export const PRIORITY_BAND_THRESHOLDS: Record<PriorityBand, number> = {
  critical: 80,
  high: 60,
  medium: 40,
  low: 20,
  routine: 0,
}

/** Tailwind class fragments for each band, shared by every queue surface. */
export const PRIORITY_BAND_STYLES: Record<PriorityBand, { pill: string; dot: string; bar: string }> = {
  critical: { pill: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', bar: 'bg-rose-500' },
  high: { pill: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-500' },
  medium: { pill: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', bar: 'bg-sky-500' },
  low: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  routine: { pill: 'bg-ink-100 text-ink-600 ring-ink-200', dot: 'bg-ink-400', bar: 'bg-ink-400' },
}

export type PriorityOverrideKind = 'score' | 'band' | 'pin' | 'deprioritise' | 'reviewed'

export const PRIORITY_OVERRIDE_KINDS: PriorityOverrideKind[] = ['score', 'band', 'pin', 'deprioritise', 'reviewed']

export const PRIORITY_OVERRIDE_LABELS: Record<PriorityOverrideKind, string> = {
  score: 'Score override',
  band: 'Band override',
  pin: 'Pinned',
  deprioritise: 'Deprioritised',
  reviewed: 'Marked reviewed',
}

export type PriorityComponentKey = 'urgency' | 'vitals' | 'age' | 'wait' | 'labs' | 'visual' | 'completeness'

export interface PriorityComponent {
  key: PriorityComponentKey
  label: string
  points: number
  maxPoints: number
  reasons: string[]
}

export interface PriorityBreakdown {
  components: PriorityComponent[]
  totalRaw: number
  totalClamped: number
}

export interface PriorityOverride {
  id: string
  sessionId: string
  facilityId: string
  kind: PriorityOverrideKind
  value?: number | PriorityBand
  reason: string
  actorId: string
  actorRole: Role
  createdAt: string
}

export interface PriorityScore {
  sessionId: string
  facilityId: string
  score: number
  band: PriorityBand
  computedBand: PriorityBand
  breakdown: PriorityBreakdown
  computedAt: string
  waitMinutes: number
  slaMinutes: number
  slaBreached: boolean
  override?: PriorityOverride | null
  assignedTo?: string | null
  assignedToName?: string | null
  pinned: boolean
  deprioritised: boolean
  reviewed: boolean
  language: string
  createdAt: string
  updatedAt: string
  disclaimer: string
}

export interface SlaConfig {
  critical: number
  high: number
  medium: number
  low: number
  routine: number
}

export type SlaConfigUpdateInput = Partial<SlaConfig>

export interface PriorityFilterOptions {
  band?: PriorityBand[]
  slaBreached?: boolean
  hasOverride?: boolean
  assignedTo?: string
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

export interface AssignableStaff {
  id: string
  displayName: string
  role: Role
}
