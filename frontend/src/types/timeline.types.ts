/**
 * Symptom / event timeline model (P0-4) — frontend mirror of
 * backend/src/types/timeline.types.ts.
 *
 * A timeline is a *chronological organisation* of patient-reported events and
 * uploaded records — it is never a diagnosis, never an interpretation of what
 * caused them, and never a treatment or prognosis. Every event is anchored to
 * the anonymised source text that produced it, and every AI-built draft stays
 * a draft until a human accepts or edits it.
 *
 * Time rules:
 *  - Absolute dates come only from an explicit written date. The timeline
 *    never invents a calendar date on its own.
 *  - Relative expressions (e.g. "2 days ago", "कल") are kept in relative form
 *    vs the intake: `daysFromIntake` counts whole days before the intake.
 *  - Anything that cannot be parsed stays `precision: 'unknown'` with
 *    `normalizedTime: null`.
 *
 * The literal unions mirror SupportedLanguage / UserRole exactly; keep them in
 * sync with backend/src/types/timeline.types.ts.
 */

/** Mirrors SupportedLanguage — 'en' | 'hi' | 'or'. */
export type TimelineLanguage = 'en' | 'hi' | 'or'

export type TimelineEventType =
  | 'symptom-onset'
  | 'symptom-change'
  | 'past-medical-event'
  | 'current-state'
  | 'report'
  | 'visual'
  | 'follow-up-answer'
  | 'clinician-note'
  | 'other'

export type TimelineSource = 'intake' | 'follow-up' | 'report' | 'visual' | 'clinician'

export type TimePrecision = 'exact' | 'approximate' | 'relative' | 'unknown'

/** Structured form of a written time expression. */
export type NormalizedTime =
  | { kind: 'absolute'; iso: string }
  | { kind: 'relative'; daysFromIntake: number; hoursFromIntake?: number }

export interface TimelineEvent {
  eventId: string
  /** The expression the patient/staff wrote for "when" (verbatim, latinised for hi/or). */
  timeExpression: string
  /** Null when no time could be parsed — the event then sorts at the end. */
  normalizedTime: NormalizedTime | null
  timePrecision: TimePrecision
  /** Anonymised, verbatim source text. Never invented or rewritten clinically. */
  eventText: string
  eventTextLanguage: TimelineLanguage
  eventType: TimelineEventType
  source: TimelineSource
  /** Origin of the event: session id, report id, visual id, follow-up question id. */
  sourceRef: string
  /** 0..1 — strength of the pattern match, never a clinical confidence. */
  confidence: number
  relatedUrgencyFlagIds: string[]
  relatedMissingInfoIds: string[]
}

export interface Timeline {
  id: string
  sessionId: string
  events: TimelineEvent[]
  /** Short non-diagnostic organisation of the events, written in `language`. */
  summary: string
  language: TimelineLanguage
  generatedAt: string
  status: 'ai-draft' | 'human-edited' | 'accepted'
  warnings: string[]
}

/** Identity of the actor who triggered a timeline action (for the audit trail). */
export interface TimelineActor {
  name: string
  /** Mirrors UserRole — 'patient' | 'nurse' | 'doctor' | 'admin'. */
  role: 'patient' | 'nurse' | 'doctor' | 'admin'
}

/** NormalizedTime as a single editable string ("relative" uses daysFromIntake). */
export interface TimelineEventDraftInput {
  eventText: string
  eventTextLanguage: TimelineLanguage
  eventType: TimelineEventType
  timeExpression: string
  /** Days before intake for a relative time; empty clears the time. */
  daysFromIntake: string
  timePrecision: TimePrecision
}