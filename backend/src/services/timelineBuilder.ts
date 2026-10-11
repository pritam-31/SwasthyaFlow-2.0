import { randomUUID } from 'node:crypto'
import type {
  NormalizedTime,
  PatientSession,
  SupportedLanguage,
  Timeline,
  TimelineActor,
  TimelineEvent,
  TimelineEventDraft,
  TimelineEventType,
  TimePrecision,
} from '../types'
import { addAudit } from './auditStore'
import { fromIntakeLanguage } from './languageDetectionService'
import { anonymizeMultilingual } from './multilingualAnonymizer'
import { anonymiseText } from './unifiedAnonymizer'
import { getAllRuleSets } from './rules/ruleRegistry'
import { getSession, updateSession } from './sessionStore'
import { extractTimelineEvents } from './timelineExtractor'
import { computeTimelineEventConfidence } from './confidenceService'
import { dedupeEvents, sortTimelineEvents } from './timelineSorter'
import { summarizeTimeline } from './timelineSummarizer'
import { parseTimeExpression } from './timeExpressionParser'

/**
 * Timeline builder + editor (P0-4).
 *
 * Human-in-the-loop guarantees:
 *  - Everything starts as an `ai-draft`; any manual edit or add flips the
 *    timeline to `human-edited`; only `acceptTimeline` flips it to `accepted`.
 *  - PII is stripped with the shared anonymizer BEFORE extraction from every
 *    source, so the strings we keep are already redacted.
 *  - Every builder call writes an audit entry carrying the authenticated
 *    actor's name and role — never anything from a request body.
 *  - `assertTimelineTextSafe` blocks diagnostic phrasing that a route-level
 *    guard would otherwise let through in human-entered text.
 *
 * Builder functions never throw HTTP errors; routes translate
 * `Error('Session not found.')` / `null` into the right status code.
 */

export interface NewTimelineEventInput {
  eventText: string
  eventTextLanguage: SupportedLanguage
  eventType: TimelineEventType
  timeExpression: string
  normalizedTime: NormalizedTime | null
  timePrecision: TimePrecision
  sourceRef?: string
}

export interface TimelineEventEdit {
  eventText?: string
  eventTextLanguage?: SupportedLanguage
  eventType?: TimelineEventType
  timeExpression?: string
  normalizedTime?: NormalizedTime | null
  timePrecision?: TimePrecision
}

/** RegExp#test is stateful with a /g flag — clone without it. */
function tests(pattern: RegExp, text: string): boolean {
  const flags = pattern.flags.replace(/g/g, '')
  try {
    return new RegExp(pattern.source, flags).test(text)
  } catch {
    return false
  }
}

/** Non-diagnostic guard for human-entered timeline text. */
export function assertTimelineTextSafe(text: string): { error: string; suggestion: string } | null {
  if (!text || text.trim().length === 0) return null
  const banned = getAllRuleSets().flatMap((ruleSet) => ruleSet.bannedPhrases)
  for (const phrase of banned) {
    if (tests(phrase.pattern, text)) {
      return {
        error: 'Timeline text matches a non-diagnostic safeguard.',
        suggestion: `Rephrase to keep the patient's report as they told it — e.g. "${phrase.replacement}". The timeline organises events; it never diagnoses.`,
      }
    }
  }
  return null
}

function record(
  sessionId: string,
  actor: TimelineActor,
  action: string,
  detail: Record<string, unknown>,
  category: 'view' | 'edit' | 'decision' | 'system' = 'edit',
): void {
  addAudit({ sessionId, actor: actor.name, role: actor.role, action, detail: JSON.stringify(detail), category })
}

const SECTION_LABELS =
  /(chief complaint|complaint|history|vitals|timeline|follow|मुख्य|शिकायत|इतिहास|महत्वपूर्ण|ମୁଖ୍ୟ|ଅଭିଯୋଗ|ଇତିହାସ)/i

function stripSectionLabel(value: string): string {
  const match = /^(.*?)[:ः]\s*(.*)$/.exec(value)
  if (match && match[1].length <= 80 && SECTION_LABELS.test(match[1])) return match[2].trim()
  return value.trim()
}

function resolveLanguage(session: PatientSession): SupportedLanguage {
  return session.note?.language ?? fromIntakeLanguage(session.language)
}

function eventId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

