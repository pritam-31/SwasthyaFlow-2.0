/**
 * Clinician feedback loop client (P2-15).
 *
 * The backend owns validation, anonymisation, the non-diagnostic guard and the
 * advisory-only rule (feedback never auto-applies to a rule, threshold or
 * score). This module only moves typed requests across the wire, mirroring
 * backend/src/routes/feedback.routes.ts. RBAC is enforced server-side; the UI
 * only hides what a role may not use.
 *
 * Per-case reads are offline-aware (`cachedRead`): the last value is rendered
 * when the backend is unreachable. The facility aggregate, dashboard and export
 * are online-only and raise `OfflineUnavailableError` offline — they are never
 * cached. Create/update/delete require a live connection and are queued by the
 * caller (TriageContext) when the network is down.
 */

import { request } from './api'
import { OfflineUnavailableError, cachedRead, CACHE_KEYS } from './offlineApi'
import { isOffline } from './syncService'
import type {
  Feedback,
  FeedbackAggregate,
  FeedbackCreateInput,
  FeedbackDashboard,
  FeedbackExport,
  FeedbackExportRequest,
  FeedbackFilter,
  FeedbackUpdateInput,
} from '../types/feedback.types'

function encodeFilter(filter: FeedbackFilter): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === 'string' && value) params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/* ---------------- Case + facility reads ---------------- */

/** Feedback recorded against one case (staff). Offline-aware. */
export function fetchFeedbackForSession(sessionId: string): Promise<Feedback[]> {
  return cachedRead(CACHE_KEYS.sessionFeedback(sessionId), () =>
    request<Feedback[]>(`/feedback/sessions/${encodeURIComponent(sessionId)}`),
  )
}

/** The facility feedback list, optionally filtered (staff). */
export function fetchFeedback(filter: FeedbackFilter = {}): Promise<Feedback[]> {
  return request<Feedback[]>(`/feedback${encodeFilter(filter)}`)
}

/** A single feedback record (staff). */
export function fetchFeedbackById(id: string): Promise<Feedback> {
  return request<Feedback>(`/feedback/${encodeURIComponent(id)}`)
}

/* ---------------- Writes (queued offline by the caller) ---------------- */

/** Record a reviewer verdict (staff). */
export function submitFeedback(input: FeedbackCreateInput): Promise<Feedback> {
  return request<Feedback>('/feedback', { method: 'POST', body: JSON.stringify(input) })
}

/** Edit an existing verdict (owner or facility-admin). */
export function updateFeedback(id: string, patch: FeedbackUpdateInput): Promise<Feedback> {
  return request<Feedback>(`/feedback/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/** Withdraw a verdict (owner or facility-admin). */
export function deleteFeedback(id: string): Promise<Feedback> {
  return request<Feedback>(`/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ---------------- Aggregate / dashboard / export (online-only) ---------------- */

function requireOnline(): void {
  if (isOffline()) throw new OfflineUnavailableError()
}

/** Rolled-up facility evidence (facility-admin). Online-only. */
export function fetchAggregate(range: { since?: string; until?: string } = {}): Promise<FeedbackAggregate> {
  requireOnline()
  const params = new URLSearchParams()
  if (range.since) params.set('since', range.since)
  if (range.until) params.set('until', range.until)
  const qs = params.toString()
  return request<FeedbackAggregate>(`/feedback/aggregate${qs ? `?${qs}` : ''}`)
}

/** Facility-wide rollup summary (facility-admin). Online-only. */
export function fetchDashboard(): Promise<FeedbackDashboard> {
  requireOnline()
  return request<FeedbackDashboard>('/feedback/dashboard')
}

/** Build a portable, non-diagnostic copy of a facility's feedback (facility-admin). Online-only. */
export function exportFeedback(input: FeedbackExportRequest = {}): Promise<FeedbackExport> {
  requireOnline()
  return request<FeedbackExport>('/feedback/export', { method: 'POST', body: JSON.stringify(input) })
}
