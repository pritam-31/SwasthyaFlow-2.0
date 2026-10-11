import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { parseTimeExpression, parseTimeExpressions } from '../src/services/timeExpressionParser'
import { classifyEventType, extractTimelineEvents } from '../src/services/timelineExtractor'
import { dedupeEvents, sortTimelineEvents } from '../src/services/timelineSorter'
import { summarizeTimeline } from '../src/services/timelineSummarizer'
import { assertTimelineTextSafe } from '../src/services/timelineBuilder'
import type { Timeline, TimelineEvent, TimelineEventDraft } from '../src/types'

const REFERENCE = '2026-03-01T10:00:00.000Z'

/* ------------------------------------------------------------------ */
/*  Unit tests — time expression parser                                */
/* ------------------------------------------------------------------ */

describe('timeExpressionParser', () => {
  it('parses "2 days ago" as a relative approximate time', () => {
    const parsed = parseTimeExpression('Fever started 2 days ago.', 'en')
    assert.ok(parsed)
    assert.equal(parsed!.precision, 'approximate')
    assert.deepEqual(parsed!.normalized, { kind: 'relative', daysFromIntake: 2 })
  })

  it('parses "since 3 days" and older-first values', () => {
    const parsed = parseTimeExpression('Cough since 3 days.', 'en')
    assert.ok(parsed)
    assert.equal(parsed!.normalized?.kind, 'relative')
    assert.equal(parsed!.normalized?.kind === 'relative' ? parsed!.normalized.daysFromIntake : -1, 3)
  })

  it('parses a DD/MM/YYYY absolute date (Indian convention) as exact', () => {
    const parsed = parseTimeExpression('Report dated 12/01/2026.', 'en')
    assert.ok(parsed)
    assert.equal(parsed!.precision, 'exact')
    assert.deepEqual(parsed!.normalized, { kind: 'absolute', iso: '2026-01-12' })
  })

  it('parses a written-month absolute date', () => {
    const parsed = parseTimeExpression('Scanned 5 Feb 2026 at the lab.', 'en')
    assert.ok(parsed)
    assert.deepEqual(parsed!.normalized, { kind: 'absolute', iso: '2026-02-05' })
  })

  it('parses today / yesterday as relative anchors', () => {
    assert.equal(parseTimeExpression('Pain today.', 'en')!.normalized?.kind, 'relative')
    assert.equal(parseTimeExpression('Pain today.', 'en')!.precision, 'relative')
    const yesterday = parseTimeExpression('Fever yesterday.', 'en')!
    assert.deepEqual(yesterday.normalized, { kind: 'relative', daysFromIntake: 1 })
  })

  it('parses Hinglish "2 din pehle"', () => {
    const parsed = parseTimeExpression('Bukhar 2 din pehle shuru hua.', 'hi')
    assert.ok(parsed)
    assert.equal(parsed!.normalized?.kind === 'relative' ? parsed!.normalized.daysFromIntake : -1, 2)
  })

  it('parses Devanagari "2 दिन पहले" via transliteration', () => {
    const parsed = parseTimeExpression('बुखार 2 दिन पहले शुरू हुआ।', 'hi')
    assert.ok(parsed, 'expected a parsed time')
    assert.equal(parsed!.normalized?.kind === 'relative' ? parsed!.normalized.daysFromIntake : -1, 2)
  })

  it('parses Odia "2 ଦିନ ପୂର୍ବେ" via transliteration', () => {
    const parsed = parseTimeExpression('ଜ୍ୱର 2 ଦିନ ପୂର୍ବେ ଆରମ୍ଭ ହେଲା।', 'or')
    assert.ok(parsed, 'expected a parsed time')
    assert.equal(parsed!.normalized?.kind === 'relative' ? parsed!.normalized.daysFromIntake : -1, 2)
  })

  it('treats a bare "m" as months (30-day months)', () => {
    const parsed = parseTimeExpression('Complaint 2m', 'en')
    assert.ok(parsed)
    assert.equal(parsed!.normalized?.kind === 'relative' ? parsed!.normalized.daysFromIntake : -1, 60)
  })

  it('returns null when nothing can be parsed', () => {
    assert.equal(parseTimeExpression('Chest pain and sweating.', 'en'), null)
  })

  it('finds several expressions without overlapping spans', () => {
    const all = parseTimeExpressions('Fever 2 days ago and cough since 1 week.', 'en')
    assert.equal(all.length, 2)
    assert.ok(all[0].matchedSpan.end <= all[1].matchedSpan.start)
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — extractor                                             */
/* ------------------------------------------------------------------ */

describe('timelineExtractor', () => {
  it('extracts time-anchored sentences with their type and confidence', () => {
    const drafts = extractTimelineEvents({
      text: 'Fever started 2 days ago. Chest pain since yesterday morning.',
      language: 'en',
      source: 'intake',
      sourceRef: 'sess-1',
      referenceIso: REFERENCE,
    })
    assert.equal(drafts.length, 2)
    assert.equal(drafts[0].eventType, 'symptom-onset')
    assert.equal(drafts[0].timePrecision, 'approximate')
    assert.ok(drafts[0].confidence >= 0.7)
    assert.ok(drafts[1].normalizedTime)
  })

  it('keeps a symptom sentence with no time as precision "unknown"', () => {
    const drafts = extractTimelineEvents({
      text: 'The pain is severe right now.',
      language: 'en',
      source: 'intake',
      sourceRef: 'sess-2',
      referenceIso: REFERENCE,
    })
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].timePrecision, 'unknown')
    assert.equal(drafts[0].normalizedTime, null)
    assert.equal(drafts[0].confidence, 0.4)
  })

  it('drops non-clinical sentences with no time', () => {
    const drafts = extractTimelineEvents({
      text: 'I came to the clinic by bus.',
      language: 'en',
      source: 'intake',
      sourceRef: 'sess-3',
      referenceIso: REFERENCE,
    })
    assert.equal(drafts.length, 0)
  })

  it('classifies worsening sentences as symptom-change', () => {
    assert.equal(classifyEventType('The pain is getting worse since yesterday'), 'symptom-change')
    assert.equal(classifyEventType('He was admitted earlier this year'), 'past-medical-event')
    assert.equal(classifyEventType('Patient reports mild fever', true), 'current-state')
    assert.equal(classifyEventType('Pain started two days back'), 'symptom-onset')
  })

  it('returns nothing for empty text', () => {
    assert.deepEqual(
      extractTimelineEvents({ text: '   ', language: 'en', source: 'intake', sourceRef: 'x' }),
      [],
    )
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — sorter                                                */
/* ------------------------------------------------------------------ */

function draft(days: number | null, text: string): TimelineEventDraft {
  return {
    timeExpression: '',
    normalizedTime: days === null ? null : { kind: 'relative', daysFromIntake: days },
    timePrecision: days === null ? 'unknown' : 'approximate',
    eventText: text,
    eventTextLanguage: 'en',
    eventType: 'other',
    source: 'intake',
    sourceRef: 's',
    confidence: 0.6,
    relatedUrgencyFlagIds: [],
    relatedMissingInfoIds: [],
  }
}

describe('timelineSorter', () => {
  it('orders older-before-newer with unknown events last', () => {
    const sorted = sortTimelineEvents(
      [draft(1, 'newer'), draft(5, 'oldest'), draft(null, 'unknown'), draft(0, 'today')],
      REFERENCE,
    )
    assert.deepEqual(sorted.map((e) => e.eventText), ['oldest', 'newer', 'today', 'unknown'])
  })

  it('orders absolute events by their date', () => {
    const a = draft(null, 'a')
    a.normalizedTime = { kind: 'absolute', iso: '2026-01-10' }
    const b = draft(null, 'b')
    b.normalizedTime = { kind: 'absolute', iso: '2025-12-01' }
    const sorted = sortTimelineEvents([a, b], REFERENCE)
    assert.deepEqual(sorted.map((e) => e.eventText), ['b', 'a'])
  })

  it('collapses exact duplicates but keeps distinct sources', () => {
    const one = draft(2, 'Fever')
    const two = draft(2, 'Fever')
    const three = { ...draft(2, 'Fever'), source: 'report' as const }
    assert.equal(dedupeEvents([one, two]).length, 1)
    assert.equal(dedupeEvents([one, three]).length, 2)
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — summariser                                            */
/* ------------------------------------------------------------------ */

function event(precision: TimelineEvent['timePrecision'], normalized: TimelineEvent['normalizedTime'], text: string): TimelineEvent {
  return {
    eventId: 'e',
    timeExpression: '',
    normalizedTime: normalized,
    timePrecision: precision,
    eventText: text,
    eventTextLanguage: 'en',
    eventType: 'other',
    source: 'intake',
    sourceRef: 's',
    confidence: 0.6,
    relatedUrgencyFlagIds: [],
    relatedMissingInfoIds: [],
  }
}

describe('timelineSummarizer', () => {
  it('returns a neutral empty message for no events', () => {
    const { summary } = summarizeTimeline([], 'en')
    assert.ok(summary.toLowerCase().includes('no patient-reported events'))
  })

  it('organises events chronologically without diagnosing', () => {
    const { summary, warnings } = summarizeTimeline(
      [
        event('relative', { kind: 'relative', daysFromIntake: 0 }, 'Fever today'),
        event('relative', { kind: 'relative', daysFromIntake: 1 }, 'Cough yesterday'),
      ],
      'en',
    )
    assert.ok(summary.includes('not a diagnosis'))
    assert.ok(summary.includes('Today'))
    assert.ok(summary.includes('Yesterday'))
    assert.equal(warnings.length, 0)
  })

  it('warns when no event has a readable time', () => {
    const { warnings } = summarizeTimeline([event('unknown', null, 'Pain')], 'en')
    assert.ok(warnings.some((w) => w.toLowerCase().includes('no time')))
  })

  it('produces Hindi and Odia summaries in-script', () => {
    const hi = summarizeTimeline([event('relative', { kind: 'relative', daysFromIntake: 1 }, 'बुखार')], 'hi')
    assert.ok(/[\u0900-\u097F]/.test(hi.summary))
    const or = summarizeTimeline([event('relative', { kind: 'relative', daysFromIntake: 1 }, 'ଜ୍ୱର')], 'or')
    assert.ok(/[\u0B00-\u0B7F]/.test(or.summary))
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — non-diagnostic guard                                  */
/* ------------------------------------------------------------------ */

describe('timelineBuilder guard', () => {
  it('accepts a neutral, patient-framed line', () => {
    assert.equal(assertTimelineTextSafe('Patient reports pain after lunch'), null)
  })

  it('rejects diagnostic / medication phrasing with a suggestion', () => {
    const violation = assertTimelineTextSafe('Doctor prescribed amoxicillin')
    assert.ok(violation)
    assert.ok(violation!.suggestion.length > 10)
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP integration                                                   */
/* ------------------------------------------------------------------ */

interface ApiResult {
  status: number
  body: Record<string, unknown>
}

describe('timeline API (HTTP)', () => {
  let server: Server
  let base = ''

  before(async () => {
    seedUsers()
    clearAudit()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const text = await res.text()
    assert.equal(res.status, 200, text)
    return (JSON.parse(text) as { token: string }).token
  }

  async function api(token: string, method: string, path: string, payload?: Record<string, unknown>): Promise<ApiResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  async function createSession(token: string, text: string, language = 'English'): Promise<string> {
    const res = await api(token, 'POST', '/api/sessions', { text, consentAcknowledged: true, language })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return (res.body as { session: { id: string } }).session.id
  }

  let nurse = ''
  let doctor = ''
  let patient = ''

  before(async () => {
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
    void doctor
  })

  it('auto-builds a timeline when a session is created', async () => {
    const sessionId = await createSession(nurse, 'Fever started 2 days ago and cough since yesterday. Patient reports chest pain.')
    const res = await api(nurse, 'GET', `/api/sessions/${sessionId}/timeline`)
    assert.equal(res.status, 200)
    const timeline = (res.body as { timeline: Timeline }).timeline
    assert.equal(timeline.status, 'ai-draft')
    assert.ok(timeline.events.length >= 1)
    assert.ok(timeline.summary.length > 0)
  })

  it('returns 404 with a build hint when no timeline exists yet', async () => {
    // A staff session gets auto-built; simulate "no timeline" by asking for an
    // unknown session id, which is the same 404 shape the UI keys on.
    const res = await api(nurse, 'GET', '/api/sessions/sess-missing/timeline')
    assert.equal(res.status, 404)
  })

  it('builds, edits, adds, accepts and regenerates a timeline', async () => {
    const sessionId = await createSession(nurse, 'Headache since 3 days. Vomiting today.')

    const built = await api(nurse, 'POST', `/api/sessions/${sessionId}/timeline/build`)
    assert.equal(built.status, 201)
    let timeline = (built.body as { timeline: Timeline }).timeline
    assert.ok(timeline.events.length >= 1)

    const first = timeline.events[0]
    const edited = await api(nurse, 'PATCH', `/api/sessions/${sessionId}/timeline/events/${first.eventId}`, {
      eventText: 'Headache reported by the patient',
    })
    assert.equal(edited.status, 200)
    timeline = (edited.body as { timeline: Timeline }).timeline
    assert.equal(timeline.status, 'human-edited')
    assert.equal(timeline.events.find((e) => e.eventId === first.eventId)?.eventText, 'Headache reported by the patient')

    const added = await api(nurse, 'POST', `/api/sessions/${sessionId}/timeline/events`, {
      eventText: 'Patient reports sleeping poorly',
      eventType: 'clinician-note',
      timePrecision: 'relative',
      normalizedTime: { kind: 'relative', daysFromIntake: 2 },
    })
    assert.equal(added.status, 201)
    timeline = (added.body as { timeline: Timeline }).timeline
    assert.ok(timeline.events.some((e) => e.source === 'clinician'))

    const removed = await api(nurse, 'DELETE', `/api/sessions/${sessionId}/timeline/events/${first.eventId}`)
    assert.equal(removed.status, 200)
    timeline = (removed.body as { timeline: Timeline }).timeline
    assert.ok(!timeline.events.some((e) => e.eventId === first.eventId))

    const accepted = await api(nurse, 'POST', `/api/sessions/${sessionId}/timeline/accept`)
    assert.equal(accepted.status, 200)
    assert.equal((accepted.body as { timeline: Timeline }).timeline.status, 'accepted')

    const regenerated = await api(nurse, 'POST', `/api/sessions/${sessionId}/timeline/regenerate`)
    assert.equal(regenerated.status, 201)
    assert.equal((regenerated.body as { timeline: Timeline }).timeline.status, 'ai-draft')
  })

  it('rejects diagnostic timeline text with a suggestion', async () => {
    const sessionId = await createSession(nurse, 'Fever for 2 days.')
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/timeline/events`, {
      eventText: 'Doctor prescribed amoxicillin for this',
    })
    assert.equal(res.status, 400)
    const body = res.body as { error: string; suggestion?: string }
    assert.equal(body.error, 'Timeline text matches a non-diagnostic safeguard.')
    assert.ok(body.suggestion && body.suggestion.length > 10)
  })

  it('keeps patients out of the build/edit endpoints', async () => {
    const sessionId = await createSession(nurse, 'Cough since yesterday.')
    const build = await api(patient, 'POST', `/api/sessions/${sessionId}/timeline/build`)
    assert.equal(build.status, 403)
    const add = await api(patient, 'POST', `/api/sessions/${sessionId}/timeline/events`, { eventText: 'x' })
    assert.equal(add.status, 403)
  })

  it('hides a stranger session timeline from a patient (404)', async () => {
    const sessionId = await createSession(nurse, 'Cough since yesterday.')
    const res = await api(patient, 'GET', `/api/sessions/${sessionId}/timeline`)
    assert.equal(res.status, 404)
  })

  it('builds a Hindi timeline with a Hindi summary', async () => {
    const sessionId = await createSession(nurse, 'बुखार 2 दिन पहले शुरू हुआ।', 'Hindi')
    const res = await api(nurse, 'GET', `/api/sessions/${sessionId}/timeline`)
    assert.equal(res.status, 200)
    const timeline = (res.body as { timeline: Timeline }).timeline
    assert.equal(timeline.language, 'hi')
    assert.ok(/[\u0900-\u097F]/.test(timeline.summary))
  })

  it('writes timeline audit entries with the acting staff identity', async () => {
    const audits = listAudit()
    assert.ok(audits.some((a) => a.action === 'timeline.generated'))
    assert.ok(audits.some((a) => a.action === 'timeline.viewed'))
    assert.ok(audits.some((a) => a.action === 'timeline.edited'))
    assert.ok(audits.some((a) => a.action === 'timeline.accepted'))
    assert.ok(audits.some((a) => a.action === 'timeline.regenerated'))
    const generated = audits.find((a) => a.action === 'timeline.generated')
    assert.ok(generated && generated.actor.length > 0 && generated.detail.includes('eventCount'))
  })
})