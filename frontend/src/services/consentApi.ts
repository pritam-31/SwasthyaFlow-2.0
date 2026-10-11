/**
 * Consent lifecycle client (P2-17).
 *
 * Mirrors backend/src/routes/consent.routes.ts. Consent proves a patient gave
 * permission to process their case; withdrawal is patient-owned and erases the
 * case while keeping a non-patient proof. RBAC is enforced server-side — the UI
 * only hides what a role may not use.
 *
 * Reads may be served from the offline cache; every write needs a connection.
 */

import { request } from './api'
import { cachedRead, requireOnline } from './offlineApi'
import type { ConsentRecord } from '../types/retention.types'
import type {
  ConsentCoverage,
  ConsentHistoryEntry,
  ConsentPolicyVersion,
  ConsentReGrantResult,
  ConsentVersionUpgradeResult,
  ConsentWithdrawalPreview,
  ConsentWithdrawalRequest,
  ConsentWithdrawalResult,
  ConsentReceipt,
} from '../types/consent.types'

/** The consent proof for a case (owner may read their own). Offline-cacheable. */
export function fetchSessionConsent(sessionId: string): Promise<ConsentRecord | null> {
  return cachedRead(`cache:consent:${sessionId}`, async () => {
    const { consent } = await request<{ consent: ConsentRecord | null }>(
      `/consent/sessions/${encodeURIComponent(sessionId)}`,
    )
    return consent
  })
}

/** The consent history for a case. */
export async function fetchConsentHistory(sessionId: string): Promise<ConsentHistoryEntry[]> {
  const { history } = await request<{ history: ConsentHistoryEntry[] }>(
    `/consent/sessions/${encodeURIComponent(sessionId)}/history`,
  )
  return history
}

/** What would be erased / retained if the patient withdrew consent now. */
export async function fetchWithdrawalPreview(sessionId: string): Promise<ConsentWithdrawalPreview> {
  const { preview } = await request<{ preview: ConsentWithdrawalPreview }>(
    `/consent/sessions/${encodeURIComponent(sessionId)}/impact`,
  )
  return preview
}

/** Withdraw consent (patient-own only). Idempotent. Online only. */
export async function withdrawConsent(
  sessionId: string,
  body: ConsentWithdrawalRequest,
): Promise<ConsentWithdrawalResult> {
  requireOnline()
  const { result } = await request<{ result: ConsentWithdrawalResult }>(
    `/consent/sessions/${encodeURIComponent(sessionId)}/revoke`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return result
}

/** Re-grant a previously withdrawn consent (patient-own only). Online only. */
export function reGrantConsent(sessionId: string): Promise<ConsentReGrantResult> {
  requireOnline()
  return request<ConsentReGrantResult>(`/consent/sessions/${encodeURIComponent(sessionId)}/re-grant`, {
    method: 'POST',
    body: '{}',
  })
}

/** Upgrade a case's consent to the current policy version (patient-own only). */
export function upgradeConsentVersion(sessionId: string): Promise<ConsentVersionUpgradeResult> {
  requireOnline()
  return request<ConsentVersionUpgradeResult>(
    `/consent/sessions/${encodeURIComponent(sessionId)}/upgrade-version`,
    { method: 'POST', body: '{}' },
  )
}

/** Generate a short-lived proof-of-consent receipt. Online only. */
export async function generateConsentReceipt(sessionId: string): Promise<ConsentReceipt> {
  requireOnline()
  const { receipt } = await request<{ receipt: ConsentReceipt }>(
    `/consent/sessions/${encodeURIComponent(sessionId)}/receipt`,
    { method: 'POST', body: '{}' },
  )
  return receipt
}

/** Facility-wide consent coverage (facility-admin only). Offline-cacheable. */
export function fetchConsentCoverage(): Promise<ConsentCoverage> {
  return cachedRead('cache:consent:coverage', async () => {
    const { coverage } = await request<{ coverage: ConsentCoverage }>('/consent/facility/coverage')
    return coverage
  })
}

/** The caller's own consent records (patient self-service). Offline-cacheable. */
export function fetchMyConsent(): Promise<ConsentRecord[]> {
  return cachedRead('cache:consent:mine', async () => {
    const { consent } = await request<{ consent: ConsentRecord[] }>('/consent/me')
    return consent
  })
}

/** Published consent policy versions. */
export async function fetchConsentVersions(): Promise<ConsentPolicyVersion[]> {
  const { versions } = await request<{ versions: ConsentPolicyVersion[] }>('/consent/versions')
  return versions
}
