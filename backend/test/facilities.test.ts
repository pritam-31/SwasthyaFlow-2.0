import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { clearFacilities, seedDefaultFacility } from '../src/services/facilityService'
import { clearSessions } from '../src/services/sessionStore'
import { DEFAULT_FACILITY_ID } from '../src/types/facility.types'

interface HttpResult {
  status: number
  body: Record<string, unknown>
}

describe('facility multi-tenancy API (HTTP)', () => {
  let server: Server
  let base = ''
  let admin = ''
  let nurse = ''
  let facA = ''
  let facB = ''
  let facANurse = ''
  let facAdmin = ''

  before(async () => {
    seedUsers()
    clearAudit()
    clearSessions()
    clearFacilities()
    seedDefaultFacility()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    admin = await login('admin', 'Admin@123')
    nurse = await login('nurse', 'Nurse@123')
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

  it('shows the default facility to an ordinary user and all facilities to a system-admin', async () => {
    const own = await request('GET', '/api/facilities', undefined, nurse)
    assert.equal(own.status, 200)
    const facilities = own.body.facilities as Array<{ id: string }>
    assert.equal(facilities.length, 1)
    assert.equal(facilities[0].id, DEFAULT_FACILITY_ID)

    const all = await request('GET', '/api/facilities', undefined, admin)
    assert.equal(all.status, 200)
    assert.ok((all.body.facilities as unknown[]).length >= 1)
  })

  it('lets a system-admin create facilities and rejects invalid types', async () => {
    const bad = await request('POST', '/api/facilities', { name: 'X', type: 'spaceship' }, admin)
    assert.equal(bad.status, 400)

    const a = await request('POST', '/api/facilities', { name: 'Camp A', type: 'health-camp' }, admin)
    assert.equal(a.status, 201)
    facA = String((a.body.facility as { id: string }).id)

    const b = await request('POST', '/api/facilities', { name: 'PHC B', type: 'phc' }, admin)
    assert.equal(b.status, 201)
    facB = String((b.body.facility as { id: string }).id)

    assert.notEqual(facA, facB)
  })

  it('forbids non-system-admins from creating facilities', async () => {
    const res = await request('POST', '/api/facilities', { name: 'No', type: 'phc' }, nurse)
    assert.equal(res.status, 403)
  })

  it('provisions a facility-admin and a nurse scoped to facility A', async () => {
    const adminUser = await request(
      'POST',
      `/api/facilities/${facA}/users`,
      { username: 'fadmin-a', displayName: 'F Admin', password: 'FacAdmin@123', role: 'facility-admin' },
      admin,
    )
    assert.equal(adminUser.status, 201)

    const nurseUser = await request(
      'POST',
      `/api/facilities/${facA}/users`,
      { username: 'fnurse-a', displayName: 'F Nurse', password: 'FacNurse@123', role: 'nurse' },
      admin,
    )
    assert.equal(nurseUser.status, 201)
    assert.equal((nurseUser.body.user as { facilityId: string }).facilityId, facA)
    facANurse = await login('fnurse-a', 'FacNurse@123')
    facAdmin = await login('fadmin-a', 'FacAdmin@123')
  })

  it('scopes user management to the facility-admin own facility', async () => {
    const scoped = await request('GET', '/api/auth/users', undefined, facAdmin)
    assert.equal(scoped.status, 200)
    const users = scoped.body.users as Array<{ facilityId: string }>
    assert.ok(users.length >= 1)
    assert.ok(users.every((u) => u.facilityId === facA))

    // A facility-admin may not mint a system-admin.
    const escalate = await request(
      'POST',
      '/api/auth/users',
      { username: 'nope-a', displayName: 'No', password: 'Nope@1234', role: 'system-admin' },
      facAdmin,
    )
    assert.equal(escalate.status, 400)

    // Created staff inherit the facility-admin's facility.
    const created = await request(
      'POST',
      '/api/auth/users',
      { username: 'fnurse-a2', displayName: 'F Nurse 2', password: 'FacNurse@123', role: 'nurse' },
      facAdmin,
    )
    assert.equal(created.status, 201)
    assert.equal((created.body.user as { facilityId: string }).facilityId, facA)

    // Cross-facility targets are invisible (404), never 403.
    const all = await request('GET', '/api/auth/users', undefined, admin)
    const outsider = (all.body.users as Array<{ id: string; facilityId: string; username: string }>).find(
      (u) => u.facilityId !== facA && u.username !== 'admin',
    )
    if (outsider) {
      const denied = await request('DELETE', `/api/auth/users/${outsider.id}`, undefined, facAdmin)
      assert.equal(denied.status, 404)
    }
  })

  it('scopes sessions to the facility that created them', async () => {
    const created = await request(
      'POST',
      '/api/sessions',
      { text: 'Fever for two days.', language: 'English', consentAcknowledged: true },
      facANurse,
    )
    assert.equal(created.status, 201)
    const sessionId = String((created.body.session as { id: string }).id)
    assert.equal((created.body.session as { facilityId: string }).facilityId, facA)

    // The facility-A nurse sees it; a default-facility nurse does not.
    const aList = await request('GET', '/api/sessions', undefined, facANurse)
    assert.ok((aList.body.sessions as unknown[]).some((s) => (s as { id: string }).id === sessionId))
    const defaultList = await request('GET', '/api/sessions', undefined, nurse)
    assert.ok(!(defaultList.body.sessions as unknown[]).some((s) => (s as { id: string }).id === sessionId))

    // Cross-facility read resolves to 404, never 403.
    const denied = await request('GET', `/api/sessions/${sessionId}`, undefined, nurse)
    assert.equal(denied.status, 404)
    const allowed = await request('GET', `/api/sessions/${sessionId}`, undefined, facANurse)
    assert.equal(allowed.status, 200)
  })

  it('lets a system-admin switch scope with the X-Facility-Id header', async () => {
    const scoped = await request('GET', '/api/sessions', undefined, admin, { 'x-facility-id': facA })
    assert.equal(scoped.status, 200)
    const list = scoped.body.sessions as Array<{ facilityId: string }>
    assert.ok(list.length >= 1)
    assert.ok(list.every((s) => s.facilityId === facA))

    const badHeader = await request('GET', '/api/sessions', undefined, admin, { 'x-facility-id': 'no-such-facility' })
    assert.equal(badHeader.status, 404)
  })

  it('ignores the X-Facility-Id header for non-system-admins', async () => {
    const res = await request('GET', '/api/sessions', undefined, nurse, { 'x-facility-id': facA })
    assert.equal(res.status, 200)
    // Still the default facility — the header cannot lift a nurse into facility A.
    const list = res.body.sessions as Array<{ facilityId: string }>
    assert.ok(list.every((s) => s.facilityId !== facA))
  })

  it('reports facility stats and suspends / archives facilities', async () => {
    const stats = await request('GET', `/api/facilities/${facA}/stats`, undefined, admin)
    assert.equal(stats.status, 200)
    assert.ok((stats.body.stats as { sessions: number }).sessions >= 1)

    const suspend = await request('POST', `/api/facilities/${facB}/suspend`, undefined, admin)
    assert.equal(suspend.status, 200)
    assert.equal((suspend.body.facility as { status: string }).status, 'suspended')

    const archive = await request('POST', `/api/facilities/${facB}/archive`, undefined, admin)
    assert.equal(archive.status, 200)
    assert.equal((archive.body.facility as { status: string }).status, 'archived')

    // An archived facility is read-only.
    const edit = await request('PATCH', `/api/facilities/${facB}`, { name: 'Nope' }, admin)
    assert.equal(edit.status, 409)
  })

  it('prevents deleting the default facility', async () => {
    const res = await request('DELETE', `/api/facilities/${DEFAULT_FACILITY_ID}`, undefined, admin)
    assert.equal(res.status, 409)
  })
})
