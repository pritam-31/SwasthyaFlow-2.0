import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { listUsers, seedUsers, startSession } from '../src/services/authStore'
import { seedGlobalSecurityPolicy } from '../src/services/passwordPolicyService'
import { clearLockoutMemory } from '../src/services/lockoutService'
import { clearSecurityEventsMemory } from '../src/services/securityEventService'
import { clearRefreshTokensMemory } from '../src/services/refreshTokenService'
import { clearDevicesMemory } from '../src/services/deviceService'
import { clearIpBlocklistMemory } from '../src/services/ipBlocklistService'
import { seedDefaultFacility } from '../src/services/facilityService'

interface HttpResult {
  status: number
  body: Record<string, unknown>
  setCookies: string[]
  headers: Headers
}

function cookieValue(setCookies: string[], name: string): string | undefined {
  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? ''
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1)
  }
  return undefined
}

describe('security hardening API (HTTP)', () => {
  let server: Server
  let base = ''
  let admin = ''
  let nurse = ''

  before(async () => {
    seedUsers()
    seedDefaultFacility()
    clearSecurityEventsMemory()
    clearRefreshTokensMemory()
    clearDevicesMemory()
    clearIpBlocklistMemory()
    clearLockoutMemory()
    await seedGlobalSecurityPolicy()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    admin = await login('admin', 'Admin@123')
    nurse = await login('nurse', 'Nurse@123')
  })

  after(async () => {
    clearLockoutMemory()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function request(
    method: string,
    path: string,
    body?: unknown,
    options: { token?: string; cookie?: string; csrf?: string; headers?: Record<string, string> } = {},
  ): Promise<HttpResult> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
      ...(options.headers ?? {}),
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {}, setCookies, headers: res.headers }
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await request('POST', '/api/auth/login', { username, password })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return String(res.body.token)
  }

  it('sends hardened security headers and a request id on every response', async () => {
    const res = await request('GET', '/health')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.ok(res.headers.get('referrer-policy'))
    assert.ok(res.headers.get('x-request-id'))
  })

  it('issues httpOnly session + refresh cookies and a readable CSRF cookie on login', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'doctor', password: 'Doctor@123' })
    assert.equal(res.status, 200)
    assert.ok(typeof res.body.token === 'string' && res.body.token.length > 0)

    const sid = res.setCookies.find((c) => c.startsWith('swasthyaflow.sid='))
    const rt = res.setCookies.find((c) => c.startsWith('swasthyaflow.rt='))
    const csrf = res.setCookies.find((c) => c.startsWith('swasthyaflow.csrf='))
    assert.ok(sid && /httponly/i.test(sid), 'session cookie must be httpOnly')
    assert.ok(rt && /httponly/i.test(rt), 'refresh cookie must be httpOnly')
    assert.ok(csrf && !/httponly/i.test(csrf), 'CSRF cookie must be readable by the SPA')
    assert.ok(!sid?.includes('Domain=localhost'), 'session cookie must not be bound to localhost by default')
    assert.ok(!rt?.includes('Domain=localhost'), 'refresh cookie must not be bound to localhost by default')
  })

  it('authenticates protected APIs with the login cookies and keeps the session after refresh', async () => {
    const loggedIn = await request('POST', '/api/auth/login', { username: 'doctor', password: 'Doctor@123' })
    assert.equal(loggedIn.status, 200, JSON.stringify(loggedIn.body))
    const sid = cookieValue(loggedIn.setCookies, 'swasthyaflow.sid')
    const refresh = cookieValue(loggedIn.setCookies, 'swasthyaflow.rt')
    const csrf = cookieValue(loggedIn.setCookies, 'swasthyaflow.csrf')
    assert.ok(sid && refresh && csrf)
    const cookie = `swasthyaflow.sid=${sid}; swasthyaflow.rt=${refresh}; swasthyaflow.csrf=${csrf}`

    for (const path of ['/api/audit', '/api/facilities', '/api/facilities/facility-default', '/api/sessions']) {
      const result = await request('GET', path, undefined, { cookie })
      assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.body)}`)
    }

    const refreshed = await request('POST', '/api/auth/refresh', undefined, { cookie, csrf })
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body))
    assert.ok(Date.parse(String(refreshed.body.expiresAt)) > Date.parse(String(loggedIn.body.expiresAt)))
    const nextSid = cookieValue(refreshed.setCookies, 'swasthyaflow.sid')
    const nextRefresh = cookieValue(refreshed.setCookies, 'swasthyaflow.rt')
    assert.ok(nextSid && nextRefresh && nextRefresh !== refresh)

    const afterRefresh = await request(
      'GET',
      '/api/sessions',
      undefined,
      { cookie: `swasthyaflow.sid=${nextSid}; swasthyaflow.rt=${nextRefresh}; swasthyaflow.csrf=${csrf}` },
    )
    assert.equal(afterRefresh.status, 200, JSON.stringify(afterRefresh.body))
  })

  it('rejects protected APIs without a valid session and preserves role restrictions', async () => {
    const missing = await request('GET', '/api/sessions')
    assert.equal(missing.status, 401)
    const invalid = await request('GET', '/api/audit', undefined, { token: 'not-a-session-token' })
    assert.equal(invalid.status, 401)

    const patient = await login('patient', 'Patient@123')
    const forbidden = await request('GET', '/api/audit/paged', undefined, { token: patient })
    assert.equal(forbidden.status, 403)
    const permitted = await request('GET', '/api/audit/paged', undefined, { token: nurse })
    assert.equal(permitted.status, 200, JSON.stringify(permitted.body))
  })

  it('rejects expired access sessions even when a refresh token could remain valid', async () => {
    const user = listUsers().find((candidate) => candidate.username === 'nurse')
    assert.ok(user)
    const expired = startSession({ userId: user.id, ttlMs: -1 })
    const result = await request('GET', '/api/auth/me', undefined, { token: expired.token })
    assert.equal(result.status, 401)
  })

  it('enforces CSRF for cookie auth but exempts bearer auth', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'nurse', password: 'Nurse@123' })
    const sid = cookieValue(res.setCookies, 'swasthyaflow.sid')
    const csrf = cookieValue(res.setCookies, 'swasthyaflow.csrf')
    assert.ok(sid && csrf)
    const cookie = `swasthyaflow.sid=${sid}; swasthyaflow.csrf=${csrf}`

    const blocked = await request('POST', '/api/auth/logout', undefined, { cookie })
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body))

    const allowed = await request('POST', '/api/auth/logout', undefined, { cookie, csrf })
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body))

    // Bearer tokens are not sent automatically by the browser, so they are exempt.
    const bearer = await login('doctor', 'Doctor@123')
    const exempt = await request('POST', '/api/auth/logout', undefined, { token: bearer })
    assert.equal(exempt.status, 200, JSON.stringify(exempt.body))
  })

  it('keeps the legacy registration strength rule and rejects weak self-registration', async () => {
    const weak = await request('POST', '/api/auth/register', { username: 'weakuser', displayName: 'Weak User', password: 'abc' })
    assert.equal(weak.status, 400)
    assert.equal(weak.body.error, 'password must be at least 8 characters and contain a letter and a digit.')

    const ok = await request('POST', '/api/auth/register', { username: 'legacyuser', displayName: 'Legacy User', password: 'Passw0rd123' })
    assert.equal(ok.status, 201, JSON.stringify(ok.body))
    assert.equal((ok.body.user as { username: string }).username, 'legacyuser')
  })

  it('enforces the strict password policy on change-password', async () => {
    const reg = await request('POST', '/api/auth/register', { username: 'policyuser', displayName: 'Policy User', password: 'Passw0rd123' })
    assert.equal(reg.status, 201)
    const token = String(reg.body.token)

    const weak = await request('POST', '/api/auth/change-password', { currentPassword: 'Passw0rd123', newPassword: 'weak' }, { token })
    assert.equal(weak.status, 400)

    const strong = await request('POST', '/api/auth/change-password', { currentPassword: 'Passw0rd123', newPassword: 'Str0ng!Passphrase9' }, { token })
    assert.equal(strong.status, 200, JSON.stringify(strong.body))

    const relogin = await request('POST', '/api/auth/login', { username: 'policyuser', password: 'Str0ng!Passphrase9' })
    assert.equal(relogin.status, 200, JSON.stringify(relogin.body))
  })

  it('lists sessions, marks the current one and revokes another', async () => {
    const first = await login('patient', 'Patient@123')
    const second = await login('patient', 'Patient@123')

    const list = await request('GET', '/api/auth/sessions', undefined, { token: second })
    assert.equal(list.status, 200)
    const sessions = list.body.sessions as Array<{ id: string; current: boolean }>
    assert.ok(sessions.length >= 2)
    assert.equal(sessions.filter((s) => s.current).length, 1)

    const target = sessions.find((s) => !s.current)
    assert.ok(target)
    const removed = await request('DELETE', `/api/auth/sessions/${target.id}`, undefined, { token: second })
    assert.equal(removed.status, 200, JSON.stringify(removed.body))

    const dead = await request('GET', '/api/auth/me', undefined, { token: first })
    assert.equal(dead.status, 401)
  })

  it('lists bound devices for the signed-in user', async () => {
    const res = await request('GET', '/api/auth/devices', undefined, { token: nurse })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.devices))
    assert.ok((res.body.devices as unknown[]).length >= 1)
  })

  it('starts a TOTP enrolment with a QR image', async () => {
    const res = await request('POST', '/api/auth/2fa/setup', undefined, { token: admin })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(typeof res.body.otpauthUrl === 'string' && res.body.otpauthUrl.startsWith('otpauth://'))
    assert.ok(typeof res.body.qrDataUrl === 'string' && res.body.qrDataUrl.startsWith('data:image/'))
    assert.ok(typeof res.body.secret === 'string' && res.body.secret.length >= 16)
  })

  it('rotates refresh tokens and rejects reuse of a spent token', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'doctor', password: 'Doctor@123' })
    const oldRefresh = cookieValue(res.setCookies, 'swasthyaflow.rt')
    assert.ok(oldRefresh)

    const rotated = await request('POST', '/api/auth/refresh', undefined, { cookie: `swasthyaflow.rt=${oldRefresh}` })
    assert.equal(rotated.status, 200, JSON.stringify(rotated.body))
    const newRefresh = cookieValue(rotated.setCookies, 'swasthyaflow.rt')
    assert.ok(newRefresh && newRefresh !== oldRefresh)

    const reuse = await request('POST', '/api/auth/refresh', undefined, { cookie: `swasthyaflow.rt=${oldRefresh}` })
    assert.equal(reuse.status, 401, JSON.stringify(reuse.body))
  })

  it('rejects refresh tokens revoked during logout', async () => {
    const loggedIn = await request('POST', '/api/auth/login', { username: 'doctor', password: 'Doctor@123' })
    const sid = cookieValue(loggedIn.setCookies, 'swasthyaflow.sid')
    const refresh = cookieValue(loggedIn.setCookies, 'swasthyaflow.rt')
    const csrf = cookieValue(loggedIn.setCookies, 'swasthyaflow.csrf')
    assert.ok(sid && refresh && csrf)
    const cookie = `swasthyaflow.sid=${sid}; swasthyaflow.rt=${refresh}; swasthyaflow.csrf=${csrf}`

    const logout = await request('POST', '/api/auth/logout', undefined, { cookie, csrf })
    assert.equal(logout.status, 200, JSON.stringify(logout.body))
    const reused = await request('POST', '/api/auth/refresh', undefined, { cookie: `swasthyaflow.rt=${refresh}` })
    assert.equal(reused.status, 401, JSON.stringify(reused.body))
  })

  it('exposes the effective policy and records policy updates for an admin', async () => {
    const before = await request('GET', '/api/security/policy', undefined, { token: admin })
    assert.equal(before.status, 200)
    assert.equal((before.body.policy as { facilityId: string }).facilityId, 'global')

    const updated = await request('PUT', '/api/security/policy', { password: { minLength: 16 } }, { token: admin })
    assert.equal(updated.status, 200, JSON.stringify(updated.body))
    assert.equal((updated.body.policy as { password: { minLength: number } }).password.minLength, 16)

    const after = await request('GET', '/api/security/policy', undefined, { token: admin })
    assert.equal((after.body.policy as { password: { minLength: number } }).password.minLength, 16)
  })

  it('rejects security administration for a non-admin', async () => {
    const res = await request('GET', '/api/security/policy', undefined, { token: nurse })
    assert.equal(res.status, 403)
  })

  it('lists the security event trail', async () => {
    const res = await request('GET', '/api/security/events', undefined, { token: admin })
    assert.equal(res.status, 200)
    const events = res.body.events as Array<{ type: string }>
    assert.ok(events.some((event) => event.type === 'auth.login-success'))
  })

  it('adds, lists and removes an IP blocklist entry', async () => {
    const created = await request('POST', '/api/security/ip-blocklist', { ip: '203.0.113.9', reason: 'abuse test' }, { token: admin })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const entryId = String((created.body.entry as { entryId: string }).entryId)

    const listed = await request('GET', '/api/security/ip-blocklist', undefined, { token: admin })
    assert.ok((listed.body.entries as Array<{ entryId: string }>).some((entry) => entry.entryId === entryId))

    const removed = await request('DELETE', `/api/security/ip-blocklist/${entryId}`, undefined, { token: admin })
    assert.equal(removed.status, 200)

    const emptied = await request('GET', '/api/security/ip-blocklist', undefined, { token: admin })
    assert.ok(!(emptied.body.entries as Array<{ entryId: string }>).some((entry) => entry.entryId === entryId))
  })

  it('locks the account after repeated failed sign-ins', async () => {
    clearLockoutMemory()
    let last = 0
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await request('POST', '/api/auth/login', { username: 'ghostuser', password: 'Wrong123!' })
      last = res.status
      if (res.status !== 423) assert.equal(res.status, 401)
    }
    assert.equal(last, 423)

    const locked = await request('POST', '/api/auth/login', { username: 'ghostuser', password: 'Wrong123!' })
    assert.equal(locked.status, 423)
    assert.equal(locked.body.error, 'Account temporarily locked due to failed sign-in attempts.')

    clearLockoutMemory()
  })
})
