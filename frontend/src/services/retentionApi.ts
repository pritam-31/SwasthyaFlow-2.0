/**
 * Facility-wide data-retention client (P0-6).
 *
 * The backend owns the policy, the sweep, the audit trail and the tombstones —
 * this module only moves retention actions across the wire, typed to mirror
 * backend/src/routes/retention.routes.ts and the per-case routes under
 * /api/sessions. RBAC is enforced server-side; the UI only hides what a role
 * may not use.
 */

import { request } from './api'
import type {
  ConsentRecord,
  ConsentRevocationResult,
  RetentionAction,
  RetentionCategory,
  RetentionExport,
  RetentionJobResult,
  RetentionMode,
  RetentionPolicy,
  RetentionStatusResponse,
  SessionDeleteResult,
  Tombstone,
} from '../types/retention.types'

/** A single editable rule patch (days may be omitted to toggle `enabled` only). */
export interface RetentionRulePatch {
  category: RetentionCategory
  retentionDays?: number
  enabled?: boolean
}

/* ---------------- Policy + inventory ---------------- */

/** Read the published policy (doctor + admin). */
export async function fetchRetentionPolicy(): Promise<RetentionPolicy> {
  const { policy } = await request<{ policy: RetentionPolicy }>('/retention/policy')
  return policy
}

/** Apply rule edits (admin only). */
export async function saveRetentionPolicy(rules: RetentionRulePatch[]): Promise<RetentionPolicy> {
  const { policy } = await request<{ policy: RetentionPolicy }>('/retention/policy', {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  })
  return policy
}

/** Inventory + what is currently due (admin only). */
export function fetchRetentionStatus(): Promise<RetentionStatusResponse> {
  return request<RetentionStatusResponse>('/retention/status')
}

/** Retention history, most recent first (doctor + admin). */
export async function fetchRetentionActions(): Promise<RetentionAction[]> {
  const { actions } = await request<{ actions: RetentionAction[] }>('/retention/actions')
  return actions
}

/** Deletion proof (admin only); pass a sessionId to filter to one case. */
export async function fetchTombstones(sessionId?: string): Promise<Tombstone[]> {
  const path = sessionId
    ? `/retention/tombstones?sessionId=${encodeURIComponent(sessionId)}`
    : '/retention/tombstones'
  const { tombstones } = await request<{ tombstones: Tombstone[] }>(path)
  return tombstones
}

/** Run a sweep now (admin only). Default mode is `delete`. */
export async function runRetentionJob(mode: RetentionMode = 'delete'): Promise<RetentionJobResult> {
  const { result } = await request<{ result: RetentionJobResult }>('/retention/run', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
  return result
}

/** Read a stored portable export back (doctor + admin). */
export async function fetchStoredExport(exportId: string): Promise<RetentionExport> {
  const { export: payload } = await request<{ export: RetentionExport }>(
    `/retention/exports/${encodeURIComponent(exportId)}`,
  )
  return payload
}

/* ---------------- Per-case consent + retention ---------------- */

/** The consent proof for a case (the owner may read their own). */
export async function fetchSessionConsent(sessionId: string): Promise<ConsentRecord | null> {
  const { consent } = await request<{ consent: ConsentRecord | null }>(
    `/sessions/${encodeURIComponent(sessionId)}/consent`,
  )
  return consent
}

/** Withdraw consent — erases the case immediately, keeps the consent proof. */
export function revokeSessionConsent(sessionId: string, reason?: string): Promise<ConsentRevocationResult> {
  return request<ConsentRevocationResult>(`/sessions/${encodeURIComponent(sessionId)}/consent/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? '' }),
  })
}

/** Build a portable export of a case (doctor + admin). */
export async function exportSessionRetention(sessionId: string): Promise<RetentionExport> {
  const { export: payload } = await request<{ export: RetentionExport }>(
    `/sessions/${encodeURIComponent(sessionId)}/retention/export`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return payload
}

/** Manually erase a case (doctor + admin); same guarantees as the sweep. */
export function deleteSessionData(sessionId: string, reason?: string): Promise<SessionDeleteResult> {
  return request<SessionDeleteResult>(`/sessions/${encodeURIComponent(sessionId)}/retention/delete`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? '' }),
  })
}

/** Push a case's retention out (admin only). */
export function extendSessionRetention(sessionId: string, days: number): Promise<{ extendedUntil: string; categories: RetentionCategory[] }> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/retention/extend`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

/** All valid retention category literals (for admin editors). */
export const RETENTION_CATEGORIES: RetentionCategory[] = [
  'patient-sessions',
  'triage-notes',
  'timeline',
  'reports',
  'report-source-files',
  'visuals',
  'visual-source-files',
  'original-images',
  'follow-up-qa',
  'referrals',
  'audit-entries',
  'auth-sessions',
  'user-accounts',
  'consent-records',
  'anonymisation-reports',
  'redaction-maps',
  'ocr-raw-text',
  'extracted-text',
  'demo-data',
  'export-files',
  'tombstones',
  'application-logs',
]
