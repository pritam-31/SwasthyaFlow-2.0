import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { generateFollowUpQuestions } from '../src/services/followUpGenerator'
import { assertFollowUpAnswerSafe, assertFollowUpTextSafe } from '../src/services/followUpSafety'
import type { FollowUpQuestion, MissingInfoItem, UrgencyFlag } from '../src/types'

function flag(ruleId: string, severity: 'red' | 'amber' = 'amber'): UrgencyFlag {
  return { id: `flag-${ruleId}`, label: ruleId, severity, reason: 'test flag', ruleId }
}

function missing(field: string): MissingInfoItem {
  return { id: `mi-${field}`, field, whyItMatters: 'test' }
}

/* ------------------------------------------------------------------ */
/*  Unit tests — generator                                             */
/* ------------------------------------------------------------------ */

describe('followUpGenerator', () => {
  it('generates urgency + missing-info questions in priority order', () => {
    const { drafts } = generateFollowUpQuestions({
      language: 'en',
      displayText: 'Chest pain since morning.',
      urgencyFlags: [flag('URG-01', 'red')],
      missingInformation: [
        missing('Vital signs (BP, pulse, temperature, SpO2)'),
        missing('Current medications and allergies'),
        missing('Relevant past history'),
      ],
    })
    assert.equal(drafts.length, 4)
    const first = drafts.filter((d) => d.sourceType === 'urgency-flag')
    assert.equal(first.length, 1)
    assert.equal(first[0].sourceRef, 'URG-01')
    assert.ok(first[0].question.toLowerCase().includes('chest'))
    const vitals = drafts.find((d) => d.sourceRef === 'Vital signs (BP, pulse, temperature, SpO2)')
    assert.equal(vitals?.category, 'vitals')
    const medication = drafts.find((d) => d.sourceRef === 'Current medications and allergies')
    assert.equal(medication?.category, 'medication')
    // priorities ascending
    const priorities = drafts.map((d) => d.priority)
    assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b))
  })

  it('matches canonical urgency ids (URG-HI-06 → URG-06)', () => {
    const { drafts } = generateFollowUpQuestions({
      language: 'hi',
      displayText: 'तीन दिन से उल्टी और बुखार।',
      urgencyFlags: [flag('URG-HI-06')],
      missingInformation: [missing('महत्वपूर्ण संकेत (बीपी, नाड़ी, तापमान, ऑक्सीजन, वजन)')],
    })
    const urgency = drafts.find((d) => d.sourceType === 'urgency-flag')
    assert.equal(urgency?.sourceRef, 'URG-06')
    assert.equal(urgency?.category, 'hydration')
    const vitals = drafts.find((d) => d.sourceType === 'missing-info')
    assert.equal(vitals?.category, 'vitals')
    for (const draft of drafts) {
      assert.equal(draft.language, 'hi')
      assert.ok(/[\u0900-\u097F]/.test(draft.question), draft.question)
    }
  })

  it('produces Odia questions in-script', () => {
    const { drafts } = generateFollowUpQuestions({
      language: 'or',
      displayText: 'ଛାତି ଯନ୍ତ୍ରଣା ଏବଂ ବାନ୍ତି।',
      urgencyFlags: [flag('URG-OR-06')],
      missingInformation: [missing('ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସଙ୍କେତ (ବିପି, ନାଡ଼ି, ତାପମାତ୍ରା, ଅମ୍ଳଜାନ, ଓଜନ)')],
    })
    assert.ok(drafts.length >= 2)
    for (const draft of drafts) {
      assert.equal(draft.language, 'or')
      assert.ok(/[\u0B00-\u0B7F]/.test(draft.question), draft.question)
    }
  })

  it('covers reports, photos and timeline gaps with the right source types', () => {
    const { drafts } = generateFollowUpQuestions({
      language: 'en',
      displayText: 'Fever.',
      urgencyFlags: [],
      missingInformation: [],
      reports: [{ id: 'r1', type: 'lab' }, { id: 'r2', type: 'vitals' }],
      visuals: [{ id: 'v1' }],
      hasTimeline: false,
    })
    assert.ok(drafts.some((d) => d.sourceType === 'report-lab' && d.sourceRef === 'r1'))
    assert.ok(drafts.some((d) => d.sourceType === 'report-vital' && d.sourceRef === 'r2'))
    assert.ok(drafts.some((d) => d.sourceType === 'visual' && d.sourceRef === 'v1'))
    assert.ok(drafts.some((d) => d.sourceType === 'timeline-gap'))
    const staffTargets = drafts.filter((d) => d.target === 'staff')
    assert.equal(staffTargets.length, 3)
  })

  it('dedupes by (sourceType, sourceRef, category) and caps the list at 12', () => {
    const flags = Array.from({ length: 8 }, (_, i) => flag(`URG-0${i + 1}`, i < 4 ? 'red' : 'amber'))
    // Duplicate the first three rule ids to force a dedupe.
    flags.push(flag('URG-01'), flag('URG-02'), flag('URG-03'))
    const { drafts } = generateFollowUpQuestions({
      language: 'en',
      displayText: 'Chest pain.',
      urgencyFlags: flags,
      missingInformation: [
        missing('Vital signs (BP, pulse, temperature, SpO2)'),
        missing('Symptom duration / timeline'),
        missing('Current medications and allergies'),
        missing('Relevant past history'),
      ],
      reports: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, type: 'lab' })),
      visuals: [{ id: 'v1' }],
      hasTimeline: false,
    })
    assert.ok(drafts.length <= 12)
    const keys = new Set(drafts.map((d) => `${d.sourceType}|${d.sourceRef}|${d.category}`))
    assert.equal(keys.size, drafts.length)
  })

  it('falls back to the standard bank when nothing can be generated', () => {
    const { drafts, warnings } = generateFollowUpQuestions({
      language: 'en',
      displayText: 'Fever only.',
      urgencyFlags: [],
      missingInformation: [],
    })
    assert.ok(drafts.length > 0)
    assert.ok(drafts.every((d) => d.sourceType === 'fallback'))
    assert.ok(warnings.some((w) => w.toLowerCase().includes('standard')))
  })
})

