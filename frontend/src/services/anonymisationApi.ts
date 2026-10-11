/**
 * Unified anonymisation client (P0-7).
 *
 * The backend owns detection, redaction, the report store, the feedback loop,
 * the metrics and the leak-test harness — this module only moves typed requests
 * across the wire, mirroring backend/src/routes/anonymisation.routes.ts. RBAC is
 * enforced server-side; the UI only hides what a role may not use. Raw PII never
 * reaches the browser (the backend strips it before every response).
 */

import { postMultipart, request } from './api'
import type {
  AnonymisationImageResult,
  AnonymisationMetrics,
  AnonymisationPreviewResult,
  AnonymisationReport,
  FeedbackMetrics,
  HarnessResult,
  PIIModality,
  ReviewerFeedback,
  ReviewerVerdict,
} from '../types/anonymisation.types'
import type { LanguageCode } from '../types/language.types'

/* ---------------- Preview / run ---------------- */

/** Stateless redaction preview of free text — available to any authenticated user. */
export function previewText(input: {
  text: string
  language?: LanguageCode
  sessionId?: string
}): Promise<AnonymisationPreviewResult> {
  return request<AnonymisationPreviewResult>('/anonymisation/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Redact an image (doctor / admin): detects regions, returns a redacted preview. */
export function previewImage(file: File, language?: LanguageCode, sessionId?: string): Promise<AnonymisationImageResult> {
  const form = new FormData()
  form.append('image', file)
  if (language) form.append('language', language)
  if (sessionId) form.append('sessionId', sessionId)
  return postMultipart<AnonymisationImageResult>('/anonymisation/image', form)
}

/** Run an arbitrary modality through the pipeline (doctor / admin). */
export function runModality(input: {
  modality: PIIModality
  text?: string
  language?: LanguageCode
  sessionId?: string
}): Promise<AnonymisationPreviewResult> {
  return request<AnonymisationPreviewResult>('/anonymisation/run', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/* ---------------- Reports ---------------- */

/** Stored reports, newest first (doctor / admin); filter to one case. */
export async function fetchReports(sessionId?: string): Promise<AnonymisationReport[]> {
  const path = sessionId
    ? `/anonymisation/reports?sessionId=${encodeURIComponent(sessionId)}`
    : '/anonymisation/reports'
  const { reports } = await request<{ reports: AnonymisationReport[] }>(path)
  return reports
}

/** One stored report (doctor / admin). */
export async function fetchReport(reportId: string): Promise<AnonymisationReport> {
  const { report } = await request<{ report: AnonymisationReport }>(
    `/anonymisation/reports/${encodeURIComponent(reportId)}`,
  )
  return report
}

/** Delete a report (admin). */
export function deleteReport(reportId: string): Promise<{ ok: boolean }> {
  return request(`/anonymisation/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' })
}

/** Aggregated per-case coverage across every modality (doctor / admin). */
export async function fetchSessionReport(sessionId: string): Promise<AnonymisationReport> {
  const { report } = await request<{ report: AnonymisationReport }>(
    `/anonymisation/sessions/${encodeURIComponent(sessionId)}/report`,
  )
  return report
}

/* ---------------- Reviewer feedback ---------------- */

export function submitFeedback(input: {
  reportId: string
  modality: PIIModality
  matchIndex: number
  verdict: ReviewerVerdict
  note?: string
  sessionId?: string
}): Promise<{ feedback: ReviewerFeedback }> {
  return request('/anonymisation/feedback', { method: 'POST', body: JSON.stringify(input) })
}

export interface FeedbackListResult {
  feedback: ReviewerFeedback[]
  metrics: FeedbackMetrics
  suggestions: string[]
}

/** Feedback list + tallies + heuristic tuning hints (doctor / admin). */
export function fetchFeedback(reportId?: string): Promise<FeedbackListResult> {
  const path = reportId ? `/anonymisation/feedback?reportId=${encodeURIComponent(reportId)}` : '/anonymisation/feedback'
  return request<FeedbackListResult>(path)
}

/* ---------------- Metrics / diagnostics ---------------- */

/** Coverage / feedback metrics (admin). */
export async function fetchMetrics(): Promise<AnonymisationMetrics> {
  const { metrics } = await request<{ metrics: AnonymisationMetrics }>('/anonymisation/metrics')
  return metrics
}

/** Pattern inventory — counts only, no raw regex (admin). */
export async function fetchPatternInventory(): Promise<Record<string, number>> {
  const { inventory } = await request<{ inventory: Record<string, number> }>('/anonymisation/patterns')
  return inventory
}

/** Run the synthetic PII leak corpus (admin). */
export async function runLeakTests(): Promise<HarnessResult> {
  const { result } = await request<{ result: HarnessResult }>('/anonymisation/leak-tests', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return result
}