/** Build the full draft set from every source on the session. */
function gatherDrafts(session: PatientSession, language: SupportedLanguage): { drafts: TimelineEventDraft[]; notes: string[] } {
  const drafts: TimelineEventDraft[] = []
  const notes: string[] = []

  if (session.displayText?.trim()) {
    const anonymized = anonymizeMultilingual(session.displayText, language).text
    drafts.push(
      ...extractTimelineEvents({
        text: session.displayText,
        anonymizedText: anonymized,
        language,
        source: 'intake',
        sourceRef: session.id,
        referenceIso: session.createdAt,
        urgencyFlags: session.note?.urgencyFlags,
        missingInfoItems: session.note?.missingInformation,
      }),
    )
  }

  const structured = session.note?.structuredNote
  if (structured) {
    for (const key of ['chiefComplaint', 'history'] as const) {
      const raw = structured[key]
      if (!raw?.trim()) continue
      const clean = stripSectionLabel(anonymizeMultilingual(raw.trim(), language).text)
      if (!clean) continue
      const parsed = parseTimeExpression(clean, language, session.createdAt)
      drafts.push({
        timeExpression: parsed?.raw ?? '',
        normalizedTime:
          parsed?.normalized ?? { kind: 'relative', daysFromIntake: 0, hoursFromIntake: 0 },
        timePrecision: parsed?.precision ?? 'relative',
        eventText: clean,
        eventTextLanguage: language,
        eventType: 'current-state',
        source: 'intake',
        sourceRef: `structured-note:${key}`,
        confidence: 0.75,
        relatedUrgencyFlagIds: [],
        relatedMissingInfoIds: [],
      })
    }
  }

  let followUpIncluded = false
  for (const question of session.note?.followUpQuestions ?? []) {
    if (question.status !== 'answered' || !question.answer?.trim()) continue
    const anonymized = anonymizeMultilingual(question.answer.trim(), language).text.trim()
    if (!anonymized) continue
    const parsed = parseTimeExpression(anonymized, language, session.updatedAt)
    drafts.push({
      timeExpression: parsed?.raw ?? '',
      normalizedTime:
        parsed?.normalized ?? { kind: 'absolute', iso: session.updatedAt },
      timePrecision: parsed?.precision ?? 'exact',
      eventText: anonymized,
      eventTextLanguage: language,
      eventType: 'follow-up-answer',
      source: 'follow-up',
      sourceRef: question.id,
      confidence: parsed ? 0.8 : 0.6,
      relatedUrgencyFlagIds: [],
      relatedMissingInfoIds: [],
    })
    followUpIncluded = true
  }

  for (const report of session.reports) {
    const safeName = anonymizeMultilingual(report.fileName || 'report', language).text.trim() || 'Report file'
    const reportTime = report.reportDate
      ? { kind: 'absolute' as const, iso: report.reportDate }
      : null
    drafts.push({
      timeExpression: report.reportDate ?? '',
      normalizedTime: reportTime,
      timePrecision: report.reportDate ? 'exact' : 'unknown',
      eventText: `Report: ${safeName}`,
      eventTextLanguage: language,
      eventType: 'report',
      source: 'report',
      sourceRef: report.id,
      confidence: report.reportDate ? 0.9 : 0.5,
      relatedUrgencyFlagIds: [],
      relatedMissingInfoIds: [],
    })
    for (const vital of report.vitals) {
      const vitalTime = vital.recordedAt ?? report.reportDate ?? null
      drafts.push({
        timeExpression: vitalTime ?? '',
        normalizedTime: vitalTime ? { kind: 'absolute', iso: vitalTime } : null,
        timePrecision: vitalTime ? 'exact' : 'unknown',
        eventText: `${vital.name}: ${vital.value} ${vital.unit}`.trim(),
        eventTextLanguage: language,
        eventType: 'report',
        source: 'report',
        sourceRef: `${report.id}:${vital.id}`,
        confidence: 0.8,
        relatedUrgencyFlagIds: [],
        relatedMissingInfoIds: [],
      })
    }
  }

  for (const visual of session.visuals) {
    const safeName = anonymizeMultilingual(visual.fileName || 'visual', language).text.trim() || 'Visual record'
    drafts.push({
      timeExpression: visual.createdAt,
      normalizedTime: { kind: 'absolute', iso: visual.createdAt },
      timePrecision: 'exact',
      eventText: `Visual: ${safeName}`,
      eventTextLanguage: language,
      eventType: 'visual',
      source: 'visual',
      sourceRef: visual.id,
      confidence: 0.8,
      relatedUrgencyFlagIds: [],
      relatedMissingInfoIds: [],
    })
  }

  if (followUpIncluded) notes.push('Follow-up answers were included.')
  if (session.reports.length > 0) notes.push('Uploaded reports were included.')
  if (session.visuals.length > 0) notes.push('Captured visuals were included.')
  return { drafts, notes }
}

/** Core build: gather, dedupe, sort, summarise, persist. No audit here. */
function buildTimelineCore(session: PatientSession): Timeline {
  const language = resolveLanguage(session)
  const { drafts, notes } = gatherDrafts(session, language)
  const unique = dedupeEvents(drafts)
  const events: TimelineEvent[] = sortTimelineEvents(unique, session.createdAt).map((draft, index) => {
    const event: TimelineEvent = {
      ...draft,
      eventId: `evt-${session.id.slice(-6)}-${index + 1}`,
    }
    if (!event.confidenceScore) {
      event.confidenceScore = computeTimelineEventConfidence(event, event.eventTextLanguage)
    }
    return event
  })

  const summary = summarizeTimeline(events, language)
  const warnings = [...summary.warnings]

  for (const note of notes) {
    if (!warnings.includes(note)) warnings.push(note)
  }

  const timeline: Timeline = {
    id: `tl-${randomUUID().slice(0, 8)}`,
    sessionId: session.id,
    events,
    summary: summary.summary,
    language,
    generatedAt: new Date().toISOString(),
    status: 'ai-draft',
    warnings,
  }
  updateSession(session.id, { timeline })
  return timeline
}

