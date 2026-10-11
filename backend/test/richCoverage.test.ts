import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import {
  REFERRAL_CHECKLIST_TEMPLATE,
  applyReferralStatus,
  buildReferralNote,
  buildReferralRationale,
  canTransition,
  checklistSatisfied,
  createChecklistState,
  nextAllowedStatuses,
  overrideChecklist,
  setChecklistEntry,
  toStructuredReferralNote,
} from '../src/services/referralService'
import { analyze } from '../src/services/triageService'
import {
  acceptNote,
  escalateNote,
  finalizeNote,
  isTerminalNoteStatus,
  markReviewed,
  rejectNote,
  resolveEscalation,
  returnToIntake,
} from '../src/services/noteReviewService'
import {
  buildCaseSummaryOnePager,
  buildShiftHandoverReport,
  listSlaBreachNotifications,
} from '../src/services/richReportingService'
import { bodyRegionLabel, findBodyRegion, listBodyRegions } from '../src/services/bodyRegionService'
import {
  buildVoiceIntakeMetrics,
  clearVoiceIntakeMetrics,
  getVoiceIntakeMetrics,
  recordVoiceIntakeMetrics,
} from '../src/services/voiceMetricsService'
import { buildTriageSummaryPdf, getStoredTriageSummaryPdfBytes } from '../src/services/triageSummaryPdfService'
import { createSession } from '../src/services/sessionStore'
import type { PatientSession, TriageNote } from '../src/types'

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function fakeSession(overrides: Partial<PatientSession> = {}): PatientSession {
  const now = new Date().toISOString()
  return {
    id: 'sess-1',
    patientId: 'pat-1',
    language: 'English',
    ageBand: 'Unknown',
    sex: 'Not stated',
    intakePoint: 'OPD',
    facility: 'PHC Demo',
    facilityId: 'facility-default',
    displayText: 'Chest pain since morning.',
    anonymization: { redactedCount: 0, redactions: [] },
    reports: [],
    visuals: [],
    note: null,
    overrides: [],
    referral: null,
    status: 'ready',
    ownerId: 'user-nurse',
    createdBy: 'Nurse',
    createdByRole: 'nurse',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const ACTOR = { name: 'Nurse Demo', role: 'nurse' as const }

function noteFor(text = 'Chest pain since morning with sweating.'): TriageNote {
  return analyze({ text, language: 'English' })
}

/* ------------------------------------------------------------------ */
/*  Unit — pre-referral checklist (F)                                  */
/* ------------------------------------------------------------------ */

describe('referralService — checklist', () => {
  it('scopes checklist items to the referral level', () => {
    const phc = createChecklistState('phc')
    assert.ok(phc.items.some((i) => i.id === 'PRE-01'))
    assert.ok(!phc.items.some((i) => i.id === 'PRE-03'), 'phc excludes vitals item')
    const tertiary = createChecklistState('tertiary')
    assert.ok(tertiary.items.some((i) => i.id === 'PRE-03'))
    assert.ok(tertiary.items.some((i) => i.id === 'PRE-05'))
    assert.ok(tertiary.items.length >= phc.items.length)
  })

  it('is unsatisfied until every item is checked, then satisfied', () => {
    let state = createChecklistState('phc')
    assert.equal(checklistSatisfied(state), false)
    for (const item of state.items) {
      state = setChecklistEntry(state, item.id, true, ACTOR)
    }
    assert.equal(checklistSatisfied(state), true)
  })

  it('unchecking removes the entry again', () => {
    let state = createChecklistState('phc')
    const first = state.items[0].id
    state = setChecklistEntry(state, first, true, ACTOR)
    assert.equal(checklistSatisfied(state), false)
    state = setChecklistEntry(state, first, false, ACTOR)
    assert.equal(state.entries.length, 0)
  })

  it('rejects an unknown item and a too-short override reason', () => {
    const state = createChecklistState('phc')
    assert.throws(() => setChecklistEntry(state, 'NOPE', true, ACTOR), /not found/)
    assert.throws(() => overrideChecklist(state, 'x', ACTOR), /reason/)
  })

  it('an override marks the checklist satisfied and records who/why', () => {
    const state = overrideChecklist(createChecklistState('district'), 'Patient deteriorating, proceeding immediately.', ACTOR)
    assert.equal(state.overridden, true)
    assert.equal(state.overriddenBy, ACTOR.name)
    assert.ok(state.overriddenAt)
    assert.equal(checklistSatisfied(state), true)
  })

  it('every template item declares at least one level and a critical flag', () => {
    for (const item of REFERRAL_CHECKLIST_TEMPLATE) {
      assert.ok(item.requiredForLevels.length > 0, item.id)
      assert.equal(typeof item.critical, 'boolean')
    }
  })
})

/* ------------------------------------------------------------------ */
/*  Unit — status machine (G)                                          */
/* ------------------------------------------------------------------ */

describe('referralService — status machine', () => {
  it('allows only declared transitions and no exit from terminal states', () => {
    assert.equal(canTransition('draft', 'approved'), true)
    assert.equal(canTransition('draft', 'sent'), false)
    assert.equal(canTransition('closed', 'approved'), false)
    assert.deepEqual(nextAllowedStatuses('cancelled'), [])
  })

  it('applies a legal transition and appends an audit event', () => {
    const note = noteFor()
    const referral = buildReferralNote({ session: fakeSession(), note, actor: ACTOR, toFacility: 'District Hospital', referralLevel: 'district' })
    assert.equal(referral.status, 'draft')
    const approved = applyReferralStatus(referral, 'approved', { name: 'Dr Rao', role: 'doctor' })
    assert.equal(approved.status, 'approved')
    assert.equal(approved.approvedBy, 'Dr Rao')
    assert.equal(approved.statusHistory?.length, 1)
    assert.equal(approved.statusHistory?.[0].fromStatus, 'draft')
    assert.equal(approved.statusHistory?.[0].toStatus, 'approved')
  })

  it('throws on an illegal transition', () => {
    const referral = buildReferralNote({ session: fakeSession(), note: noteFor(), actor: ACTOR, toFacility: 'District' })
    assert.throws(() => applyReferralStatus(referral, 'arrived', ACTOR), /cannot move/)
  })
})

/* ------------------------------------------------------------------ */
/*  Unit — rationale + structured build (C/E)                          */
/* ------------------------------------------------------------------ */

describe('referralService — rationale and structured note', () => {
  it('projects urgency flags and missing info into the rationale', () => {
    const session = fakeSession()
    const note = noteFor('Chest pain since morning.')
    const rationale = buildReferralRationale(session, note)
    assert.ok(rationale.urgencyFlags.some((f) => f.ruleId === 'URG-01'))
    assert.ok(rationale.urgencyFlags[0].severity === 'red' || rationale.urgencyFlags[0].severity === 'amber')
    assert.ok(rationale.missingInfoItems.length > 0)
    assert.ok(rationale.disclaimer.length > 10)
  })

  it('builds a rich draft with checklist, investigations and a default reason', () => {
    const session = fakeSession()
    const note = noteFor()
    const referral = buildReferralNote({ session, note, actor: ACTOR, toFacility: 'District Hospital', referralLevel: 'district' })
    assert.equal(referral.referralLevel, 'district')
    assert.ok(referral.checklist && referral.checklist.items.length > 0)
    assert.equal(referral.statusHistory?.length, 0)
    assert.ok(referral.reasonForReferral.includes('District Hospital'))
    assert.equal(referral.preparedBy, ACTOR.name)
  })

  it('projects a stored referral into the canonical structured shape', () => {
    const referral = buildReferralNote({ session: fakeSession(), note: noteFor(), actor: ACTOR, toFacility: 'District Hospital', referralLevel: 'district', reasonForReferral: 'Needs review' })
    const structured = toStructuredReferralNote(referral)
    assert.equal(structured.referralLevel, 'district')
    assert.equal(structured.reasonForReferral, 'Needs review')
    assert.equal(structured.status, 'draft')
    assert.equal(structured.preparedBy, ACTOR.name)
    assert.ok(structured.nonDiagnosticDisclaimer.length > 10)
    assert.ok(structured.preReferralChecklist.items.length > 0)
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP integration                                                   */
/* ------------------------------------------------------------------ */

interface ApiResult {
  status: number
  body: Record<string, unknown>
}

describe('referral API (HTTP)', () => {
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

  async function createSession(token: string): Promise<string> {
    const res = await api(token, 'POST', '/api/sessions', {
      text: 'Chest pain since morning, with sweating.',
      consentAcknowledged: true,
      language: 'English',
    })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return (res.body as { session: { id: string } }).session.id
  }

  let nurse = ''
  let doctor = ''
  let patient = ''
  let sessionId = ''

  before(async () => {
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
    sessionId = await createSession(nurse)
  })

  it('drafts a rich referral at the requested level', async () => {
    const res = await api(nurse, 'POST', `/api/sessions/${sessionId}/referral`, {
      toFacility: 'District Hospital',
      reason: 'Reported chest pain needs district review.',
      referralLevel: 'district',
      handoverNotes: 'Patient advised to attend today.',
    })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const body = res.body as {
      session: { referral: { referralLevel: string; checklist: { items: unknown[] }; status: string } }
      structuredReferral: { referralLevel: string; status: string }
    }
    assert.equal(body.session.referral.referralLevel, 'district')
    assert.equal(body.session.referral.status, 'draft')
    assert.ok(body.session.referral.checklist.items.length > 0)
    assert.equal(body.structuredReferral.referralLevel, 'district')
    assert.ok(listAudit().some((a) => a.action === 'referral.generated'))
  })

  it('reads the referral back with its structured projection', async () => {
    const res = await api(nurse, 'GET', `/api/sessions/${sessionId}/referral`)
    assert.equal(res.status, 200)
    const body = res.body as { structuredReferral: { preparedBy: string } }
    assert.ok(body.structuredReferral.preparedBy.length > 0)
  })

  it('tracks checklist progress and an override', async () => {
    const read = await api(nurse, 'GET', `/api/sessions/${sessionId}/referral`)
    const checklist = (read.body as { referral: { checklist: { items: Array<{ id: string }> } } }).referral.checklist
    const toggle = await api(nurse, 'POST', `/api/sessions/${sessionId}/referral/checklist`, {
      itemId: checklist.items[0].id,
      checked: true,
    })
    assert.equal(toggle.status, 200)
    assert.equal((toggle.body as { checklistSatisfied: boolean }).checklistSatisfied, false)

    const override = await api(nurse, 'POST', `/api/sessions/${sessionId}/referral/checklist/override`, {
      reason: 'Patient deteriorating, proceeding without full checklist.',
    })
    assert.equal(override.status, 200)
    const after = await api(nurse, 'GET', `/api/sessions/${sessionId}/referral`)
    assert.equal((after.body as { referral: { checklist: { overridden: boolean } } }).referral.checklist.overridden, true)
  })

  it('enforces the status machine (illegal jump → 409)', async () => {
    const bad = await api(nurse, 'POST', `/api/sessions/${sessionId}/referral/status`, { status: 'sent' })
    assert.equal(bad.status, 409)

    const approve = await api(doctor, 'POST', `/api/sessions/${sessionId}/referral/approve`, {})
    assert.equal(approve.status, 200)
    assert.equal((approve.body as { session: { referral: { status: string } } }).session.referral.status, 'approved')

    const sent = await api(nurse, 'POST', `/api/sessions/${sessionId}/referral/status`, { status: 'sent', note: 'Handed to transport.' })
    assert.equal(sent.status, 200)
    assert.equal((sent.body as { session: { referral: { status: string } } }).session.referral.status, 'sent')
  })

  it('keeps patients out of referral mutations', async () => {
    const res = await api(patient, 'POST', `/api/sessions/${sessionId}/referral/checklist`, { itemId: 'PRE-01', checked: true })
    assert.equal(res.status, 403)
  })
})

/* ------------------------------------------------------------------ */
/*  Unit — note review chain (H/P/Q/R)                                 */
/* ------------------------------------------------------------------ */

describe('noteReviewService', () => {
  const nurse = { name: 'Nurse Demo', role: 'nurse' as const }
  const doctor = { name: 'Dr Rao', role: 'doctor' as const }

  it('walks review → accept → finalize with actor stamps', () => {
    const draft = noteFor()
    assert.equal(draft.status, 'ai-draft')
    const reviewed = markReviewed(draft, nurse)
    assert.equal(reviewed.status, 'reviewed')
    assert.equal(reviewed.reviewedBy?.by, nurse.name)
    const accepted = acceptNote(reviewed, doctor)
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.acceptedBy?.by, doctor.name)
    const finalized = finalizeNote(accepted, doctor)
    assert.equal(finalized.status, 'finalized')
    assert.equal(finalized.finalizedBy?.by, doctor.name)
    assert.equal(isTerminalNoteStatus('finalized'), true)
  })

  it('refuses to skip steps (accept before review, finalize before accept)', () => {
    const draft = noteFor()
    assert.throws(() => acceptNote(draft, doctor), /cannot move/)
    const reviewed = markReviewed(draft, nurse)
    assert.throws(() => finalizeNote(reviewed, doctor), /cannot move/)
  })

  it('rejects with a required reason and becomes terminal', () => {
    const draft = noteFor()
    assert.throws(() => rejectNote(draft, 'incomplete', 'x', doctor), /at least/)
    const rejected = rejectNote(draft, 'incomplete', 'Missing vitals entirely.', doctor)
    assert.equal(rejected.status, 'rejected')
    assert.equal(rejected.rejection?.reasonCode, 'incomplete')
    assert.throws(() => markReviewed(rejected, nurse), /cannot move/)
  })

  it('returns to intake with a recorded reason', () => {
    const returned = returnToIntake(noteFor(), 'missing-vitals', 'No vitals captured.', nurse)
    assert.equal(returned.status, 'returned-to-intake')
    assert.equal(returned.returnToIntake?.reasonCode, 'missing-vitals')
  })

  it('escalates to a senior and resolves the escalation', () => {
    const escalated = escalateNote(
      noteFor(),
      { escalatedTo: 'usr-senior', escalatedToName: 'Dr Senior', reasonCode: 'specialist-needed', reasonText: 'Needs specialist review.' },
      nurse,
    )
    assert.equal(escalated.status, 'escalated')
    assert.equal(escalated.escalation?.status, 'pending')
    const declined = resolveEscalation(escalated, 'declined', doctor)
    assert.equal(declined.status, 'escalated')
    assert.equal(declined.escalation?.status, 'declined')
    const accepted = resolveEscalation(escalated, 'accepted', doctor)
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.escalation?.status, 'accepted')
  })

  it('validates escalation reason codes', () => {
    assert.throws(
      () => escalateNote(noteFor(), { escalatedTo: 'x', escalatedToName: 'X', reasonCode: 'nope' as never, reasonText: 'because' }, nurse),
      /reasonCode/,
    )
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP — note review chain                                           */
/* ------------------------------------------------------------------ */

describe('note review API (HTTP)', () => {
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

  async function createSession(token: string): Promise<string> {
    const res = await api(token, 'POST', '/api/sessions', {
      text: 'Fever and cough for two days.',
      consentAcknowledged: true,
      language: 'English',
    })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return (res.body as { session: { id: string } }).session.id
  }

  function noteStatus(body: Record<string, unknown>): string {
    return (body as { session: { note: { status: string } } }).session.note.status
  }

  let nurse = ''
  let doctor = ''
  let patient = ''

  before(async () => {
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
  })

  it('runs review → accept → finalize', async () => {
    const id = await createSession(nurse)
    const review = await api(nurse, 'POST', `/api/sessions/${id}/review`, {})
    assert.equal(review.status, 200)
    assert.equal(noteStatus(review.body), 'reviewed')

    const accept = await api(doctor, 'POST', `/api/sessions/${id}/review/accept`, {})
    assert.equal(accept.status, 200)
    assert.equal(noteStatus(accept.body), 'accepted')

    const finalize = await api(doctor, 'POST', `/api/sessions/${id}/review/finalize`, {})
    assert.equal(finalize.status, 200)
    assert.equal(noteStatus(finalize.body), 'finalized')
    assert.ok(listAudit().some((a) => a.action === 'note.finalized'))
  })

  it('rejects with a reason and refuses an unknown code', async () => {
    const id = await createSession(nurse)
    const bad = await api(doctor, 'POST', `/api/sessions/${id}/review/reject`, { reasonCode: 'nope', reasonText: 'bad' })
    assert.equal(bad.status, 400)
    const reject = await api(doctor, 'POST', `/api/sessions/${id}/review/reject`, { reasonCode: 'inaccurate', reasonText: 'Observations wrong.' })
    assert.equal(reject.status, 200)
    assert.equal(noteStatus(reject.body), 'rejected')
  })

  it('escalates to a senior and records the decision', async () => {
    const id = await createSession(nurse)
    const escalate = await api(nurse, 'POST', `/api/sessions/${id}/review/escalate`, {
      reasonCode: 'clinical-complexity',
      reasonText: 'Needs senior review.',
    })
    assert.equal(escalate.status, 200, JSON.stringify(escalate.body))
    assert.equal(noteStatus(escalate.body), 'escalated')
    const decline = await api(doctor, 'POST', `/api/sessions/${id}/review/escalation`, { decision: 'declined' })
    assert.equal(decline.status, 200)
  })

  it('keeps patients out of the review chain', async () => {
    const id = await createSession(nurse)
    const res = await api(patient, 'POST', `/api/sessions/${id}/review`, {})
    assert.equal(res.status, 403)
  })

  it('serves the case one-pager and blocks patients', async () => {
    const id = await createSession(nurse)
    const ok = await api(nurse, 'GET', `/api/sessions/${id}/case-summary`)
    assert.equal(ok.status, 200)
    assert.equal(typeof (ok.body as { summary: { priorityBand: string } }).summary.priorityBand, 'string')
    const denied = await api(patient, 'GET', `/api/sessions/${id}/case-summary`)
    assert.equal(denied.status, 403)
  })

  it('generates and downloads a triage summary PDF', async () => {
    const id = await createSession(nurse)
    const made = await api(nurse, 'POST', `/api/sessions/${id}/summary-pdf`, { language: 'en' })
    assert.equal(made.status, 201)
    const ref = (made.body as { pdf: { ref: string; mimeType: string } }).pdf.ref
    assert.equal((made.body as { pdf: { mimeType: string } }).pdf.mimeType, 'application/pdf')

    const download = await fetch(`${base}/api/sessions/${id}/summary-pdf/${ref}`, {
      headers: { authorization: `Bearer ${nurse}` },
    })
    assert.equal(download.status, 200)
    assert.equal(download.headers.get('content-type'), 'application/pdf')
  })

  it('serves shift-handover, SLA notifications and body regions', async () => {
    const handover = await api(nurse, 'GET', '/api/shift-handover')
    assert.equal(handover.status, 200)
    assert.equal(typeof (handover.body as { report: { totalCases: number } }).report.totalCases, 'number')

    const sla = await api(nurse, 'GET', '/api/sla/notifications')
    assert.equal(sla.status, 200)
    assert.equal(typeof (sla.body as { count: number }).count, 'number')

    const regions = await api(nurse, 'GET', '/api/body-regions')
    assert.equal(regions.status, 200)
    assert.ok((regions.body as { regions: unknown[] }).regions.length > 0)
  })

  it('records and reads voice intake metrics', async () => {
    const id = await createSession(nurse)
    const recorded = await api(nurse, 'POST', `/api/sessions/${id}/voice-metrics`, {
      durationMs: 3200,
      languageDetected: 'hi',
      transcriptLength: 88,
      confidence: 0.9,
    })
    assert.equal(recorded.status, 201, JSON.stringify(recorded.body))
    const read = await api(nurse, 'GET', `/api/sessions/${id}/voice-metrics`)
    assert.equal(read.status, 200)
    assert.equal((read.body as { metrics: { languageDetected: string } }).metrics.languageDetected, 'hi')
  })
})

/* ------------------------------------------------------------------ */
/*  Unit — reporting, voice metrics, body regions, summary PDF         */
/* ------------------------------------------------------------------ */

describe('richReportingService', () => {
  it('builds a one-pager from a session note', () => {
    const session = fakeSession({ note: noteFor() })
    const summary = buildCaseSummaryOnePager(session, { generatedBy: 'Nurse Demo' })
    assert.equal(summary.sessionId, 'sess-1')
    assert.equal(typeof summary.chiefComplaint, 'string')
    assert.ok(summary.priorityRationale.length > 0)
    assert.ok(summary.disclaimer.length > 0)
  })

  it('scopes the shift-handover report to one facility', () => {
    const mine = fakeSession({ id: 's1', facilityId: 'fac-a', note: noteFor() })
    const theirs = fakeSession({ id: 's2', facilityId: 'fac-b', note: noteFor() })
    const report = buildShiftHandoverReport({
      facilityId: 'fac-a',
      generatedBy: 'Nurse Demo',
      sessions: [mine, theirs],
    })
    assert.equal(report.totalCases, 1)
    assert.equal(report.cases[0].sessionId, 's1')
    assert.equal(report.disclaimer.length > 0, true)
  })

  it('flags a session that has waited past its band SLA', () => {
    const old = fakeSession({
      id: 'sla-1',
      note: noteFor(),
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })
    const breaches = listSlaBreachNotifications([old])
    assert.equal(breaches.length, 1)
    assert.equal(breaches[0].sessionId, 'sla-1')
  })
})

describe('voiceMetricsService', () => {
  it('records, reads and lists voice metrics', () => {
    clearVoiceIntakeMetrics()
    recordVoiceIntakeMetrics({
      sessionId: 'sess-v',
      durationMs: 4321.7,
      languageDetected: 'hi',
      transcriptLength: 120,
      confidence: 0.82,
      recordedBy: 'Nurse Demo',
    })
    const got = getVoiceIntakeMetrics('sess-v')
    assert.ok(got)
    assert.equal(got?.durationMs, 4322)
    assert.equal(got?.languageDetected, 'hi')
  })

  it('validates its inputs', () => {
    assert.throws(
      () => buildVoiceIntakeMetrics({ sessionId: 'x', durationMs: -1, languageDetected: 'en', transcriptLength: 1, confidence: 0.5, recordedBy: 'a' }),
      /durationMs/,
    )
    assert.throws(
      () => buildVoiceIntakeMetrics({ sessionId: 'x', durationMs: 1, languageDetected: 'en', transcriptLength: 1, confidence: 2, recordedBy: 'a' }),
      /confidence/,
    )
  })
})

describe('bodyRegionService', () => {
  it('labels every region in every language', () => {
    for (const region of listBodyRegions()) {
      for (const language of ['en', 'hi', 'or'] as const) {
        assert.equal(typeof bodyRegionLabel(region.id, language), 'string')
        assert.ok((bodyRegionLabel(region.id, language) ?? '').length > 0)
      }
    }
  })

  it('filters regions by view', () => {
    const back = listBodyRegions('back')
    assert.ok(back.length > 0)
    assert.ok(back.every((region) => region.back))
    assert.equal(findBodyRegion('nope'), undefined)
  })
})

describe('triageSummaryPdfService', () => {
  it('renders a stored, non-empty PDF for a session', async () => {
    const session = createSession({
      displayText: 'Chest pain since morning.',
      anonymization: { redactedCount: 0, redactions: [] },
      note: noteFor(),
      language: 'English',
      ageBand: 'Unknown',
      sex: 'Not stated',
      intakePoint: 'OPD',
      ownerId: 'user-nurse',
      createdBy: 'Nurse',
      createdByRole: 'nurse',
      facilityId: 'facility-default',
    })
    const pdf = await buildTriageSummaryPdf(session.id, ACTOR, 'en')
    assert.equal(pdf.mimeType, 'application/pdf')
    assert.ok(pdf.sizeBytes > 0)
    const bytes = getStoredTriageSummaryPdfBytes(pdf.ref)
    assert.ok(bytes)
    assert.equal(bytes?.toString('latin1', 0, 5), '%PDF-')
  })
})
