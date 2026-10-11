import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import {
  clearRetentionOverrides,
  getRetentionPolicy,
  getRetentionRule,
  MAX_RETENTION_DAYS,
  resetRetentionPolicy,
  shouldDelete,
  updateRetentionPolicy,
} from '../src/services/retentionConfig'
import {
  clearOcrHolds,
  clearRetentionActions,
  eraseSessionData,
  extendSessionRetention,
  getOcrHoldCount,
  getRetentionStatus,
  getSessionRetentionTargets,
  holdOcrRawText,
  listRetentionActions,
  releaseOcrRawText,
  RETENTION_HANDLERS,
  runRetentionJob,
} from '../src/services/retentionService'
import { clearStoredImages } from '../src/services/imageStore'
import {
  clearSessions,
  createSession,
  getSession,
  getSessionIncludingDeleted,
  listSeededSessionIds,
  seedSessions,
} from '../src/services/sessionStore'
import { clearTombstones, listTombstones } from '../src/services/tombstoneStore'
import type { TriageNote } from '../src/types'

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const CERT = { name: 'Tester', role: 'admin' as const }

function makeNote(): TriageNote {
  const stamp = new Date().toISOString()
  return {
    structuredNote: { chiefComplaint: 'Fever', history: 'Two days', vitals: 'Not provided' },
    observations: ['Fever reported by the attendant'],
    urgencyFlags: [],
    missingInformation: [{ id: 'mi-1', field: 'Vitals', whyItMatters: 'Anchors triage priority.' }],
    followUpQuestions: [
      {
        id: 'fu-1',
        question: 'When did the fever start?',
        status: 'suggested',
        language: 'en',
        category: 'timeline',
        target: 'patient',
        priority: 1,
        reason: 'Clarify the timeline.',
        sourceType: 'missing-info',
        sourceRef: 'missing-info',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    riskScore: 'Low',
    status: 'ai-draft',
    generatedAt: stamp,
    disclaimer: 'Non-diagnostic observational draft.',
  }
}

function createTestSession() {
  return createSession({
    displayText: 'Fever since two days, no vomiting.',
    anonymization: { redactedCount: 1, redactions: [{ category: 'name', count: 1 }] },
    note: makeNote(),
    language: 'English',
    ageBand: '18-39',
    sex: 'Female',
    intakePoint: 'OPD',
    ownerId: 'usr-test',
    createdBy: 'Tester',
    createdByRole: 'nurse',
  })
}

function resetStore(): void {
  clearSessions()
  clearStoredImages()
  clearTombstones()
  clearOcrHolds()
  clearRetentionActions()
  clearRetentionOverrides()
  clearAudit()
  resetRetentionPolicy()
}

function rowFor(result: { byCategory: Array<{ category: string; deleted: number }> }, category: string) {
  return result.byCategory.find((row) => row.category === category)
}

/* ------------------------------------------------------------------ */
/*  Policy engine                                                      */
/* ------------------------------------------------------------------ */

describe('retentionConfig', () => {
  after(resetRetentionPolicy)

  it('ships all 23 categories with unique names and sane defaults', () => {
    const policy = getRetentionPolicy()
    assert.equal(policy.rules.length, 23)
    assert.equal(new Set(policy.rules.map((rule) => rule.category)).size, 23)
    for (const rule of policy.rules) {
      assert.ok(rule.retentionDays >= 0 && rule.retentionDays <= MAX_RETENTION_DAYS, `${rule.category} days out of range`)
      assert.equal(rule.enabled, true)
      assert.ok(rule.label.length > 3 && rule.description.length > 3, `${rule.category} needs a label + description`)
    }
  })

  it('rejects out-of-range days, 0-day misuse and unknown categories', () => {
    assert.throws(() => updateRetentionPolicy({ rules: [{ category: 'reports', retentionDays: 4000 }], updatedBy: 'Tester' }), /integer 0/)
    assert.throws(() => updateRetentionPolicy({ rules: [{ category: 'reports', retentionDays: 0 }], updatedBy: 'Tester' }), /may be 0 only/)
    assert.throws(() => updateRetentionPolicy({ rules: [{ category: 'nope', retentionDays: 10 }], updatedBy: 'Tester' }), /Unknown retention category/)
    assert.throws(() => updateRetentionPolicy({ rules: [{ category: 'reports', retentionDays: 10, enabled: 'yes' }], updatedBy: 'Tester' }), /boolean/)
    assert.throws(() => updateRetentionPolicy({ rules: [], updatedBy: 'Tester' }), /non-empty/)
  })

  it('applies a valid admin edit and stamps the editor', () => {
    const policy = updateRetentionPolicy({ rules: [{ category: 'reports', retentionDays: 1200 }], updatedBy: 'Admin A' })
    assert.equal(getRetentionRule('reports').retentionDays, 1200)
    assert.equal(policy.updatedBy, 'Admin A')
    assert.equal(policy.rules.find((rule) => rule.category === 'reports')!.retentionDays, 1200)
    resetRetentionPolicy()
    assert.equal(getRetentionRule('reports').retentionDays, 1095)
  })

  it('computes eligibility from the rule age and honours disabled rules', () => {
    const old = new Date(Date.now() - 1200 * 86_400_000).toISOString()
    assert.equal(shouldDelete('reports', old), true)
    assert.equal(shouldDelete('reports', new Date().toISOString()), false)

    updateRetentionPolicy({ rules: [{ category: 'reports', enabled: false }], updatedBy: 'Admin A' })
    assert.equal(shouldDelete('reports', old), false)
    resetRetentionPolicy()
    assert.equal(shouldDelete('reports', old), true)
  })

  it('reads RETENTION_<CATEGORY>_DAYS overrides and re-validates them on reset', () => {
    process.env.RETENTION_REPORTS_DAYS = '5'
    resetRetentionPolicy()
    assert.equal(getRetentionRule('reports').retentionDays, 5)

    // 0 is not on the allowlist for reports, so the override must be ignored.
    process.env.RETENTION_REPORTS_DAYS = '0'
    resetRetentionPolicy()
    assert.equal(getRetentionRule('reports').retentionDays, 1095)

    delete process.env.RETENTION_REPORTS_DAYS
    resetRetentionPolicy()
    assert.equal(getRetentionRule('reports').retentionDays, 1095)
  })
})

/* ------------------------------------------------------------------ */
/*  Engine                                                             */
/* ------------------------------------------------------------------ */

describe('retentionService', () => {
  before(resetStore)
  after(resetStore)

  it('holds then releases raw OCR text, and the sweep purges released text only', () => {
    holdOcrRawText('ocr-done', 'BP 120/80, phone 98765 43210')
    releaseOcrRawText('ocr-done')
    holdOcrRawText('ocr-active', 'still processing')
    assert.equal(getOcrHoldCount(), 2)

    const result = runRetentionJob({ actor: CERT })
    assert.ok((rowFor(result, 'ocr-raw-text')?.deleted ?? 0) >= 1)
    // The released hold is gone; the active one is still held.
    assert.equal(getOcrHoldCount(), 1)

    clearOcrHolds()
    assert.equal(getOcrHoldCount(), 0)
    assert.ok(listRetentionActions().some((action) => action.action === 'job.run'))
  })

  it('pushes a case (and its fragments) out per-target, capped at 3650 days', () => {
    const session = createTestSession()
    const before = getSessionRetentionTargets(session.id).find((target) => target.category === 'patient-sessions')!

    const extended = extendSessionRetention({ sessionId: session.id, days: 2000 }, CERT)
    const after = getSessionRetentionTargets(session.id).find((target) => target.category === 'patient-sessions')!
    assert.ok(Date.parse(after.expiresAt) > Date.parse(before.expiresAt))
    assert.ok(extended.categories.includes('patient-sessions'))
    assert.ok(extended.categories.includes('triage-notes'))

    assert.throws(() => extendSessionRetention({ sessionId: session.id, days: 5000 }, CERT), /1\.\.3650/)
    clearRetentionOverrides()
  })

  it('anonymises note content in place while keeping the record', () => {
    const session = createTestSession()
    assert.equal(RETENTION_HANDLERS['triage-notes'].anonymise!(session.id), true)
    const after = getSession(session.id)!
    assert.deepEqual(after.note!.structuredNote, { chiefComplaint: '', history: '', vitals: '' })
    assert.equal(after.note!.followUpQuestions.length, 0)
    assert.equal(after.overrides.length, 0)
    assert.ok(after.note, 'the record shape is kept in anonymise mode')
  })

  it('erases a case, wipes its fragments and writes one tombstone', () => {
    const session = createTestSession()
    const erased = eraseSessionData(session.id, { name: 'Doctor D', role: 'doctor' }, 'Unit-test erasure.')

    assert.ok(erased.wiped.includes('triage-notes'))
    assert.equal(getSession(session.id), undefined, 'a soft-deleted case is hidden everywhere')
    assert.equal(getSessionIncludingDeleted(session.id)?.note, null)
    assert.ok(listTombstones().some((tombstone) => tombstone.sessionId === session.id && tombstone.scope === 'session'))
    assert.throws(() => eraseSessionData(session.id, { name: 'Doctor D', role: 'doctor' }, 'again'), /already been deleted/)
  })

  it('reports a full status inventory (one row per category)', () => {
    const status = getRetentionStatus()
    assert.equal(status.length, 23)
    assert.equal(new Set(status.map((row) => row.category)).size, 23)
    assert.ok(status.every((row) => row.total >= row.eligible))
  })

  it('sweeps due demo data, wiping fields and hiding the seeded cases', () => {
    clearSessions()
    seedSessions({ id: 'usr-seed', displayName: 'Seeder' })
    const seeded = listSeededSessionIds()
    assert.equal(seeded.length, 2)

    process.env.RETENTION_DEMO_DATA_DAYS = '0'
    resetRetentionPolicy()
    try {
      const result = runRetentionJob({ actor: CERT })
      assert.equal(rowFor(result, 'demo-data')?.deleted, 2)
      for (const id of seeded) {
        assert.equal(getSession(id), undefined)
        assert.ok(getSessionIncludingDeleted(id)?.deletedAt)
        assert.equal(getSessionIncludingDeleted(id)?.note, null)
        assert.ok(listTombstones().some((tombstone) => tombstone.sessionId === id))
      }
    } finally {
      delete process.env.RETENTION_DEMO_DATA_DAYS
      resetRetentionPolicy()
    }
  })

  it('runs an anonymise-mode sweep without throwing and reports the mode', () => {
    const result = runRetentionJob({ actor: CERT, mode: 'anonymise' })
    assert.equal(result.mode, 'anonymise')
    assert.equal(result.byCategory.length, 23)
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP API                                                           */
/* ------------------------------------------------------------------ */

describe('retention API (HTTP)', () => {
  let server: Server
  let base = ''

  function resetRetentionData(): void {
    clearAudit()
    clearSessions()
    clearStoredImages()
    clearTombstones()
    clearOcrHolds()
    clearRetentionActions()
    clearRetentionOverrides()
    resetRetentionPolicy()
  }

  before(async () => {
    seedUsers()
    resetRetentionData()
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

  async function createSessionFor(token: string, text = 'Fever since two days, no vomiting.'): Promise<Record<string, unknown>> {
    const res = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, consentAcknowledged: true, language: 'English' }),
    })
    const body = await res.text()
    assert.equal(res.status, 201, body)
    return JSON.parse(body) as Record<string, unknown>
  }

  interface ApiResult {
    status: number
    body: Record<string, unknown>
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

  it('requires an authenticated session for retention routes', async () => {
    const res = await fetch(`${base}/api/retention/policy`)
    assert.equal(res.status, 401)
  })

  it('records consent at intake and links the retention policy', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const created = await createSessionFor(nurse)
    const session = created.session as Record<string, unknown>
    assert.ok(session.consentRecordId, 'the session response carries its consent id')
    assert.ok(session.consentRecord, 'the session response carries its hydrated consent record')

    const { status, body } = await api(nurse, 'GET', `/api/sessions/${session.id}/consent`)
    assert.equal(status, 200)
    const consent = body.consent as Record<string, unknown>
    assert.equal(consent.policyVersion, 'v1.0-2026')
    assert.equal(consent.grantedBy, 'R. Sharma')
    assert.equal(consent.revokedAt, undefined)
    assert.equal((consent.purposes as string[]).length, 3)
  })

  it('builds a portable export and reads the stored copy back', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const created = await createSessionFor(nurse)
    const sessionId = (created.session as { id: string }).id

    const forbidden = await api(nurse, 'POST', `/api/sessions/${sessionId}/retention/export`)
    assert.equal(forbidden.status, 403)

    const exported = await api(doctor, 'POST', `/api/sessions/${sessionId}/retention/export`)
    assert.equal(exported.status, 201)
    const payload = exported.body.export as { exportId: string; sections: Array<{ category: string; items: unknown[] }> }
    assert.ok(payload.exportId.startsWith('exp-'))
    assert.ok(payload.sections.some((section) => section.category === 'patient-sessions'))
    assert.ok(payload.sections.some((section) => section.category === 'consent-records'))

    const fetched = await api(doctor, 'GET', `/api/retention/exports/${payload.exportId}`)
    assert.equal(fetched.status, 200)
    assert.equal((fetched.body.export as { exportId: string }).exportId, payload.exportId)
  })

  it('revokes consent once, erases the case and keeps the proof', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const admin = await login('admin', 'Admin@123')
    const created = await createSessionFor(nurse)
    const sessionId = (created.session as { id: string }).id

    const revoked = await api(nurse, 'POST', `/api/sessions/${sessionId}/consent/revoke`, { reason: 'Patient asked to withdraw.' })
    assert.equal(revoked.status, 200)
    const consent = revoked.body.consent as Record<string, unknown>
    assert.ok(consent.revokedAt)
    assert.equal(consent.revokedByRole, 'nurse')

    // A withdrawn case is hidden immediately, so a second revocation reaches a
    // 404 exactly like any other deleted case (the consent proof is still kept).
    const again = await api(nurse, 'POST', `/api/sessions/${sessionId}/consent/revoke`)
    assert.equal(again.status, 404)

    const gone = await api(nurse, 'GET', `/api/sessions/${sessionId}`)
    assert.equal(gone.status, 404, 'the withdrawn case is hidden')

    const tombstones = await api(admin, 'GET', '/api/retention/tombstones')
    assert.equal(tombstones.status, 200)
    const rows = tombstones.body.tombstones as Array<{ sessionId?: string; scope: string }>
    assert.ok(rows.some((row) => row.sessionId === sessionId && row.scope === 'consent'))
    assert.ok(rows.some((row) => row.sessionId === sessionId && row.scope === 'session'))
  })

  it('manually deletes a case with a tombstone and an audit trail', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const created = await createSessionFor(nurse)
    const sessionId = (created.session as { id: string }).id

    const deleted = await api(doctor, 'POST', `/api/sessions/${sessionId}/retention/delete`, { reason: 'Duplicate intake.' })
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body.deleted, true)

    const gone = await api(doctor, 'GET', `/api/sessions/${sessionId}`)
    assert.equal(gone.status, 404)
    assert.ok(listAudit(sessionId).some((entry) => entry.action === 'session.deleted'), 'audit survives the erased session')
  })

  it('enforces retention RBAC across roles', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const admin = await login('admin', 'Admin@123')
    const patient = await login('patient', 'Patient@123')

    // Policy: doctors read, admins edit.
    assert.equal((await api(nurse, 'GET', '/api/retention/policy')).status, 403)
    assert.equal((await api(doctor, 'GET', '/api/retention/policy')).status, 200)
    assert.equal((await api(doctor, 'PUT', '/api/retention/policy', { rules: [{ category: 'reports', retentionDays: 1200 }] })).status, 403)

    const edited = await api(admin, 'PUT', '/api/retention/policy', { rules: [{ category: 'reports', retentionDays: 1200 }] })
    assert.equal(edited.status, 200)
    const policy = edited.body.policy as { rules: Array<{ category: string; retentionDays: number }> }
    assert.equal(policy.rules.find((rule) => rule.category === 'reports')!.retentionDays, 1200)

    // Status + tombstones are admin-only; actions are doctor+admin.
    assert.equal((await api(admin, 'GET', '/api/retention/status')).status, 200)
    assert.equal((await api(doctor, 'GET', '/api/retention/status')).status, 403)
    assert.equal((await api(doctor, 'GET', '/api/retention/tombstones')).status, 403)
    assert.equal((await api(admin, 'GET', '/api/retention/tombstones')).status, 200)
    assert.equal((await api(doctor, 'GET', '/api/retention/actions')).status, 200)
    assert.equal((await api(patient, 'GET', '/api/retention/actions')).status, 403)

    // Only an admin can run the sweep.
    assert.equal((await api(doctor, 'POST', '/api/retention/run')).status, 403)
    const ran = await api(admin, 'POST', '/api/retention/run', { mode: 'delete' })
    assert.equal(ran.status, 200)
    assert.equal((ran.body.result as { byCategory: unknown[] }).byCategory.length, 23)

    resetRetentionPolicy()
  })

  it('lets only an admin extend a case retention', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const admin = await login('admin', 'Admin@123')
    const created = await createSessionFor(nurse)
    const sessionId = (created.session as { id: string }).id

    assert.equal((await api(doctor, 'POST', `/api/sessions/${sessionId}/retention/extend`, { days: 30 })).status, 403)
    const extended = await api(admin, 'POST', `/api/sessions/${sessionId}/retention/extend`, { days: 2000 })
    assert.equal(extended.status, 200)
    assert.ok((extended.body.categories as string[]).includes('patient-sessions'))
  })
})
