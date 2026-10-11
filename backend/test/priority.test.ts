import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit } from '../src/services/auditStore'
import { createUser, listUsers, seedUsers } from '../src/services/authStore'
import { clearFacilities, createFacility, seedDefaultFacility } from '../src/services/facilityService'
import { clearSessions, createSession, updateSession } from '../src/services/sessionStore'
import { clearPriorityOverrides } from '../src/services/priorityOverrideService'
import { clearSlaConfigs } from '../src/services/slaService'
import { bandForScore, computePriority } from '../src/services/priorityScoringService'
import { DEFAULT_FACILITY_ID } from '../src/types/facility.types'
import type { ExtractedReport, ExtractedVital, PatientSession, TriageNote } from '../src/types'

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function baseNote(missing = 0, flags: TriageNote['urgencyFlags'] = []): TriageNote {
  return {
    structuredNote: { chiefComplaint: 'Reported symptom.', history: 'Human review pending.', vitals: 'Not provided.' },
    observations: ['redacted narrative'],
    urgencyFlags: flags,
    missingInformation: Array.from({ length: missing }).map((_, index) => ({
      id: `mi-${index}`,
      field: `Field ${index}`,
      whyItMatters: 'Needed before a clinician decision.',
    })),
    followUpQuestions: [],
    riskScore: 'Low',
    status: 'ai-draft',
    generatedAt: new Date().toISOString(),
    disclaimer: 'non-diagnostic',
  }
}

function flag(ruleId: string, severity: 'red' | 'amber', label: string): TriageNote['urgencyFlags'][number] {
  return { id: `${ruleId}-${label}`, label, severity, reason: 'Recorded for review.', ruleId }
}