/* ------------------------------------------------------------------ */
/*  Unit tests — safety guard                                          */
/* ------------------------------------------------------------------ */

describe('followUpSafety', () => {
  it('blocks questions that request personal identifiers', () => {
    const violation = assertFollowUpTextSafe("What is the patient's name?")
    assert.ok(violation)
    assert.ok(violation!.error.toLowerCase().includes('identifier'))
    assert.ok(violation!.suggestion.includes('PT-XXXX'))
  })

  it('blocks questions that request a phone number / address / aadhaar', () => {
    assert.ok(assertFollowUpTextSafe('Please share your phone number.'))
    assert.ok(assertFollowUpTextSafe('What is your home address?'))
    assert.ok(assertFollowUpTextSafe('Aadhaar number please.'))
  })

  it('rejects diagnostic / prescription phrasing in questions and answers', () => {
    const question = assertFollowUpTextSafe('Does the patient have amoxicillin prescribed?')
    assert.ok(question)
    const answer = assertFollowUpAnswerSafe('the doctor prescribed amoxicillin')
    assert.ok(answer)
  })

  it('permits neutral, patient-framed follow-up text', () => {
    assert.equal(assertFollowUpTextSafe('Could the patient describe when the fever started?'), null)
    assert.equal(assertFollowUpAnswerSafe('vomited twice since the morning'), null)
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP integration                                                   */
/* ------------------------------------------------------------------ */

interface ApiResult {
  status: number
  body: Record<string, unknown>
}

describe('follow-up API (HTTP)', () => {
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

  async function listFollowUps(token: string, sessionId: string): Promise<FollowUpQuestion[]> {
    const res = await api(token, 'GET', `/api/sessions/${sessionId}/followups`)
    assert.equal(res.status, 200)
    return res.body as unknown as FollowUpQuestion[]
  }

  let nurse = ''
  let patient = ''
  let sessionId = ''

  before(async () => {
    nurse = await login('nurse', 'Nurse@123')
    patient = await login('patient', 'Patient@123')
    sessionId = await createSession(nurse, 'Chest pain since morning, with sweating.', 'English')
  })

  it('auto-generates full-fledged follow-up questions at intake', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    assert.ok(questions.length > 0)
    const q = questions[0]
    assert.ok(q.id.startsWith('fu-'))
    assert.ok(q.question.length > 0)
    assert.equal(q.status, 'suggested')
    assert.ok(q.language === 'en' || q.language === 'hi' || q.language === 'or')
    assert.ok(q.category.length > 0)
    assert.ok(q.target === 'patient' || q.target === 'staff')
    assert.ok(q.priority >= 1)
    assert.ok(q.reason.length > 0)
    assert.ok(q.sourceType.length > 0)
    assert.ok(q.sourceRef.length > 0)
    assert.ok(q.createdAt)
    assert.ok(q.updatedAt)
    assert.ok(questions.some((x) => x.sourceType === 'urgency-flag' && x.sourceRef === 'URG-01'))
  })

  it('adds a clinician-authored question', async () => {
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups`, {
      text: 'Have the symptoms changed since the last visit?',
      language: 'en',
      category: 'symptom-detail',
      target: 'patient',
    })
    assert.equal(res.status, 201)
    const added = res.body as unknown as FollowUpQuestion
    assert.equal(added.sourceType, 'clinician')
    assert.equal(added.category, 'symptom-detail')
    const questions = await listFollowUps(nurse, sessionId)
    assert.ok(questions.some((q) => q.id === added.id))
  })

  it('asks a question', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'suggested')!
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/${target.id}/ask`, {})
    assert.equal(res.status, 200)
    const asked = res.body as unknown as FollowUpQuestion
    assert.equal(asked.status, 'asked')
    assert.ok(asked.askedAt)
  })

  it('records an answer verbatim and anonymised', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'asked')!
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/${target.id}/answer`, {
      answerText: 'vomited twice since the morning',
      answerLanguage: 'en',
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const answered = res.body as unknown as FollowUpQuestion
    assert.equal(answered.status, 'answered')
    assert.ok(answered.answer!.includes('vomited'))
    assert.equal(answered.answerLanguage, 'en')
    assert.ok(answered.answeredBy)
    assert.ok(answered.answeredAt)
  })

  it('strips identifiers from answers before storing', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'suggested')!
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/${target.id}/answer`, {
      answerText: 'my name is Ramesh, phone 9876543210',
      answerLanguage: 'en',
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const answered = res.body as unknown as FollowUpQuestion
    assert.ok(answered.answer!.includes('REDACTED'))
    assert.ok(!answered.answer!.includes('Ramesh'))
    assert.ok(!answered.answer!.includes('9876543210'))
  })

  it('rejects answers with prescription phrasing + a suggestion', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'suggested')!
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/${target.id}/answer`, {
      answerText: 'the doctor prescribed amoxicillin',
      answerLanguage: 'en',
    })
    assert.equal(res.status, 400)
    const body = res.body as { error: string; suggestion?: string }
    assert.ok(body.error.toLowerCase().includes('safeguard'))
    assert.ok(body.suggestion && body.suggestion.length > 10)
  })

  it('skips a question', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'suggested')!
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/${target.id}/skip`, {})
    assert.equal(res.status, 200)
    assert.equal((res.body as unknown as FollowUpQuestion).status, 'skipped')
  })

  it('edits a question (wording + routing)', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'suggested')!
    const res = await api(nurse, 'PATCH', `/api/sessions/${sessionId}/followups/${target.id}`, {
      question: 'When did the complaint first begin?',
      category: 'timeline',
      target: 'patient',
      priority: 1,
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const edited = res.body as unknown as FollowUpQuestion
    assert.equal(edited.question, 'When did the complaint first begin?')
    assert.equal(edited.category, 'timeline')
    assert.equal(edited.priority, 1)
  })

  it('deletes a question', async () => {
    const questions = await listFollowUps(nurse, sessionId)
    const target = questions.find((q) => q.status === 'suggested')!
    const res = await api(nurse, 'DELETE', `/api/sessions/${sessionId}/followups/${target.id}`)
    assert.equal(res.status, 204)
    const after = await listFollowUps(nurse, sessionId)
    assert.ok(!after.some((q) => q.id === target.id))
  })

  it('reorders the question list', async () => {
    const beforeOrder = await listFollowUps(nurse, sessionId)
    assert.ok(beforeOrder.length >= 2)
    const reversed = beforeOrder.map((q) => q.id).reverse()
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/reorder`, { orderedIds: reversed })
    assert.equal(res.status, 200)
    const reordered = res.body as unknown as FollowUpQuestion[]
    assert.deepEqual(reordered.map((q) => q.id), reversed)
    assert.deepEqual(reordered.map((q) => q.priority), reordered.map((_, i) => i + 1))
  })

  it('rejects a non-permutation reorder', async () => {
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/reorder`, { orderedIds: ['fu-nope'] })
    assert.equal(res.status, 400)
  })

  it('regenerates suggestions but keeps human-tracked questions', async () => {
    const session = await createSession(nurse, 'Fever since 2 days.', 'English')
    let questions = await listFollowUps(nurse, session)
    const answeredTarget = questions.find((q) => q.status === 'suggested')!
    await api(nurse, 'POST', `/api/sessions/${session}/followups/${answeredTarget.id}/answer`, {
      answerText: 'fever is mild',
      answerLanguage: 'en',
    })
    questions = await listFollowUps(nurse, session)
    const answered = questions.find((q) => q.id === answeredTarget.id)!
    assert.equal(answered.status, 'answered')
    const suggestedIds = questions.filter((q) => q.status === 'suggested').map((q) => q.id)

    const regenerated = await api(nurse, 'POST', `/api/sessions/${session}/followups/regenerate`, {})
    assert.equal(regenerated.status, 201)
    const after = regenerated.body as unknown as FollowUpQuestion[]
    assert.ok(after.some((q) => q.id === answeredTarget.id && q.status === 'answered'))
    assert.ok(!suggestedIds.includes(after.find((q) => q.status === 'suggested')!.id))
  })

  it('answers 404 for an unknown question', async () => {
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups/fu-missing/ask`, {})
    assert.equal(res.status, 404)
  })

  it('rejects a clinician question that requests personal identifiers', async () => {
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/followups`, {
      text: "What is the patient's name?",
      language: 'en',
      category: 'other',
      target: 'patient',
    })
    assert.equal(res.status, 400)
    const body = res.body as { error: string; suggestion?: string }
    assert.ok(body.error.toLowerCase().includes('identifier'))
    assert.ok(body.suggestion && body.suggestion.includes('PT-XXXX'))
  })

  it('keeps patients out of the follow-up actions (403)', async () => {
    const own = await createSession(patient, 'Cough since yesterday.', 'English')
    const list = await api(patient, 'GET', `/api/sessions/${own}/followups`)
    assert.equal(list.status, 200)
    const generate = await api(patient, 'POST', `/api/sessions/${own}/followups/generate`, {})
    assert.equal(generate.status, 403)
    const add = await api(patient, 'POST', `/api/sessions/${own}/followups`, { text: 'any', language: 'en' })
    assert.equal(add.status, 403)
  })

  it('builds Hindi follow-up questions in Devanagari', async () => {
    const session = await createSession(nurse, 'तीन दिन से बुखार और उल्टी।', 'Hindi')
    const questions = await listFollowUps(nurse, session)
    assert.equal(questions[0].language, 'hi')
    assert.ok(/[\u0900-\u097F]/.test(questions[0].question))
    assert.ok(questions.some((q) => q.sourceType === 'urgency-flag'))
  })

  it('writes follow-up audit entries with the acting identity', async () => {
    const audits = listAudit()
    const actions = ['followup.generated', 'followup.added', 'followup.asked', 'followup.answered', 'followup.skipped', 'followup.edited', 'followup.deleted', 'followup.reordered', 'followup.regenerated']
    for (const action of actions) {
      assert.ok(audits.some((a) => a.action === action), `expected audit action ${action}`)
    }
    const answered = audits.find((a) => a.action === 'followup.answered')
    assert.ok(answered && answered.actor.length > 0 && answered.detail.includes('verbatim'))
  })
})