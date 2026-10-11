import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { createUser, listUsers, seedUsers } from '../src/services/authStore'
import { clearFacilities, seedDefaultFacility } from '../src/services/facilityService'
import { clearSessions } from '../src/services/sessionStore'
import {
  clearFeedbackStoreMemory,
  deleteFeedback,
  exportFeedback,
  getFeedback,
  listAllFeedback,
  listFeedback,
  softDeleteFeedbackForRetention,
  submitFeedback,
  updateFeedback,
  validateFeedbackCreate,
  validateFeedbackUpdate,
} from '../src/services/feedbackService'
import {
  aggregateFeedback,
  buildFeedbackDashboard,
  topProblematicRules,
} from '../src/services/feedbackAggregationService'
import { processBatch } from '../src/services/syncService'
import type { QueuedItem } from '../src/types'
import type { FeedbackReasonCode, FeedbackTargetType, FeedbackVerdict } from '../src/types'
import { DEFAULT_FACILITY_ID } from '../src/types/facility.types'

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

describe('feedback validation', () => {
  it('accepts a well-formed create payload', () => {
    const result = validateFeedbackCreate({
      targetType: 'lab-value',
      targetId: 'lab-1',
      verdict: 'not-useful',
      reasonCode: 'false-positive',
      severity: 'high',
      layerId: 'triage-engine',
    })
    assert.equal(result.ok, true)
    assert.equal(result.errors.length, 0)
  })

  it('rejects unknown target types, verdicts, reason codes, severities and layers', () => {
    const result = validateFeedbackCreate({
      targetType: 'spaceship',
      targetId: 'x',
      verdict: 'great',
      reasonCode: 'vibes',
      severity: 'critical',
      layerId: 'not-a-layer',
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.includes('feedback.unknown-target-type'))
    assert.ok(result.errors.includes('feedback.unknown-verdict'))
    assert.ok(result.errors.includes('feedback.unknown-reason-code'))
    assert.ok(result.errors.includes('feedback.unknown-severity'))
    assert.ok(result.errors.includes('feedback.unknown-layer'))
  })

  it('rejects missing targetId and over-long free text', () => {
    const missing = validateFeedbackCreate({ targetType: 'rule', targetId: '', verdict: 'useful', reasonCode: 'correct' })
    assert.equal(missing.ok, false)
    assert.ok(missing.errors.includes('feedback.target-id-required'))
    const long = validateFeedbackCreate({
      targetType: 'rule',
      targetId: 'r1',
      verdict: 'useful',
      reasonCode: 'correct',
      reasonText: 'x'.repeat(500 * 4 + 1),
    })
    assert.ok(long.errors.includes('feedback.reason-too-long'))
  })

  it('validates updates leniently (all fields optional, but checked when present)', () => {
    assert.equal(validateFeedbackUpdate({}).ok, true)
    assert.equal(validateFeedbackUpdate({ verdict: 'useful' }).ok, true)
    assert.equal(validateFeedbackUpdate({ verdict: 'maybe' }).ok, false)
    assert.equal(validateFeedbackUpdate({ severity: 'urgent' }).ok, false)
  })
})

/* ------------------------------------------------------------------ */
/*  Service: sanitisation, CRUD, filters, aggregation, export         */
/* ------------------------------------------------------------------ */

describe('feedback service (in-memory)', () => {
  const facility = 'fac-test'

  before(() => {
    clearFeedbackStoreMemory()
    clearAudit()
  })

  it('anonymises and de-diagnoses free text before storing', () => {
    const item = submitFeedback({
      facilityId: facility,
      targetType: 'urgency-flag',
      targetId: 'flag-1',
      targetLabel: 'Chest pain phone 9876543210',
      verdict: 'not-useful',
      reasonCode: 'false-positive',
      reasonText: 'the diagnosis was wrong, call 9876543210',
      suggestedFix: 'the diagnosis should say something else',
      actor: { id: 'u-nurse', role: 'nurse' },
    })
    assert.ok(!/9876543210/.test(item.targetLabel), 'phone number must be redacted')
    assert.ok(!/9876543210/.test(item.reasonText ?? ''), 'phone number must be redacted from reason text')
    assert.ok(!/diagnos/i.test(item.reasonText ?? ''), 'diagnosis wording must be scrubbed')
    assert.ok(!/diagnos/i.test(item.suggestedFix ?? ''), 'diagnosis wording must be scrubbed from suggested fix')
    assert.equal(item.severity, 'medium')
    assert.equal(item.status, 'active')
    assert.equal(item.facilityId, facility)
  })

  it('lists newest first, excludes deleted by default, and supports filters', () => {
    clearFeedbackStoreMemory()
    const a = submitFeedback({ facilityId: facility, targetType: 'rule', targetId: 'r1', verdict: 'useful', reasonCode: 'correct', actor: { id: 'u1', role: 'nurse' } })
    const b = submitFeedback({ facilityId: facility, targetType: 'lab-value', targetId: 'l1', verdict: 'not-useful', reasonCode: 'false-positive', severity: 'high', actor: { id: 'u1', role: 'nurse' } })
    submitFeedback({ facilityId: 'other', targetType: 'rule', targetId: 'r2', verdict: 'unclear', reasonCode: 'other', actor: { id: 'u2', role: 'doctor' } })

    const all = listFeedback(facility)
    assert.equal(all.length, 2)
    assert.ok(all.some((i) => i.id === a.id) && all.some((i) => i.id === b.id))

    const labs = listFeedback(facility, { targetType: 'lab-value' })
    assert.equal(labs.length, 1)
    assert.equal(labs[0]?.id, b.id)

    const high = listFeedback(facility, { severity: 'high' })
    assert.equal(high.length, 1)

    deleteFeedback(facility, a.id, { id: 'u1', role: 'nurse' })
    assert.equal(listFeedback(facility).length, 1)
    assert.equal(listFeedback(facility, { status: 'deleted' }).length, 1)
  })

  it('marks an edit with editedAt/editedBy and status edited', () => {
    clearFeedbackStoreMemory()
    const item = submitFeedback({ facilityId: facility, targetType: 'rule', targetId: 'r1', verdict: 'unclear', reasonCode: 'other', actor: { id: 'u1', role: 'nurse' } })
    const updated = updateFeedback(facility, item.id, { verdict: 'useful', reasonCode: 'correct' }, { id: 'u1', role: 'nurse' })
    assert.equal(updated.verdict, 'useful')
    assert.equal(updated.reasonCode, 'correct')
    assert.equal(updated.status, 'edited')
    assert.ok(updated.editedAt)
    assert.equal(updated.editedBy, 'u1')
  })

  it('soft-deletes on retention expiry, keeping the row', () => {
    clearFeedbackStoreMemory()
    const item = submitFeedback({ facilityId: facility, targetType: 'rule', targetId: 'r1', verdict: 'useful', reasonCode: 'correct', actor: { id: 'u1', role: 'nurse' } })
    assert.equal(softDeleteFeedbackForRetention(item.id), true)
    assert.equal(softDeleteFeedbackForRetention(item.id), false)
    assert.equal(getFeedback(facility, item.id)?.status, 'deleted')
    assert.equal(getFeedback(facility, item.id)?.deletedBy, 'retention')
  })

  it('aggregates by target type, layer and reason code, and ranks problematic rules', () => {
    clearFeedbackStoreMemory()
    const mk = (targetType: FeedbackTargetType, targetId: string, verdict: FeedbackVerdict, reasonCode: FeedbackReasonCode, layerId?: string) =>
      submitFeedback({
        facilityId: facility,
        targetType,
        targetId,
        verdict,
        reasonCode,
        layerId: layerId ?? null,
        actor: { id: 'u1', role: 'nurse' },
      })
    mk('rule', 'r1', 'not-useful', 'false-positive', 'triage-engine')
    mk('rule', 'r1', 'not-useful', 'false-positive', 'triage-engine')
    mk('rule', 'r2', 'useful', 'correct', 'triage-engine')
    mk('lab-value', 'l1', 'unclear', 'missing-context', 'report-parser')

    const agg = aggregateFeedback(facility)
    assert.equal(agg.total, 4)
    const ruleRow = agg.byTargetType.find((r) => r.key === 'rule')
    assert.equal(ruleRow?.total, 3)
    assert.equal(ruleRow?.notUseful, 2)
    assert.ok(Math.abs((ruleRow?.notUsefulRate ?? 0) - 2 / 3) < 1e-6)
    assert.ok(agg.byLayer.some((r) => r.key === 'triage-engine'))
    assert.ok(agg.byReasonCode.some((r) => r.key === 'false-positive'))

    const top = topProblematicRules(facility)
    assert.equal(top[0]?.key, 'r1')
    assert.equal(top[0]?.notUseful, 2)

    const dash = buildFeedbackDashboard(facility)
    assert.equal(dash.active, 4)
    assert.equal(dash.byVerdict['not-useful'], 2)
    assert.equal(dash.bySeverity.medium, 4)
  })

  it('exports an active, non-diagnostic copy and audits it', () => {
    clearFeedbackStoreMemory()
    clearAudit()
    submitFeedback({ facilityId: facility, targetType: 'rule', targetId: 'r1', verdict: 'useful', reasonCode: 'correct', actor: { id: 'u1', role: 'nurse' } })
    const result = exportFeedback(facility, { actor: { id: 'admin1', name: 'Admin', role: 'facility-admin' } })
    assert.equal(result.total, 1)
    assert.ok(result.exportId.startsWith('fexp-'))
    assert.match(result.disclaimer, /non-diagnostic/i)
    assert.ok(listAudit().some((e) => e.action === 'feedback.exported'))
  })
})

/* ------------------------------------------------------------------ */
/*  Offline sync dispatch                                             */
/* ------------------------------------------------------------------ */

describe('feedback offline sync dispatch', () => {
  it('applies a queued feedback.create through processBatch', () => {
    clearFeedbackStoreMemory()
    clearAudit()
    seedUsers()
    const nurse = listUsers().find((u) => u.username === 'nurse')
    assert.ok(nurse)
    const item: QueuedItem = {
      id: 'q1',
      actionType: 'feedback.create',
      endpoint: '/api/feedback',
      method: 'POST',
      payload: {
        targetType: 'priority-component',
        targetId: 'p1',
        verdict: 'not-useful',
        reasonCode: 'misprioritised',
        severity: 'high',
      },
      actorId: nurse.id,
      actorRole: 'nurse',
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      lastAttemptAt: null,
      idempotencyKey: 'idem-1',
      lastError: null,
      status: 'pending',
      dependencies: [],
      conflictInfo: null,
    }
    const batch = processBatch([item], nurse)
    assert.equal(batch.results[0]?.status, 'synced')
    const stored = listAllFeedback().filter((f) => f.targetId === 'p1')
    assert.equal(stored.length, 1)
    assert.equal(stored[0]?.verdict, 'not-useful')
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP routes + RBAC + facility scoping                             */
/* ------------------------------------------------------------------ */

interface HttpResult {
  status: number
  body: Record<string, unknown>
}

describe('feedback API (HTTP)', () => {
  let server: Server
  let base = ''
  let nurse = ''
  let doctor = ''
  let patient = ''
  let facAdmin = ''
  let otherFacility = ''

  before(async () => {
    seedUsers()
    clearAudit()
    clearSessions()
    clearFacilities()
    clearFeedbackStoreMemory()
    seedDefaultFacility()
    createUser({ username: 'facadmin', displayName: 'F. Admin', password: 'FacAdmin@123', role: 'facility-admin' })
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const admin = await login('admin', 'Admin@123')
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
    facAdmin = await login('facadmin', 'FacAdmin@123')

    const b = await request('POST', '/api/facilities', { name: 'Other PHC', type: 'phc' }, admin)
    assert.equal(b.status, 201)
    otherFacility = String((b.body.facility as { id: string }).id)
  })

  after(async () => {
    clearFeedbackStoreMemory()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function login(username: string, password: string): Promise<string> {
    const res = await request('POST', '/api/auth/login', { username, password })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return String(res.body.token)
  }

  async function request(method: string, path: string, body?: unknown, token?: string): Promise<HttpResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  it('lets clinical staff submit feedback and blocks patients', async () => {
    const created = await request('POST', '/api/feedback', {
      targetType: 'urgency-flag',
      targetId: 'flag-9',
      targetLabel: 'Red flag',
      verdict: 'not-useful',
      reasonCode: 'false-positive',
      severity: 'high',
    }, nurse)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.status, 'active')

    const forbidden = await request('POST', '/api/feedback', {
      targetType: 'rule',
      targetId: 'r1',
      verdict: 'useful',
      reasonCode: 'correct',
    }, patient)
    assert.equal(forbidden.status, 403)
  })

  it('rejects invalid submissions with 400', async () => {
    const bad = await request('POST', '/api/feedback', { targetType: 'nope', targetId: 'x', verdict: 'useful', reasonCode: 'correct' }, doctor)
    assert.equal(bad.status, 400)
  })

  it('lists and fetches feedback within the facility', async () => {
    const list = await request('GET', '/api/feedback', undefined, nurse)
    assert.equal(list.status, 200)
    const items = list.body as unknown as Array<Record<string, unknown>>
    assert.ok(Array.isArray(items))
    assert.ok(items.length >= 1)
    const id = String(items[0]?.id)

    const one = await request('GET', `/api/feedback/${id}`, undefined, doctor)
    assert.equal(one.status, 200)
    assert.equal(one.body.id, id)

    const missing = await request('GET', '/api/feedback/fb-does-not-exist', undefined, doctor)
    assert.equal(missing.status, 404)
  })

  it('404s a feedback-with-unknown-session lookup', async () => {
    const res = await request('GET', '/api/feedback/sessions/nope', undefined, nurse)
    assert.equal(res.status, 404)
  })

  it('lets an owner edit and withdraw their own feedback', async () => {
    const created = await request('POST', '/api/feedback', {
      targetType: 'rule', targetId: 'r-own', verdict: 'unclear', reasonCode: 'other',
    }, nurse)
    const id = String(created.body.id)
    const patched = await request('PATCH', `/api/feedback/${id}`, { verdict: 'useful', reasonCode: 'correct' }, nurse)
    assert.equal(patched.status, 200)
    assert.equal(patched.body.verdict, 'useful')

    const deleted = await request('DELETE', `/api/feedback/${id}`, undefined, nurse)
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body.status, 'deleted')
  })

  it('stops a clinician editing someone else’s feedback (admin allowed)', async () => {
    const created = await request('POST', '/api/feedback', {
      targetType: 'rule', targetId: 'r-team', verdict: 'useful', reasonCode: 'correct',
    }, nurse)
    const id = String(created.body.id)

    const otherNurse = await request('PATCH', `/api/feedback/${id}`, { verdict: 'not-useful' }, doctor)
    assert.equal(otherNurse.status, 403)

    const adminEdit = await request('PATCH', `/api/feedback/${id}`, { verdict: 'not-useful', reasonCode: 'false-positive' }, facAdmin)
    assert.equal(adminEdit.status, 200)
    assert.equal(adminEdit.body.verdict, 'not-useful')
  })

  it('restricts the aggregate dashboard and export to facility admins', async () => {
    const nurseAgg = await request('GET', '/api/feedback/aggregate', undefined, nurse)
    assert.equal(nurseAgg.status, 403)
    const nurseDash = await request('GET', '/api/feedback/dashboard', undefined, nurse)
    assert.equal(nurseDash.status, 403)

    const agg = await request('GET', '/api/feedback/aggregate', undefined, facAdmin)
    assert.equal(agg.status, 200)
    assert.ok(typeof agg.body.total === 'number')

    const dash = await request('GET', '/api/feedback/dashboard', undefined, facAdmin)
    assert.equal(dash.status, 200)

    const exported = await request('POST', '/api/feedback/export', {}, facAdmin)
    assert.equal(exported.status, 200)
    assert.match(String(exported.body.disclaimer), /non-diagnostic/i)
  })

  it('keeps feedback isolated per facility', async () => {
    const created = await request('POST', '/api/feedback', {
      targetType: 'rule', targetId: 'r-scope', verdict: 'useful', reasonCode: 'correct',
    }, nurse)
    const id = String(created.body.id)

    createUser({ username: 'othernurse', displayName: 'O. Nurse', password: 'OtherNurse@1', role: 'nurse', facilityId: otherFacility })
    const otherToken = await login('othernurse', 'OtherNurse@1')

    const crossRead = await request('GET', `/api/feedback/${id}`, undefined, otherToken)
    assert.equal(crossRead.status, 404)

    const otherList = await request('GET', '/api/feedback', undefined, otherToken)
    assert.equal(otherList.status, 200)
    assert.equal((otherList.body as unknown as unknown[]).length, 0)
  })

  it('records an audit entry for every write', async () => {
    clearAudit()
    await request('POST', '/api/feedback', { targetType: 'rule', targetId: 'r-audit', verdict: 'useful', reasonCode: 'correct' }, nurse)
    const actions = listAudit().map((e) => e.action)
    assert.ok(actions.includes('feedback.created'))
  })

  it('scopes the default facility feedback to the default tenant', async () => {
    const list = await request('GET', '/api/feedback', undefined, facAdmin)
    assert.equal(list.status, 200)
    for (const item of list.body as unknown as Array<{ facilityId: string }>) {
      assert.equal(item.facilityId, DEFAULT_FACILITY_ID)
    }
  })
})
