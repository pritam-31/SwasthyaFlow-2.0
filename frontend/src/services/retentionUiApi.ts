/**
 * Data & Privacy console client (P2-17).
 *
 * Mirrors backend/src/routes/retentionUi.routes.ts. Every projection is
 * facility-scoped and non-diagnostic. Export downloads return an object URL the
 * caller must revoke. Reads may be served from the offline cache; destructive
 * operations require a connection.
 */

import { request, fetchBlobUrl } from './api'
import { cachedRead, requireOnline } from './offlineApi'
import type {
  BulkRetentionRequest,
  BulkRetentionResult,
  PendingDeletions,
  PolicyDiff,
  PruneAuditResult,
  RetentionExportSummary,
  RetentionSlaView,
  RetentionTimeline,
  SessionDataInventory,
} from '../types/retentionUi.types'

/** Per-case data inventory. Offline-cacheable. */
export function fetchSessionInventory(sessionId: string): Promise<SessionDataInventory> {
  return cachedRead(`cache:inventory:${sessionId}`, async () => {
    const { inventory } = await request<{ inventory: SessionDataInventory }>(
      `/retention-ui/sessions/${encodeURIComponent(sessionId)}/inventory`,
    )
    return inventory
  })
}

/** Merged retention + consent timeline for a case. */
export async function fetchRetentionTimeline(sessionId: string): Promise<RetentionTimeline> {
  const { timeline } = await request<{ timeline: RetentionTimeline }>(
    `/retention-ui/sessions/${encodeURIComponent(sessionId)}/timeline`,
  )
  return timeline
}

/** Facility pending deletions (facility-admin only). */
export async function fetchPendingDeletions(): Promise<PendingDeletions> {
  const { pending } = await request<{ pending: PendingDeletions }>('/retention-ui/facility/pending')
  return pending
}

/** Facility retention SLA view (facility-admin only). */
export async function fetchRetentionSla(): Promise<RetentionSlaView> {
  const { sla } = await request<{ sla: RetentionSlaView }>('/retention-ui/facility/sla')
  return sla
}

/** Set the facility SLA window in days (facility-admin only). */
export async function updateRetentionSla(slaDays: number): Promise<RetentionSlaView> {
  requireOnline()
  const { sla } = await request<{ sla: RetentionSlaView }>('/retention-ui/facility/sla', {
    method: 'PATCH',
    body: JSON.stringify({ slaDays }),
  })
  return sla
}

/** Facility vs global retention policy diff (facility-admin only). */
export async function fetchPolicyDiff(): Promise<PolicyDiff> {
  const { diff } = await request<{ diff: PolicyDiff }>('/retention-ui/facility/policy-diff')
  return diff
}

/** Stored portable exports for the facility (facility-admin only). */
export async function fetchRetentionExports(): Promise<RetentionExportSummary[]> {
  const { exports } = await request<{ exports: RetentionExportSummary[] }>('/retention-ui/facility/exports')
  return exports
}

/** Download a stored export (doctor / admin). Caller revokes the object URL. */
export function downloadRetentionExport(ref: string): Promise<string> {
  return fetchBlobUrl(`/retention-ui/exports/${encodeURIComponent(ref)}`)
}

/** Run a bulk retention action across a set of cases (facility-admin only). */
export function runBulkRetention(body: BulkRetentionRequest): Promise<BulkRetentionResult> {
  requireOnline()
  return request<{ result: BulkRetentionResult }>('/retention-ui/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((res) => res.result)
}

/** Chain-preserving audit prune (system-admin only). */
export function pruneAuditRange(before: string): Promise<PruneAuditResult> {
  requireOnline()
  return request<{ result: PruneAuditResult }>('/retention-ui/prune-audit', {
    method: 'POST',
    body: JSON.stringify({ before }),
  }).then((res) => res.result)
}
