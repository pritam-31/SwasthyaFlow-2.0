/**
 * Data & Privacy UI contract (P2-17).
 *
 * These are read-mostly projections the privacy console renders: per-session
 * inventory, pending deletions, a merged retention timeline, SLA view, policy
 * diff, export list, and the bulk-retention / audit-prune operations. Every
 * row is facility-scoped and non-diagnostic.
 */

import type { RetentionCategory } from './retention.types'

/** One category row in a session's data inventory. */
export interface SessionInventoryRow {
  category: RetentionCategory
  label: string
  scope: 'session' | 'account' | 'system' | 'file'
  /** Records of this category attached to the case. */
  total: number
  /** Records already past their retention age (due now). */
  eligible: number
  /** ISO instant the earliest record becomes eligible, when not yet due. */
  expiresAt?: string
  /** Plain-language reason the data is still held (client localises this key). */
  whyRetained: string
}

export interface SessionDataInventory {
  sessionId: string
  patientId: string
  policyVersion: string
  generatedAt: string
  rows: SessionInventoryRow[]
  totalRecords: number
  eligibleRecords: number
}

/** One due/soon-due record across a facility (admin console). */
export interface PendingDeletionRow {
  category: RetentionCategory
  targetId: string
  sessionId?: string
  expiresAt: string
  /** Negative when already overdue. */
  daysUntil: number
  due: boolean
}

export interface PendingDeletions {
  facilityId: string
  generatedAt: string
  rows: PendingDeletionRow[]
}

export type RetentionTimelineKind =
  | 'consent.granted'
  | 'consent.revoked'
  | 'consent.re-granted'
  | 'consent.version-upgraded'
  | 'retention.extended'
  | 'session.deleted'
  | 'session.exported'
  | 'retention.job_run'

export interface RetentionTimelineEvent {
  id: string
  kind: RetentionTimelineKind
  at: string
  actor: string
  actorRole: string
  detail: string
  category?: RetentionCategory
  targetId?: string
}

export interface RetentionTimeline {
  sessionId: string
  generatedAt: string
  events: RetentionTimelineEvent[]
}

export interface RetentionSlaBucket {
  category: RetentionCategory
  label: string
  due: number
  /** Days since the oldest due record became eligible (0 when none due). */
  oldestOverdueDays: number
  breached: boolean
}

export interface RetentionSlaView {
  facilityId: string
  generatedAt: string
  /** Maximum days a due record may wait before it is a breach. */
  slaDays: number
  buckets: RetentionSlaBucket[]
  totalDue: number
  breachedCategories: number
  nextRunAt: string
}

export interface PolicyDiffRow {
  category: RetentionCategory
  label: string
  globalDays: number
  facilityDays: number
  deltaDays: number
  globalEnabled: boolean
  facilityEnabled: boolean
  changed: boolean
}

export interface PolicyDiff {
  facilityId: string
  globalVersion: string
  generatedAt: string
  rows: PolicyDiffRow[]
  changedCount: number
}

export interface RetentionExportSummary {
  ref: string
  sessionId?: string
  createdAt: string
  bytes: number
}

export type BulkRetentionAction = 'run-now' | 'export' | 'extend' | 'anonymise' | 'soft-delete'

export interface BulkRetentionRequest {
  action: BulkRetentionAction
  category: RetentionCategory | 'all'
  sessionIds: string[]
  extraDays?: number
}

export interface BulkRetentionItemResult {
  sessionId: string
  status: 'ok' | 'skipped' | 'error'
  message: string
}

export interface BulkRetentionResult {
  ranAt: string
  action: BulkRetentionAction
  category: RetentionCategory | 'all'
  requested: number
  affected: number
  skipped: number
  details: BulkRetentionResultItem[]
}

export interface BulkRetentionResultItem {
  sessionId: string
  status: 'ok' | 'skipped' | 'error'
  message: string
}

export type BulkRetentionDetail = BulkRetentionResult['details'][number]

export interface PruneAuditResult {
  ranAt: string
  before: string
  pruned: number
  remaining: number
  chainIntact: boolean
}
