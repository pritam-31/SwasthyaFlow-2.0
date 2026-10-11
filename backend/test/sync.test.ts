import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { isIdempotentRoute } from '../src/middleware/idempotency'
import { clearAudit, listAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import {
  clearIdempotencyMemory,
  deleteExpired,
  get as getIdempotency,
  hashPayload,
  put as putIdempotency,
} from '../src/services/idempotencyService'
import { clearSessions, getSession } from '../src/services/sessionStore'
import type { QueuedItem } from '../src/types'

interface ApiResult {
  status: number
  body: Record<string, unknown>
}

function queued(partial: Partial<QueuedItem> & Pick<QueuedItem, 'actionType' | 'sessionId' | 'payload'>): QueuedItem {
  return {
    id: partial.id ?? randomUUID(),
    actionType: partial.actionType,
    endpoint: partial.endpoint ?? '/api/sessions',
    method: partial.method ?? 'POST',
    payload: partial.payload,
    sessionId: partial.sessionId,
    actorId: partial.actorId ?? 'actor',
    actorRole: partial.actorRole ?? 'nurse',
    createdAt: partial.createdAt ?? new Date().toISOString(),
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    status: 'pending',
    idempotencyKey: partial.idempotencyKey ?? randomUUID(),
    dependencies: partial.dependencies ?? [],
    conflictInfo: null,
  }
}

describe('sync + idempotency API (HTTP)', () => {
  let server: Server
  let base = ''
  let nurse = ''
  let doctor = ''

  before(async () => {
    seedUsers()
    clearAudit()
    clearSessions()
    clearIdempotencyMemory()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    nurse = await login('nurse', 'Nurse@123')
    doctor = await login('doctor', 'Doctor@123')
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

  async function api(
    token: string,
    method: string,
    path: string,
    payload?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): Promise<ApiResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  async function createSession(token: string): Promise<Record<string, unknown>> {
    const res = await api(token, 'POST', '/api/sessions', {
      text: 'Fever for two days with cough.',
      language: 'English',
      consentAcknowledged: true,
    })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return res.body.session as Record<string, unknown>
  }

  async function batch(token: string, items: QueuedItem[]): Promise<ApiResult> {
    return api(token, 'POST', '/api/sync/batch', { items })
  }

  /* ---------------- idempotency ---------------- */

  it('classifies only the allowlisted routes as idempotent', () => {
    assert.equal(isIdempotentRoute('POST', '/api/sessions'), true)
    assert.equal(isIdempotentRoute('PATCH', '/api/sessions/abc/note'), true)
    assert.equal(isIdempotentRoute('POST', '/api/sessions/abc/consent/revoke'), true)
    assert.equal(isIdempotentRoute('POST', '/api/audit'), true)
    assert.equal(isIdempotentRoute('GET', '/api/sessions'), false)
    assert.equal(isIdempotentRoute('POST', '/api/triage/analyze'), false)
  })

  it('executes a fresh key, replays the stored response, and rejects a changed payload', async () => {
    const key = randomUUID()
    const body = { text: 'Headache for one day.', language: 'English', consentAcknowledged: true }
    const first = await api(nurse, 'POST', '/api/sessions', body, { 'Idempotency-Key': key })
    assert.equal(first.status, 201)
    const firstId = (first.body.session as Record<string, unknown>).id

    const replay = await api(nurse, 'POST', '/api/sessions', body, { 'Idempotency-Key': key })
    assert.equal(replay.status, 201)
    assert.equal((replay.body.session as Record<string, unknown>).id, firstId)

    const changed = await api(
      nurse,
      'POST',
      '/api/sessions',
      { text: 'A different narrative entirely.', language: 'English', consentAcknowledged: true },
      { 'Idempotency-Key': key },
    )
    assert.equal(changed.status, 409)
    assert.equal(changed.body.error, 'Idempotency key reused with different payload.')
  })

  it('stores a payload hash with a 24 h TTL and never the payload', async () => {
    const key = randomUUID()
    await putIdempotency(key, hashPayload({ secret: 'x' }), 201, { ok: true })
    const record = await getIdempotency(key)
    assert.ok(record)
    const ttlHours = (Date.parse(record.expiresAt) - Date.parse(record.createdAt)) / 3_600_000
    assert.ok(Math.abs(ttlHours - 24) < 0.01)
    assert.match(record.payloadHash, /^[0-9a-f]{64}$/)
    assert.equal(await deleteExpired(), 0)
  })

  it('hashes identical payloads identically regardless of key order', () => {
    assert.equal(hashPayload({ a: 1, b: 2 }), hashPayload({ b: 2, a: 1 }))
    assert.notEqual(hashPayload({ a: 1 }), hashPayload({ a: 2 }))
  })

  /* ---------------- batch validation ---------------- */

  it('rejects a malformed batch and an oversized batch', async () => {
    const malformed = await api(nurse, 'POST', '/api/sync/batch', { nope: true })
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.error, 'Malformed batch')

    const tooLarge = await batch(nurse, Array.from({ length: 101 }, () => queued({ actionType: 'audit.log', sessionId: 'sync', payload: { action: 'x', detail: 'y' } })))
    assert.equal(tooLarge.status, 400)
    assert.equal(tooLarge.body.error, 'Batch too large')
  })

  /* ---------------- batch processing ---------------- */

  it('processes items in dependency order', async () => {
    const depId = randomUUID()
    const dependentId = randomUUID()
    const dependent = queued({ id: dependentId, actionType: 'audit.log', sessionId: 'sync', payload: { action: 'second', detail: 'second item' }, dependencies: [depId] })
    const dependency = queued({ id: depId, actionType: 'audit.log', sessionId: 'sync', payload: { action: 'first', detail: 'first item' } })
    // Deliberately out of order — the server must resolve the dependency first.
    const res = await batch(nurse, [dependent, dependency])
    assert.equal(res.status, 200)
    const results = res.body.results as Array<{ id: string; status: string }>
    assert.equal(results.find((r) => r.id === depId)?.status, 'synced')
    assert.equal(results.find((r) => r.id === dependentId)?.status, 'synced')
  })

  it('marks dependents failed when the dependency fails', async () => {
    const depId = randomUUID()
    const dependentId = randomUUID()
    const dependency = queued({ id: depId, actionType: 'audit.log', sessionId: 'sync', payload: {} })
    const dependent = queued({ id: dependentId, actionType: 'audit.log', sessionId: 'sync', payload: { action: 'a', detail: 'b' }, dependencies: [depId] })
    const res = await batch(nurse, [dependency, dependent])
    const results = res.body.results as Array<{ id: string; status: string; error?: string }>
    assert.equal(results.find((r) => r.id === depId)?.error, 'validation-failed')
    assert.equal(results.find((r) => r.id === dependentId)?.error, 'dependency-failed')
  })

  it('rejects unknown action types and reports validation fields', async () => {
    const session = await createSession(nurse)
    const unknown = queued({ actionType: 'totally.bogus' as QueuedItem['actionType'], sessionId: session.id as string, payload: {} })
    const invalid = queued({ actionType: 'followup.add', sessionId: session.id as string, payload: { text: '' } })
    const res = await batch(nurse, [unknown, invalid])
    const results = res.body.results as Array<{ id: string; status: string; error?: string; fields?: string[] }>
    assert.equal(results.find((r) => r.id === unknown.id)?.error, 'unknown-action')
    const invalidResult = results.find((r) => r.id === invalid.id)
    assert.equal(invalidResult?.error, 'validation-failed')
    assert.deepEqual(invalidResult?.fields, ['text'])
  })

  it('re-checks RBAC from the session, not the payload, at sync time', async () => {
    const session = await createSession(nurse)
    const item = queued({
      actionType: 'note.finalize',
      sessionId: session.id as string,
      actorRole: 'doctor',
      payload: {},
    })
    const res = await batch(nurse, [item])
    const results = res.body.results as Array<{ id: string; status: string; error?: string }>
    assert.equal(results[0].error, 'forbidden')
  })

  it('detects a stale write as a structured conflict and never auto-resolves it', async () => {
    const session = await createSession(nurse)
    const stale = session.updatedAt as string
    // Move the server copy on.
    const edited = await api(nurse, 'PATCH', `/api/sessions/${session.id}/note`, {
      structuredNote: { chiefComplaint: 'Changed on server', history: 'Changed', vitals: 'Changed' },
    })
    assert.equal(edited.status, 200)

    const item = queued({
      actionType: 'note.edit',
      sessionId: session.id as string,
      method: 'PATCH',
      payload: {
        structuredNote: { chiefComplaint: 'Changed offline', history: 'x', vitals: 'y' },
        baseUpdatedAt: stale,
      },
    })
    const res = await batch(nurse, [item])
    const result = (res.body.results as Array<{ status: string; conflict?: { conflict: boolean; fields: unknown[] } }>)[0]
    assert.equal(result.status, 'conflict')
    assert.equal(result.conflict?.conflict, true)
    assert.ok((result.conflict?.fields.length ?? 0) > 0)
  })

  it('takes the actor and role from the login session and stamps offline origin on audit', async () => {
    const session = await createSession(doctor)
    const item = queued({
      actionType: 'timeline.add',
      sessionId: session.id as string,
      actorRole: 'patient',
      payload: { eventText: 'Started feeling unwell yesterday.', eventType: 'clinician-note' },
    })
    const res = await batch(doctor, [item])
    const result = (res.body.results as Array<{ status: string }>)[0]
    assert.equal(result.status, 'synced')

    const synced = listAudit(session.id as string).find((e) => e.action === 'offline.synced')
    assert.ok(synced, 'expected an offline.synced audit entry')
    assert.equal(synced?.role, 'doctor')
    assert.equal(synced?.offlineOrigin, true)
    assert.ok(typeof synced?.queuedAt === 'string')
    assert.ok(typeof synced?.syncedAt === 'string')

    const batchAudit = listAudit('sync').find((e) => e.action === 'sync.batch-processed')
    assert.ok(batchAudit, 'expected a batch summary audit entry')
  })

  it('never leaks raw PII in a batch response', async () => {
    const item = queued({
      actionType: 'intake.create-text',
      sessionId: '',
      payload: {
        text: 'My name is Ramesh Kumar and my phone is 9876543210.',
        language: 'English',
        consentAcknowledged: true,
      },
    })
    const res = await batch(nurse, [item])
    const serialised = JSON.stringify(res.body)
    assert.ok(!serialised.includes('Ramesh Kumar'))
    assert.ok(!serialised.includes('9876543210'))
  })

  /* ---------------- version ---------------- */

  it('exposes a server version that changes when state changes', async () => {
    const before1 = await api(nurse, 'GET', '/api/sync/version')
    assert.equal(before1.status, 200)
    assert.ok(typeof before1.body.serverVersion === 'string')
    await createSession(nurse)
    const after1 = await api(nurse, 'GET', '/api/sync/version')
    assert.notEqual(before1.body.serverVersion, after1.body.serverVersion)
  })

  it('reports the persisted session for a synced intake', async () => {
    const item = queued({
      actionType: 'intake.create-text',
      sessionId: '',
      payload: { text: 'Sore throat for three days.', language: 'English', consentAcknowledged: true },
    })
    const res = await batch(nurse, [item])
    const result = (res.body.results as Array<{ status: string; response?: { session?: { id: string } } }>)[0]
    assert.equal(result.status, 'synced')
    assert.ok(getSession(result.response?.session?.id as string))
  })
})
