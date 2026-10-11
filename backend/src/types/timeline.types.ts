/**
 * Symptom / event timeline model (P0-4).
 *
 * A timeline is a *chronological organisation* of patient-reported events and
 * uploaded records — it is never a diagnosis, never an interpretation of what
 * caused them, and never a treatment or prognosis. Every event is anchored to
 * the anonymised source text that produced it, and every AI-built draft stays
 * a draft until a human accepts or edits it.
 *
 * Time rules:
 *  - Absolute dates come only from an explicit written date (report date lab is
 *    ISO already). Timelines never invent a calendar date on their own.
 *  - Relative expressions (e.g. "2 days ago", "कल", "ଗତ ସପ୍ତାହ") are kept in
 *    relative form versus the intake: `daysFromIntake` counts whole days before
 *    the intake; they are never resolved into a guessed calendar date.
 *  - Anything that cannot be parsed stays `precision: 'unknown'` with
 *    `normalizedTime: null` — the system never guesses.
 *
 * These types are intentionally self-contained (no *runtime* imports from other
 * type modules) because timeline.types is re-exported by index.ts and must not
 * create a runtime import cycle. The literal unions below mirror SupportedLanguage
 * and UserRole exactly; keep them in sync. Type-only imports (see
 * `import type { ConfidenceScore }`) are erased at compile time and are safe —
 * priority.types does the same with UserRole.
 */

import type { ConfidenceScore } from './index'

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
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
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

/** Pre-sort / pre-storage draft, before ids are assigned. */
export interface TimelineEventDraft {
  timeExpression: string
  normalizedTime: NormalizedTime | null
  timePrecision: TimePrecision
  eventText: string
  eventTextLanguage: TimelineLanguage
  eventType: TimelineEventType
  source: TimelineSource
  sourceRef: string
  confidence: number
  /** Explainable confidence + signals (P2-14). Additive; `confidence` above is unchanged. */
  confidenceScore?: ConfidenceScore
  relatedUrgencyFlagIds: string[]
  relatedMissingInfoIds: string[]
}

export interface TimelineBuildResult {
  timeline: Timeline
  warnings: string[]
}

/** Identity of the actor who triggered a timeline action (for the audit trail). */
export interface TimelineActor {
  name: string
  /** Mirrors UserRole. */
  role: 'patient' | 'nurse' | 'doctor' | 'admin' | 'system-admin' | 'facility-admin'
}