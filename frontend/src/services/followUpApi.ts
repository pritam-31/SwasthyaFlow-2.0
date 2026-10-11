/**
 * Dynamic follow-up question client (P0-5).
 *
 * The backend owns generation, the per-language template plans, the PII and
 * non-diagnostic guards, anonymisation of answers and the audit trail — this
 * module only moves follow-up actions across the wire, typed to mirror
 * backend/src/routes/sessions.routes.ts. `GET` answers 404 when the session
 * has no follow-up questions yet; callers treat that as "not available".
 */

import { request } from './api'
import type {
  ClinicianFollowUpInput,
  FollowUpCategory,
  FollowUpEditPatch,
  FollowUpLanguage,
  FollowUpQuestion,
  FollowUpTarget,
} from '../types/followup.types'

/** Read every follow-up question for a session (staff + owning patient). */
export async function fetchSessionFollowUps(sessionId: string): Promise<FollowUpQuestion[] | null> {
  try {
    return await request<FollowUpQuestion[]>(`/sessions/${encodeURIComponent(sessionId)}/followups`)
  } catch (e) {
    if (e instanceof Error && 'status' in e && (e as { status: number }).status === 404) return null
    throw e
  }
}

/** (Re)generate the context-aware AI suggestions in place. */
export async function generateSessionFollowUps(sessionId: string): Promise<FollowUpQuestion[]> {
  return request<FollowUpQuestion[]>(`/sessions/${encodeURIComponent(sessionId)}/followups/generate`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Regenerate the AI suggestions (previous suggestions are replaced). */
export async function regenerateSessionFollowUps(sessionId: string): Promise<FollowUpQuestion[]> {
  return request<FollowUpQuestion[]>(`/sessions/${encodeURIComponent(sessionId)}/followups/regenerate`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Add a clinician-authored question (runs the guards server-side). */
export async function addClinicianFollowUp(
  sessionId: string,
  input: ClinicianFollowUpInput,
): Promise<FollowUpQuestion> {
  return request<FollowUpQuestion>(`/sessions/${encodeURIComponent(sessionId)}/followups`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Record that a question was put to the patient / team. */
export async function askFollowUp(sessionId: string, questionId: string): Promise<FollowUpQuestion> {
  return request<FollowUpQuestion>(
    `/sessions/${encodeURIComponent(sessionId)}/followups/${encodeURIComponent(questionId)}/ask`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

/** Record the patient's answer verbatim (anonymised) in its own language. */
export async function answerFollowUp(
  sessionId: string,
  questionId: string,
  answerText: string,
  answerLanguage: FollowUpLanguage,
): Promise<FollowUpQuestion> {
  return request<FollowUpQuestion>(
    `/sessions/${encodeURIComponent(sessionId)}/followups/${encodeURIComponent(questionId)}/answer`,
    { method: 'POST', body: JSON.stringify({ answerText, answerLanguage }) },
  )
}

/** Skip a question (the patient could not answer right now). */
export async function skipFollowUp(sessionId: string, questionId: string): Promise<FollowUpQuestion> {
  return request<FollowUpQuestion>(
    `/sessions/${encodeURIComponent(sessionId)}/followups/${encodeURIComponent(questionId)}/skip`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

/** Human-in-the-loop correction of wording / routing / priority. */
export async function editFollowUp(
  sessionId: string,
  questionId: string,
  patch: FollowUpEditPatch,
): Promise<FollowUpQuestion> {
  return request<FollowUpQuestion>(
    `/sessions/${encodeURIComponent(sessionId)}/followups/${encodeURIComponent(questionId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

/** Remove a follow-up question entirely. */
export async function deleteFollowUp(sessionId: string, questionId: string): Promise<void> {
  await request<unknown>(`/sessions/${encodeURIComponent(sessionId)}/followups/${encodeURIComponent(questionId)}`, {
    method: 'DELETE',
  })
}

/** Reorder the question list (the full permutation is required). */
export async function reorderFollowUps(sessionId: string, orderedIds: string[]): Promise<FollowUpQuestion[]> {
  return request<FollowUpQuestion[]>(`/sessions/${encodeURIComponent(sessionId)}/followups/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  })
}

/** Valid follow-up language / category / target literals for the UI selects. */
export const FOLLOW_UP_LANGUAGES: FollowUpLanguage[] = ['en', 'hi', 'or']
export const FOLLOW_UP_CATEGORIES: FollowUpCategory[] = [
  'timeline',
  'severity',
  'vitals',
  'hydration',
  'medication',
  'allergies',
  'history',
  'responsiveness',
  'pain',
  'bleeding',
  'consciousness',
  'symptom-detail',
  'report',
  'lab-review',
  'visual',
  'safety-recheck',
  'clinician',
  'other',
]
export const FOLLOW_UP_TARGETS: FollowUpTarget[] = ['patient', 'staff']