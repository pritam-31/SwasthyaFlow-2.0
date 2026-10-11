/**
 * Consent lifecycle + withdrawal UI model (P2-17) — frontend mirror of
 * backend/src/types/consent.types.ts.
 *
 * Consent is a patient-controlled permission to process a case, never a
 * clinical artifact. Withdrawal is patient-owned, audited, and every free-text
 * reason is anonymised server-side before it is stored.
 */

import type { ConsentRecord, RetentionCategory } from './retention.types'
import type { Role } from './index'

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

export interface ConsentWithdrawalRequest {
  reasonCode: ConsentWithdrawalReasonCode
  reasonText?: string
}

export interface ConsentImpactCategory {
  category: RetentionCategory
  label: string
  total: number
  willBeDeleted: number
  retained: number
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

export interface ConsentEvent {
  id: string
  sessionId: string
  consentRecordId: string
  kind: ConsentEventKind
  at: string
  actor: string
  actorRole: Role
  policyVersion: string
  reasonCode?: ConsentWithdrawalReasonCode
  reasonText?: string
}

export type ConsentHistoryEntry = ConsentEvent

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

export interface ConsentReceipt {
  ref: string
  sessionId: string
  consentRecordId: string
  policyVersion: string
  purposes: string[]
  grantedAt: string
  grantedBy: string
  grantedByRole: Role
  revokedAt?: string
  revokedBy?: string
  revokedByRole?: Role
  withdrawalReasonCode?: ConsentWithdrawalReasonCode
  generatedAt: string
  disclaimer: string
}

export type ConsentState = 'granted' | 'revoked' | 'none'

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

export interface ConsentPolicyVersion {
  version: string
  publishedAt: string
  publishedBy: string
  summary: string
}