/** Non-blocking auto-build after intake (route calls this). */
export function buildTimeline(sessionId: string, actor: TimelineActor): Timeline {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const timeline = buildTimelineCore(session)

  const sourceBreakdown: Record<string, number> = {}
  for (const event of timeline.events) {
    sourceBreakdown[event.source] = (sourceBreakdown[event.source] ?? 0) + 1
  }
  record(sessionId, actor, 'timeline.generated', {
    eventCount: timeline.events.length,
    language: timeline.language,
    sourceBreakdown,
  })
  return timeline
}

export function regenerateTimeline(sessionId: string, actor: TimelineActor): Timeline {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const previousEventCount = session.timeline?.events.length ?? 0
  const timeline = buildTimelineCore(session)
  record(sessionId, actor, 'timeline.regenerated', {
    previousEventCount,
    newEventCount: timeline.events.length,
  })
  return timeline
}

export function getTimelineForSession(sessionId: string, actor: TimelineActor): Timeline | null {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const timeline = session.timeline ?? null
  if (timeline) {
    record(sessionId, actor, 'timeline.viewed', { status: timeline.status, eventCount: timeline.events.length }, 'view')
  }
  return timeline
}

/** Apply the edit, keep its chronological slot, flip to human-edited. */
export function editTimelineEvent(
  sessionId: string,
  actor: TimelineActor,
  eventId: string,
  patch: TimelineEventEdit,
): Timeline | null {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const current = session.timeline
  if (!current) return null

  const index = current.events.findIndex((event) => event.eventId === eventId)
  if (index < 0) return null

  const original = current.events[index]
  const updatedEvent: TimelineEvent = {
    ...original,
    ...(patch.eventText !== undefined ? { eventText: anonymiseText(patch.eventText, 'timeline-event', patch.eventTextLanguage).text } : {}),
    ...(patch.eventTextLanguage !== undefined ? { eventTextLanguage: patch.eventTextLanguage } : {}),
    ...(patch.eventType !== undefined ? { eventType: patch.eventType } : {}),
    ...(patch.timeExpression !== undefined ? { timeExpression: patch.timeExpression } : {}),
    ...(patch.normalizedTime !== undefined ? { normalizedTime: patch.normalizedTime } : {}),
    ...(patch.timePrecision !== undefined ? { timePrecision: patch.timePrecision } : {}),
  }
  updatedEvent.confidenceScore = computeTimelineEventConfidence(updatedEvent, updatedEvent.eventTextLanguage)

  const events = sortTimelineEvents(
    current.events.map((event, i) => (i === index ? updatedEvent : event)),
    session.createdAt,
  )
  const next: Timeline = { ...current, events, status: 'human-edited' }
  updateSession(session.id, { timeline: next })

  const changedFields = Object.keys(patch)
  record(sessionId, actor, 'timeline.edited', { eventId, changedFields }, 'edit')
  return next
}

/** Manual clinician event — always flips the timeline to human-edited. */
export function addTimelineEvent(
  sessionId: string,
  actor: TimelineActor,
  input: NewTimelineEventInput,
): Timeline | null {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const current = session.timeline
  if (!current) return null

  const event: TimelineEvent = {
    eventId: eventId('evt'),
    eventType: input.eventType,
    timeExpression: input.timeExpression,
    normalizedTime: input.normalizedTime,
    timePrecision: input.timePrecision,
    eventText: anonymiseText(input.eventText, 'timeline-event', input.eventTextLanguage).text,
    eventTextLanguage: input.eventTextLanguage,
    source: 'clinician',
    sourceRef: input.sourceRef ?? 'clinician-manual',
    confidence: 1,
    relatedUrgencyFlagIds: [],
    relatedMissingInfoIds: [],
  }

  const events = sortTimelineEvents([...current.events, event], session.createdAt)
  const next: Timeline = { ...current, events, status: 'human-edited' }
  updateSession(session.id, { timeline: next })

  record(sessionId, actor, 'timeline.edited', { eventId: event.eventId, action: 'add' }, 'edit')
  return next
}

export function removeTimelineEvent(sessionId: string, actor: TimelineActor, eventId: string): Timeline | null {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const current = session.timeline
  if (!current) return null

  const exists = current.events.some((event) => event.eventId === eventId)
  if (!exists) return null

  const events = current.events.filter((event) => event.eventId !== eventId)
  const next: Timeline = { ...current, events, status: 'human-edited' }
  updateSession(session.id, { timeline: next })

  record(sessionId, actor, 'timeline.edited', { eventId, action: 'remove' }, 'edit')
  return next
}

export function acceptTimeline(sessionId: string, actor: TimelineActor): Timeline | null {
  const session = getSession(sessionId)
  if (!session) throw new Error('Session not found.')
  const current = session.timeline
  if (!current) return null

  const next: Timeline = { ...current, status: 'accepted' }
  updateSession(session.id, { timeline: next })
  record(sessionId, actor, 'timeline.accepted', { eventCount: next.events.length }, 'decision')
  return next
}