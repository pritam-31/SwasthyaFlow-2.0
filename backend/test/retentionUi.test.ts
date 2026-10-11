import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit } from '../src/services/auditStore'
import { createUser, seedUsers } from '../src/services/authStore'
import { clearConsentEvents } from '../src/services/consentRetentionService'
import { clearStoredImages } from '../src/services/imageStore'
import { clearRetentionActions } from '../src/services/retentionService'
import { clearRetentionOverrides, resetRetentionPolicy } from '../src/services/retentionConfig'
import { clearSessions } from '../src/services/sessionStore'
import { clearTombstones } from '../src/services/tombstoneStore'

describe('data & privacy console API (P2-17)', () => {
  let server: Server
  let base = ''

  before(() => {
    clearSessions()
    clearStoredImages()
    clearTombstones()
    clearAudit()
    clearRetentionActions()
    clearRetentionOverrides()
    resetRetentionPolicy()
    clearConsentEvents()
    seedUsers()
    for (const account of [
      { username: 'facadmin', displayName: 'F. Admin', password: 'FacAdmin@123', role: 'facility-admin' as const },
      { username: 'sysadmin', displayName: 'S. Admin', password: 'SysAdmin@123', role: 'system-admin' as const },
    ]) {
      try {
        createUser(account)
      } catch {
        /* already created */
      }
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
      body: JSON.stringify({ text: 'Cough for three days.', consentAcknowledged: true, language: 'English' }),
    })
    const body = await res.text()
    assert.equal(res.status, 201, body)
    return (JSON.parse(body) as { session: { id: string } }).session.id
  }

  it('reports a per-case data inventory', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sessionId = await createSessionAs(nurse)

    const res = await api(nurse, 'GET', `/api/retention-ui/sessions/${sessionId}/inventory`)
    assert.equal(res.status, 200)
    const inventory = res.body.inventory as { rows: Array<{ category: string }>; totalRecords: number }
    assert.ok(inventory.rows.some((row) => row.category === 'patient-sessions'))
    assert.ok(inventory.totalRecords > 0)
  })

  it('merges a retention timeline including the consent grant', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const sessionId = await createSessionAs(nurse)
    const res = await api(nurse, 'GET', `/api/retention-ui/sessions/${sessionId}/timeline`)
    assert.equal(res.status, 200)
    const events = (res.body.timeline as { events: Array<{ kind: string }> }).events
    assert.ok(events.some((event) => event.kind === 'consent.granted'))
  })

  it('gates pending deletions, SLA and policy diff to a facility-admin', async () => {
    const doctor = await login('doctor', 'Doctor@123')
    const facAdmin = await login('facadmin', 'FacAdmin@123')

    assert.equal((await api(doctor, 'GET', '/api/retention-ui/facility/pending')).status, 403)
    assert.equal((await api(doctor, 'GET', '/api/retention-ui/facility/sla')).status, 403)
    assert.equal((await api(doctor, 'GET', '/api/retention-ui/facility/policy-diff')).status, 403)

    assert.equal((await api(facAdmin, 'GET', '/api/retention-ui/facility/pending')).status, 200)
    const sla = await api(facAdmin, 'GET', '/api/retention-ui/facility/sla')
    assert.equal(sla.status, 200)
    assert.ok(Array.isArray((sla.body.sla as { buckets: unknown[] }).buckets))
    const diff = await api(facAdmin, 'GET', '/api/retention-ui/facility/policy-diff')
    assert.equal(diff.status, 200)
    assert.equal((diff.body.diff as { changedCount: number }).changedCount, 0)
  })

  it('runs a bulk retention action for a facility-admin and refuses others', async () => {
    const nurse = await login('nurse', 'Nurse@123')
    const doctor = await login('doctor', 'Doctor@123')
    const facAdmin = await login('facadmin', 'FacAdmin@123')
    const first = await createSessionAs(nurse)
    const second = await createSessionAs(nurse)

    assert.equal((await api(doctor, 'POST', '/api/retention-ui/bulk', { action: 'run-now', category: 'all' })).status, 403)
    const res = await api(facAdmin, 'POST', '/api/retention-ui/bulk', {
      action: 'run-now',
      category: 'all',
      sessionIds: [first, second],
    })
    assert.equal(res.status, 200)
    const result = res.body.result as { affected: number }
    assert.equal(result.affected, 2)

    const gone = await api(nurse, 'GET', `/api/sessions/${first}`)
    assert.equal(gone.status, 404)
  })

  it('prunes the audit trail for a system-admin only, preserving the chain', async () => {
    const facAdmin = await login('facadmin', 'FacAdmin@123')
    const sysAdminToken = await login('sysadmin', 'SysAdmin@123')
    // system-admins are not seeded; createUser above added one.
    const before = new Date(Date.now() + 60_000).toISOString()

    assert.equal((await api(facAdmin, 'POST', '/api/retention-ui/prune-audit', { before })).status, 403)
    const res = await api(sysAdminToken, 'POST', '/api/retention-ui/prune-audit', { before })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const result = res.body.result as { chainIntact: boolean }
    assert.equal(result.chainIntact, true)
  })

  it('lists stored exports for a facility-admin', async () => {
    const facAdmin = await login('facadmin', 'FacAdmin@123')
    const res = await api(facAdmin, 'GET', '/api/retention-ui/facility/exports')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.exports))
  })
})
