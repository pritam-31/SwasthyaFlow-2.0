/**
 * Data-retention policy model (P0-6).
 *
 * Hard rules (mirrors the frontend contract):
 *  - Retention is evidence, not silence: every destructive pass writes an audit
 *    entry, a retention action and (for whole-record deletions) a tombstone
 *    that holds NO patient payload.
 *  - Consent-linked withdrawal beats the schedule: revoking consent erases the
 *    case immediately and only the tombstone + consent proof survive.
 *  - Nothing here diagnoses, prescribes or advises treatment.
 */

import type { RedactionCategory, UserRole } from './index'

/** The 23 retention categories — one rule each, every rule editable by an admin. */
export type RetentionCategory =
  | 'patient-sessions'
  | 'triage-notes'
  | 'timeline'
  | 'reports'
  | 'report-source-files'
  | 'visuals'
  | 'visual-source-files'
  | 'original-images'
  | 'follow-up-qa'
  | 'referrals'
  | 'audit-entries'
  | 'auth-sessions'
  | 'user-accounts'
  | 'consent-records'
  | 'anonymisation-reports'
  | 'redaction-maps'
  | 'ocr-raw-text'
  | 'extracted-text'
  | 'demo-data'
  | 'export-files'
  | 'tombstones'
  | 'application-logs'
  | 'feedback'

/** What a rule governs: a per-case fragment, an account, a system buffer or a file. */
export type RetentionScope = 'session' | 'account' | 'system' | 'file'

export interface RetentionRule {
  category: RetentionCategory
  label: string
  description: string
  /** Days from the record's base timestamp. 0 = purge on the next sweep. */
  retentionDays: number
  scope: RetentionScope
  /** Disabled rules keep data forever (documented admin choice). */
  enabled: boolean
}

export interface RetentionPolicy {
  version: string
  updatedAt: string
  updatedBy: string
  rules: RetentionRule[]
}

/** A single piece of data a handler can scan, delete, anonymise or export. */
export interface RetentionTarget {
  id: string
  expiresAt: string
  sessionId?: string
}

/** Sweep mode: erase outright, or keep the record shape with its content stripped. */
export type RetentionMode = 'delete' | 'anonymise'

export interface RetentionActor {
  name: string
  role: UserRole
}

export interface RetentionCategoryResult {
  category: RetentionCategory
  scanned: number
  deleted: number
}

export interface RetentionJobResult {
  ranAt: string
  mode: RetentionMode
  durationMs: number
  byCategory: RetentionCategoryResult[]
  totalDeleted: number
}

export interface RetentionStatusRow {
  category: RetentionCategory
  label: string
  retentionDays: number
  enabled: boolean
  scope: RetentionScope
  total: number
  eligible: number
}

export type RetentionActionKind =
  | 'policy.updated'
  | 'job.run'
  | 'session.exported'
  | 'session.deleted'
  | 'session.extended'
  | 'consent.granted'
  | 'consent.revoked'
  | 'data.deleted'
  | 'data.extended'

export interface RetentionAction {
  id: string
  at: string
  actor: string
  actorRole: UserRole
  action: RetentionActionKind
  category?: RetentionCategory
  targetId?: string
  detail: string
}

export type TombstoneScope = 'session' | 'consent' | 'export' | 'policy'

/** Proof of deletion. Holds identifiers and reasons only — never patient payload. */
export interface Tombstone {
  id: string
  scope: TombstoneScope
  sessionId?: string
  patientId?: string
  category?: RetentionCategory
  targetId?: string
  reason: string
  deletedAt: string
  deletedBy: string
  deletedByRole: UserRole
  policyVersion: string
}

/** Consent proof — outlives the case it belongs to (P0-6). */
export interface ConsentRecord {
  consentRecordId: string
  sessionId: string
  policyVersion: string
  purposes: string[]
  grantedAt: string
  grantedBy: string
  grantedByRole: UserRole
  revokedAt?: string
  revokedBy?: string
  revokedByRole?: UserRole
  /** Retention policy linked when consent was granted (what the patient agreed to). */
  retentionLinkedAt: string
  /** Structured withdrawal reason (P2-17) — never free text PII. */
  withdrawalReasonCode?: string
  /** Anonymised, non-diagnostic withdrawal note (P2-17). */
  withdrawalReasonText?: string
  /** Consent record this one replaced when re-granted or version-upgraded (P2-17). */
  previousConsentId?: string
  /** Consent record that superseded this one when it was withdrawn (P2-17). */
  supersededByConsentId?: string
}

export interface RedactionMapEntry {
  category: RedactionCategory
  count: number
}

/** Which identifier classes were stripped for a session, and how many of each. */
export interface RedactionMap {
  sessionId: string
  createdAt: string
  entries: RedactionMapEntry[]
}

export interface RetentionExportSection {
  category: RetentionCategory
  items: unknown[]
}

/** Portable, non-diagnostic copy of everything held about one session (P0-6). */
export interface RetentionExport {
  exportId: string
  sessionId: string
  patientId: string
  policyVersion: string
  generatedAt: string
  generatedBy: string
  generatedByRole: UserRole
  disclaimer: string
  sections: RetentionExportSection[]
}

/** Raw OCR text held only for the duration of one processing run (P0-6). */
export interface OcrTextHold {
  id: string
  text: string
  createdAt: string
  /** Set when processing finishes — released text is purged on the next sweep. */
  releasedAt?: string
}
