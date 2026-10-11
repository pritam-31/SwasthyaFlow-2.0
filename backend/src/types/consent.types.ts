/**
 * Consent lifecycle + withdrawal API contract (P2-17).
 *
 * Consent is a patient-controlled permission to process a case — never a
 * clinical artifact. Withdrawal is patient-owned, never automatic, always
 * audited, and every free-text reason is anonymised + non-diagnostic-checked
 * before it touches any store. A consent record outlives the case it covers.
 */

import type { ConsentRecord, RetentionCategory } from './retention.types'
import type { UserRole } from './index'

/** Why a patient withdrew consent — a closed set, never free-form. */
export type ConsentWithdrawalReasonCode =
  | 'no-longer-needed'
  | 'privacy-concern'
  | 'moved-facility'
  | 'data-error'
  | 'other'

export const CONSENT_WITHDRAWAL_REASON_CODES: readonly ConsentWithdrawalReasonCode[] = [
  'no-longer-needed',
  'privacy-concern',
  'moved-facility',
  'data-error',
  'other',
]

export function isWithdrawalReasonCode(value: unknown): value is ConsentWithdrawalReasonCode {
  return typeof value === 'string' && (CONSENT_WITHDRAWAL_REASON_CODES as readonly string[]).includes(value)
}

/** POST /api/consent/sessions/:id/revoke body. */
export interface ConsentWithdrawalRequest {
  reasonCode: ConsentWithdrawalReasonCode
  reasonText?: string
}

/** One row of the "what happens if I withdraw" impact preview. */
export interface ConsentImpactCategory {
  category: RetentionCategory
  label: string
  /** How many records of this category are attached to the case. */
  total: number
  /** Records erased at once when consent is withdrawn. */
  willBeDeleted: number
  /** Records kept after withdrawal (usually none, or system-level proof). */
  retained: number
  /** Plain-language reason the category is retained (multilingual on the client). */
  whyRetained: string
}

export interface ConsentWithdrawalPreview {
  sessionId: string
  consentRecordId: string
  policyVersion: string
  categories: ConsentImpactCategory[]
  willWipe: RetentionCategory[]
  willRetain: RetentionCategory[]
  generatedAt: string
}

export type ConsentEventKind = 'granted' | 'revoked' | 're-granted' | 'version-upgraded'

/** An append-only consent event — the patient-facing consent history. */
export interface ConsentEvent {
  id: string
  facilityId: string
  consentRecordId: string
  sessionId: string
  kind: ConsentEventKind
  policyVersion: string
  purposes: string[]
  at: string
  actor: string
  actorRole: UserRole
  reasonCode?: ConsentWithdrawalReasonCode
  /** Anonymised, non-diagnostic copy of the patient's words (never raw PII). */
  reasonText?: string
  previousConsentId?: string
}

export interface ConsentHistoryEntry extends ConsentEvent {}

export interface ConsentWithdrawalResult {
  consent: ConsentRecord
  event: ConsentEvent
  wiped: RetentionCategory[]
  tombstoneId: string
}

export interface ConsentReGrantResult {
  consent: ConsentRecord
  event: ConsentEvent
}

export interface ConsentVersionUpgradeResult {
  consent: ConsentRecord
  event: ConsentEvent
  fromVersion: string
  toVersion: string
}

/** A downloadable proof-of-consent receipt (ref is short-lived). */
export interface ConsentReceipt {
  ref: string
  sessionId: string
  consentRecordId: string
  policyVersion: string
  purposes: string[]
  grantedAt: string
  grantedBy: string
  grantedByRole: UserRole
  revokedAt?: string
  revokedBy?: string
  revokedByRole?: UserRole
  withdrawalReasonCode?: ConsentWithdrawalReasonCode
  generatedAt: string
  disclaimer: string
}

/** Which consent states exist for a session. */
export type ConsentState = 'granted' | 'revoked' | 'none'

/** One facility row in the consent coverage view (admin only). */
export interface ConsentCoverageRow {
  sessionId: string
  patientId: string
  consentRecordId: string | null
  state: ConsentState
  policyVersion: string | null
  grantedAt: string | null
  revokedAt: string | null
}

export interface ConsentCoverage {
  facilityId: string
  generatedAt: string
  total: number
  granted: number
  revoked: number
  none: number
  rows: ConsentCoverageRow[]
}

/** A published consent policy version. */
export interface ConsentPolicyVersion {
  version: string
  publishedAt: string
  publishedBy: string
  summary: string
}