function makeReport(input: { labValues?: number; vitals?: ExtractedVital[]; createdAt?: string } = {}): ExtractedReport {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const report: ExtractedReport = {
    id: `rep-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'sess-unit',
    patientId: 'PT-TEST',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    source: 'pdf',
    type: 'lab',
    language: 'English',
    reportDate: null,
    status: 'pending-review',
    redactedText: '',
    anonymization: { redactedCount: 0, redactions: [] },
    labValues: [],
    vitals: input.vitals ?? [],
    findings: [],
    warnings: [],
    ocr: { engine: 'pdf-text', confidence: 100, pages: 1 },
    disclaimer: 'non-diagnostic',
    reviewedBy: null,
    reviewedByRole: null,
    reviewNote: null,
    rejectionReason: null,
    createdAt,
    updatedAt: createdAt,
  }
  if (input.labValues) {
    report.labValues = Array.from({ length: input.labValues }).map((_, index) => ({
      id: `l-${index}`,
      reportId: report.id,
      name: `Analyte ${index}`,
      value: 1,
      unit: 'u',
      referenceRange: null,
      flag: index % 2 === 0 ? 'high' : 'low',
      confidence: 1,
    }))
  }
  return report
}

function vital(name: string, value: number, unit: string): ExtractedVital {
  return { id: `${name}-${value}`, reportId: 'rep', name, value, unit, flag: 'low', confidence: 1, recordedAt: null }
}

function makeSession(overrides: Partial<PatientSession> = {}): PatientSession {
  const now = new Date().toISOString()
  return {
    id: 'sess-unit',
    patientId: 'PT-TEST',
    language: 'English',
    ageBand: '18-39',
    sex: 'Female',
    intakePoint: 'OPD',
    facility: 'Test Facility',
    facilityId: 'facility-test',
    displayText: 'redacted text',
    anonymization: { redactedCount: 0, redactions: [] },
    reports: [],
    visuals: [],
    note: baseNote(),
    overrides: [],
    referral: null,
    status: 'ready',
    ownerId: 'usr-unit',
    createdBy: 'Tester',
    createdByRole: 'nurse',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function points(session: PatientSession, key: string): number {
  const found = computePriority(session).breakdown.components.find((entry) => entry.key === key)
  assert.ok(found, `component ${key} missing`)
  return found!.points
}

/* ------------------------------------------------------------------ */
/*  Scoring unit tests                                                 */
/* ------------------------------------------------------------------ */

describe('priority scoring (unit)', () => {
  it('awards 15 for a single red flag and dedupes by rule id', () => {
    const session = makeSession({ note: baseNote(0, [flag('URG-01', 'red', 'Chest pain'), flag('URG-01', 'red', 'Chest pain')]) })
    assert.equal(points(session, 'urgency'), 15)
  })

  it('halves the amber contribution when a red flag is present', () => {
    const session = makeSession({ note: baseNote(0, [flag('R1', 'red', 'Red'), flag('A1', 'amber', 'Amber')]) })
    assert.equal(points(session, 'urgency'), 15 + 3)
  })

  it('caps urgency at 40', () => {
    const flags = [flag('R1', 'red', 'a'), flag('R2', 'red', 'b'), flag('R3', 'red', 'c')]
    assert.equal(points(makeSession({ note: baseNote(0, flags) }), 'urgency'), 40)
  })

  it('maps each age band', () => {
    assert.equal(points(makeSession({ ageBand: '0-17' }), 'age'), 18)
    assert.equal(points(makeSession({ ageBand: '60+' }), 'age'), 15)
    assert.equal(points(makeSession({ ageBand: '40-59' }), 'age'), 8)
    assert.equal(points(makeSession({ ageBand: '18-39' }), 'age'), 0)
    assert.equal(points(makeSession({ ageBand: 'Unknown' }), 'age'), 5)
  })

  it('awards wait points and freezes a finalised case', () => {
    const old = new Date(Date.now() - 200 * 60000).toISOString()
    assert.equal(points(makeSession({ createdAt: old }), 'wait'), 20)
    assert.equal(computePriority(makeSession({ createdAt: old })).waitMinutes, 200)
    const acceptedAt = new Date(Date.now() - 190 * 60000).toISOString()
    const finalised = makeSession({ createdAt: old, status: 'accepted', updatedAt: acceptedAt })
    assert.equal(points(finalised, 'wait'), 0)
  })

  it('scores abnormal labs with a cap of 15', () => {
    assert.equal(points(makeSession({ reports: [makeReport({ labValues: 4 })] }), 'labs'), 15)
  })

  it('scores vitals (SpO2 + respiratory rate) up to the cap of 20', () => {
    const report = makeReport({ vitals: [vital('SpO2', 88, '%'), vital('Respiratory Rate', 34, '/min')] })
    assert.equal(points(makeSession({ reports: [report] }), 'vitals'), 20)
  })

  it('applies the 0 / -5 / -10 completeness penalty', () => {
    assert.equal(points(makeSession({ note: baseNote(0) }), 'completeness'), 0)
    assert.equal(points(makeSession({ note: baseNote(1) }), 'completeness'), -5)
    assert.equal(points(makeSession({ note: baseNote(3) }), 'completeness'), -10)
  })

  it('clamps the total into 0..100 and maps it to a band', () => {
    const session = makeSession({
      ageBand: '0-17',
      createdAt: new Date(Date.now() - 300 * 60000).toISOString(),
      note: baseNote(0, [flag('R1', 'red', 'a'), flag('R2', 'red', 'b'), flag('R3', 'red', 'c')]),
    })
    const result = computePriority(session)
    assert.ok(result.score >= 0 && result.score <= 100)
    assert.equal(result.band, bandForScore(result.score))
  })

  it('maps scores to bands at the documented thresholds', () => {
    assert.equal(bandForScore(80), 'critical')
    assert.equal(bandForScore(60), 'high')
    assert.equal(bandForScore(40), 'medium')
    assert.equal(bandForScore(20), 'low')
    assert.equal(bandForScore(19), 'routine')
  })

  it('produces non-diagnostic reasons only', () => {
    const session = makeSession({ note: baseNote(0, [flag('R1', 'red', 'Chest pain reported')]) })
    const reasons = computePriority(session).breakdown.components.flatMap((entry) => entry.reasons)
    for (const reason of reasons) {
      assert.ok(!/diagnos|prescrib|treatment|you have/i.test(reason), `unsafe reason: ${reason}`)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP API tests                                                     */
/* ------------------------------------------------------------------ */

interface HttpResult {
  status: number
  body: Record<string, unknown>
}

describe('priority queue API (HTTP)', () => {
  let server: Server
  let base = ''
  let nurse = ''
  let doctor = ''
  let patient = ''
  let admin = ''
  let facilityAdmin = ''
  let nurseId = ''
  let sessionId = ''

  before(async () => {
    seedUsers()
    clearAudit()
    clearSessions()
    clearFacilities()
    clearSlaConfigs()
    clearPriorityOverrides()
    seedDefaultFacility()
    createUser({ username: 'facadmin', displayName: 'Facility Admin', password: 'Fac@12345', role: 'facility-admin', facilityId: DEFAULT_FACILITY_ID })
    nurseId = listUsers().find((user) => user.username === 'nurse')!.id
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
    admin = await login('admin', 'Admin@123')
    facilityAdmin = await login('facadmin', 'Fac@12345')

    const session = createSession({
      displayText: 'redacted narrative',
      anonymization: { redactedCount: 0, redactions: [] },
      language: 'English',
      ageBand: '60+',
      sex: 'Male',
      intakePoint: 'OPD',
      ownerId: nurseId,
      createdBy: 'Nurse',
      createdByRole: 'nurse',
      facilityId: DEFAULT_FACILITY_ID,
      note: baseNote(0, [flag('URG-01', 'red', 'Chest pain reported'), flag('URG-06', 'amber', 'Persistent vomiting')]),
    })
    sessionId = session.id
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function login(username: string, password: string): Promise<string> {
    const res = await request('POST', '/api/auth/login', { username, password })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return String(res.body.token)
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    headers: Record<string, string> = {},
  ): Promise<HttpResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  it('lists the queue for staff with a breakdown + disclaimer', async () => {
    const res = await request('GET', '/api/queue', undefined, nurse)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const entries = res.body.entries as Array<Record<string, unknown>>
    assert.ok(entries.length >= 1)
    assert.equal(typeof entries[0].score, 'number')
    assert.ok(Array.isArray((entries[0].breakdown as Record<string, unknown>).components))
    assert.match(String(entries[0].disclaimer), /does not diagnose/i)
  })

  it('forbids a patient from reading the queue', async () => {
    const res = await request('GET', '/api/queue', undefined, patient)
    assert.equal(res.status, 403)
  })

  it('summarises the queue by band', async () => {
    const res = await request('GET', '/api/queue/summary', undefined, doctor)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const summary = res.body.summary as Record<string, unknown>
    assert.equal(typeof summary.total, 'number')
    assert.ok(summary.byBand)
  })

  it('forbids a nurse from overriding the score but allows marking reviewed', async () => {
    const denied = await request('POST', `/api/queue/${sessionId}/override`, { kind: 'score', value: 5, reason: 'Nurse test' }, nurse)
    assert.equal(denied.status, 403)
    const reviewed = await request('POST', `/api/queue/${sessionId}/override`, { kind: 'reviewed', reason: 'Looked over.' }, nurse)
    assert.equal(reviewed.status, 201, JSON.stringify(reviewed.body))
  })

  it('lets a doctor set and clear a score override', async () => {
    const set = await request('POST', `/api/queue/${sessionId}/override`, { kind: 'score', value: 5, reason: 'Clinician judgement.' }, doctor)
    assert.equal(set.status, 201, JSON.stringify(set.body))
    const after = await request('GET', `/api/queue/${sessionId}`, undefined, doctor)
    const entry = after.body.entry as Record<string, unknown>
    assert.equal(entry.score, 5)
    assert.equal(entry.band, 'routine')
    const cleared = await request('DELETE', `/api/queue/${sessionId}/override/score`, undefined, doctor)
    assert.equal(cleared.status, 204)
    const restored = await request('GET', `/api/queue/${sessionId}`, undefined, doctor)
    assert.notEqual((restored.body.entry as Record<string, unknown>).score, 5)
  })

  it('lets a facility-admin pin but not override the score', async () => {
    const scoreDenied = await request('POST', `/api/queue/${sessionId}/override`, { kind: 'score', value: 30, reason: 'Try.' }, facilityAdmin)
    assert.equal(scoreDenied.status, 403)
    const pin = await request('POST', `/api/queue/${sessionId}/override`, { kind: 'pin', reason: 'Escalated locally.' }, facilityAdmin)
    assert.equal(pin.status, 201, JSON.stringify(pin.body))
    const after = await request('GET', `/api/queue/${sessionId}`, undefined, facilityAdmin)
    assert.equal((after.body.entry as Record<string, unknown>).pinned, true)
  })

  it('validates SLA thresholds and gates editing', async () => {
    const doctorDenied = await request('PATCH', '/api/queue/sla-config', { critical: 4 }, doctor)
    assert.equal(doctorDenied.status, 403)
    const invalid = await request('PATCH', '/api/queue/sla-config', { critical: 100, high: 10 }, admin)
    assert.equal(invalid.status, 400)
    const ok = await request('PATCH', '/api/queue/sla-config', { critical: 4, high: 14, medium: 50, low: 150, routine: 300 }, admin)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    const config = ok.body.config as Record<string, number>
    assert.equal(config.critical, 4)
  })

  it('reports SLA breaches', async () => {
    updateSession(sessionId, { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString() })
    const res = await request('GET', '/api/queue/sla-breaches', undefined, doctor)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const entries = res.body.entries as Array<Record<string, unknown>>
    assert.ok(entries.some((entry) => entry.sessionId === sessionId))
  })

  it('assigns and unassigns a case', async () => {
    const assign = await request('POST', `/api/queue/${sessionId}/assign`, { assigneeId: nurseId }, doctor)
    assert.equal(assign.status, 200, JSON.stringify(assign.body))
    assert.equal((assign.body.entry as Record<string, unknown>).assignedTo, nurseId)
    const unassign = await request('POST', `/api/queue/${sessionId}/unassign`, {}, doctor)
    assert.equal(unassign.status, 200, JSON.stringify(unassign.body))
    assert.equal((unassign.body.entry as Record<string, unknown>).assignedTo, null)
  })

  it('hides a session from another facility (404)', async () => {
    const other = createFacility({ name: 'Other Clinic', type: 'phc' }, 'Tester').id
    const res = await request('GET', `/api/queue/${sessionId}`, undefined, admin, { 'x-facility-id': other })
    assert.equal(res.status, 404)
  })
})
