/**
 * Timeline build / review client (P0-4).
 *
 * The backend owns extraction, parsing, sorting, summarisation, the
 * non-diagnostic guard and the audit trail — this module only moves build and
 * review actions across the wire, typed to match backend/src/routes/
 * sessions.routes.ts. `GET` answers 404 when no timeline has been built yet;
 * callers treat that as "not built", not as an error.
 */

import { request } from './api'
import type {
  NormalizedTime,
  TimePrecision,
  Timeline,
  TimelineEventType,
  TimelineLanguage,
} from '../types/timeline.types'

export interface TimelineCreateEventInput {
  eventText: string
  eventTextLanguage?: TimelineLanguage
  eventType?: TimelineEventType
  timeExpression?: string
  normalizedTime?: NormalizedTime | null
  timePrecision?: TimePrecision
  sourceRef?: string
}

export interface TimelineEventEditPatch {
  eventText?: string
  eventTextLanguage?: TimelineLanguage
  eventType?: TimelineEventType
  timeExpression?: string
  normalizedTime?: NormalizedTime | null
  timePrecision?: TimePrecision
}

/** Read the timeline (staff + the patient who owns the session). */
export async function fetchTimeline(sessionId: string): Promise<Timeline | null> {
  try {
    const { timeline } = await request<{ timeline: Timeline }>(
      `/sessions/${encodeURIComponent(sessionId)}/timeline`,
    )
    return timeline
  } catch (e) {
    if (e instanceof Error && 'status' in e && (e as { status: number }).status === 404) return null
    throw e
  }
}

/** Build (or rebuild) the AI draft from every source on the session. */
export async function buildTimeline(sessionId: string): Promise<Timeline> {
  const { timeline } = await request<{ timeline: Timeline }>(
    `/sessions/${encodeURIComponent(sessionId)}/timeline/build`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return timeline
}

/** Regenerate the AI draft (previous draft is replaced, history audited). */
export async function regenerateTimeline(sessionId: string): Promise<Timeline> {
  const { timeline } = await request<{ timeline: Timeline }>(
    `/sessions/${encodeURIComponent(sessionId)}/timeline/regenerate`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return timeline
}

/** Accept the draft as reviewed — the human takes ownership of the chronology. */
export async function acceptTimeline(sessionId: string): Promise<Timeline> {
  const { timeline } = await request<{ timeline: Timeline }>(
    `/sessions/${encodeURIComponent(sessionId)}/timeline/accept`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return timeline
}

/** Add a clinician event to the timeline (applies the non-diagnostic guard). */
export async function addTimelineEvent(
  sessionId: string,
  input: TimelineCreateEventInput,
): Promise<Timeline> {
  const { timeline } = await request<{ timeline: Timeline }>(
    `/sessions/${encodeURIComponent(sessionId)}/timeline/events`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return timeline
}

/** Edit a timeline event (human-in-the-loop correction). */
export async function editTimelineEvent(
  sessionId: string,
  eventId: string,
  patch: TimelineEventEditPatch,
): Promise<Timeline> {
  const { timeline } = await request<{ timeline: Timeline }>(
    `/sessions/${encodeURIComponent(sessionId)}/timeline/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
  return timeline
}

/** Remove a timeline event. */
export async function removeTimelineEvent(sessionId: string, eventId: string): Promise<Timeline> {
  const { timeline } = await request<{ timeline: Timeline }>(
    `/sessions/${encodeURIComponent(sessionId)}/timeline/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  )
  return timeline
}