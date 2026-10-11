/**
 * Confidence + explainability client (P2-14).
 *
 * The backend owns scoring, threshold policy and the HITL review store — this
 * module only moves typed requests across the wire, mirroring
 * backend/src/routes/confidence.routes.ts. RBAC is enforced server-side; the UI
 * only hides what a role may not use. Explanations are non-diagnostic and
 * PII-free by construction (the backend strips identifiers before every response).
 *
 * Reads (`fetchSessionConfidence`, `fetchLowConfidenceItems`, `fetchReviewActions`,
 * `fetchPolicy`) are offline-aware: when the backend is unreachable the request
 * rejects with an ApiError whose `status` is 0, which callers render as an
 * "offline" state rather than an error. `recompute` and policy writes require a
 * live connection and are never queued offline.
 */

import { request } from './api'
import type {
  ConfidencePolicy,
  ConfidenceThresholds,
  LowConfidenceItem,
  LowConfidenceItemType,
  LowConfidenceReviewAction,
  LowConfidenceVerdict,
  SessionConfidence,
} from '../types/confidence.types'

function sessionPath(sessionId: string, suffix = ''): string {
  return `/confidence/sessions/${encodeURIComponent(sessionId)}${suffix}`
}

/* ---------------- Session confidence ---------------- */

/** Full SessionConfidence (aggregate + worst + under-threshold items). Staff only. */
export function fetchSessionConfidence(sessionId: string): Promise<SessionConfidence> {
  return request<SessionConfidence>(sessionPath(sessionId))
}

/** Only the items currently under the facility's low threshold. Staff only. */
export function fetchLowConfidenceItems(sessionId: string): Promise<LowConfidenceItem[]> {
  return request<LowConfidenceItem[]>(sessionPath(sessionId, '/low'))
}

/** Force a fresh recompute for a case (staff). Requires a live connection. */
export function recomputeSessionConfidence(sessionId: string): Promise<SessionConfidence> {
  return request<SessionConfidence>(`/confidence/recompute/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: '{}',
  })
}

/* ---------------- Human-in-the-loop review ---------------- */

/** Every human decision recorded against a case, newest first. Staff only. */
export function fetchReviewActions(sessionId: string): Promise<LowConfidenceReviewAction[]> {
  return request<LowConfidenceReviewAction[]>(sessionPath(sessionId, '/review-actions'))
}

/**
 * Record a HITL verdict against one low-confidence item. A `reason` is required
 * by the backend for `needs-attention` and `dismissed` (400 otherwise).
 */
export function reviewLowConfidenceItem(input: {
  sessionId: string
  itemType: LowConfidenceItemType
  itemId: string
  verdict: LowConfidenceVerdict
  reason?: string
}): Promise<LowConfidenceReviewAction> {
  const { sessionId, itemType, itemId, verdict, reason } = input
  const path = sessionPath(
    sessionId,
    `/low/${encodeURIComponent(itemType)}/${encodeURIComponent(itemId)}/review`,
  )
  const body: Record<string, unknown> = { verdict }
  if (reason && reason.trim()) body.reason = reason.trim()
  return request<LowConfidenceReviewAction>(path, { method: 'POST', body: JSON.stringify(body) })
}

/* ---------------- Policy (admin) ---------------- */

/** The effective thresholds for the facility in scope (admin). */
export function fetchPolicy(): Promise<ConfidencePolicy> {
  return request<ConfidencePolicy>('/confidence/policy')
}

/** Validated threshold update for the facility in scope (admin). */
export function updatePolicy(patch: Partial<ConfidenceThresholds>): Promise<ConfidencePolicy> {
  return request<ConfidencePolicy>('/confidence/policy', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
