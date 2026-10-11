import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { createUser, seedUsers } from '../src/services/authStore'
import { createApp } from '../src/app'
import { clearConsentEvents, getConsentCoverage, listConsentEventsForSession } from '../src/services/consentRetentionService'
import { clearRetentionActions } from '../src/services/retentionService'
import { clearRetentionOverrides, resetRetentionPolicy } from '../src/services/retentionConfig'
import { clearStoredImages } from '../src/services/imageStore'
import { clearSessions } from '../src/services/sessionStore'
import { clearTombstones, listTombstones } from '../src/services/tombstoneStore'

/* ------------------------------------------------------------------ */
/*  HTTP fixtures                                                      */
/* ------------------------------------------------------------------ */

describe('consent lifecycle API (P2-17)', () => {
  let server: Server
  let base = ''

  before(() => {
    clearSessions()
    clearStoredImages()
    clearTombstones()
    clearAudit()
    clearConsentEvents()
    clearRetentionActions()
    clearRetentionOverrides()
    resetRetentionPolicy()
    seedUsers()
    try {
      createUser({ username: 'facadmin', displayName: 'F. Admin', password: 'FacAdmin@123', role: 'facility-admin' })
    } catch {
      /* already created */
    }
    server = createApp().listen(0)
    const address = server.address()
    if (address && typeof address === 'object') base = `http://127.0.0.1:${address.port}`
  })

  after(() => {
    server.close()
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

  async function createSessionAs(token: string): Promise<string> {
    const res = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: 'Fever since two days, no vomiting.', consentAcknowledged: true, language: 'English' }),
    })
    const body = await res.text()
    assert.equal(res.status, 201, body)
    return (JSON.parse(body) as { session: { id: string } }).session.id
  }

  it('requires authentication', async () => {
    const res = await fetch(`${base}/api/consent/versions`)
    assert.equal(res.status, 401)
  })

  it('records a granted event and a readable history', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)

    const history = await api(patient, 'GET', `/api/consent/sessions/${sessionId}/history`)
    assert.equal(history.status, 200)
    const entries = history.body.history as Array<{ kind: string }>
    assert.ok(entries.some((entry) => entry.kind === 'granted'))
  })

  it('previews the withdrawal impact with retained proof categories', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)

    const impact = await api(patient, 'GET', `/api/consent/sessions/${sessionId}/impact`)
    assert.equal(impact.status, 200)
    const preview = impact.body.preview as { willWipe: string[]; willRetain: string[]; categories: unknown[] }
    assert.ok(preview.willWipe.includes('patient-sessions'))
    assert.ok(preview.willRetain.includes('consent-records'))
    assert.ok(preview.willRetain.includes('tombstones'))
    assert.ok(preview.categories.length > 0)
  })

  it('rejects an unknown withdrawal reason code', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)
    const res = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/revoke`, { reasonCode: 'because' })
    assert.equal(res.status, 400)
  })

  it('lets only the patient withdraw (staff get 403)', async () => {
    const patient = await login('patient', 'Patient@123')
    const nurse = await login('nurse', 'Nurse@123')
    const sessionId = await createSessionAs(patient)
    const res = await api(nurse, 'POST', `/api/consent/sessions/${sessionId}/revoke`, { reasonCode: 'other' })
    assert.equal(res.status, 403)
  })

  it('withdraws consent: erases the case, keeps proof, and is idempotent', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)

    const withdrawn = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/revoke`, {
      reasonCode: 'privacy-concern',
      reasonText: 'Please remove my details.',
    })
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body))
    const result = withdrawn.body.result as { consent: { revokedAt?: string; withdrawalReasonCode?: string }; wiped: string[] }
    assert.ok(result.consent.revokedAt)
    assert.equal(result.consent.withdrawalReasonCode, 'privacy-concern')
    assert.ok(result.wiped.includes('triage-notes'))

    const gone = await api(patient, 'GET', `/api/sessions/${sessionId}`)
    assert.equal(gone.status, 404)

    assert.ok(listTombstones().some((row) => row.sessionId === sessionId && row.scope === 'consent'))

    // Idempotent: a repeat does not erase again and returns the existing record.
    const again = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/revoke`, { reasonCode: 'other' })
    assert.equal(again.status, 200)
    assert.equal((again.body.result as { wiped: string[] }).wiped.length, 0)
  })

  it('re-grants a withdrawn consent and refuses when already active', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)

    const early = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/re-grant`)
    assert.equal(early.status, 409)

    await api(patient, 'POST', `/api/consent/sessions/${sessionId}/revoke`, { reasonCode: 'moved-facility' })
    const reGranted = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/re-grant`)
    assert.equal(reGranted.status, 200, JSON.stringify(reGranted.body))
    const consent = reGranted.body.consent as { revokedAt?: string }
    assert.equal(consent.revokedAt, undefined)
  })

  it('upgrades consent to the current policy version once', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)

    // Already current → conflict.
    const already = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/upgrade-version`)
    assert.equal(already.status, 409)
  })

  it('generates and downloads a consent receipt (json + pdf)', async () => {
    const patient = await login('patient', 'Patient@123')
    const sessionId = await createSessionAs(patient)

    const generated = await api(patient, 'POST', `/api/consent/sessions/${sessionId}/receipt`)
    assert.equal(generated.status, 201)
    const ref = (generated.body.receipt as { ref: string }).ref
    assert.ok(ref.startsWith('cr-'))

    const json = await fetch(`${base}/api/consent/receipt/${ref}?format=json`, {
      headers: { authorization: `Bearer ${patient}` },
    })
    assert.equal(json.status, 200)
    const receipt = (await json.json()) as { ref: string; disclaimer: string }
    assert.equal(receipt.ref, ref)
    assert.ok(receipt.disclaimer.length > 10)

    const pdf = await fetch(`${base}/api/consent/receipt/${ref}?format=pdf`, {
      headers: { authorization: `Bearer ${patient}` },
    })
    assert.equal(pdf.status, 200)
    assert.match(pdf.headers.get('content-type') ?? '', /application\/pdf/)
  })

  it('exposes facility coverage to a facility-admin only', async () => {
    const patient = await login('patient', 'Patient@123')
    await createSessionAs(patient)
    const facAdmin = await login('facadmin', 'FacAdmin@123')
    const doctor = await login('doctor', 'Doctor@123')

    assert.equal((await api(doctor, 'GET', '/api/consent/facility/coverage')).status, 403)
    const coverage = await api(facAdmin, 'GET', '/api/consent/facility/coverage')
    assert.equal(coverage.status, 200)
    const rows = (coverage.body.coverage as { rows: unknown[] }).rows
    assert.ok(rows.length > 0)
  })

  it('lists the caller\'s own consent records for a patient', async () => {
    const patient = await login('patient', 'Patient@123')
    const mine = await api(patient, 'GET', '/api/consent/me')
    assert.equal(mine.status, 200)
    assert.ok(Array.isArray(mine.body.consent))
  })

  it('surfaces service-level coverage and events', () => {
    const coverage = getConsentCoverage('facility-default')
    assert.ok(coverage.total >= 0)
    assert.equal(typeof coverage.granted, 'number')
    const someSession = listAudit().find((entry) => entry.action === 'consent.granted')
    assert.ok(someSession)
    assert.ok(listConsentEventsForSession(someSession!.sessionId).length > 0)
  })
})
