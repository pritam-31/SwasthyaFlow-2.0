import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { seedUsers } from '../src/services/authStore'
import { seedGlobalSecurityPolicy } from '../src/services/passwordPolicyService'
import {
  clearModelCardMemory,
  listCards,
  seedDefaultCards,
} from '../src/services/modelCardService'
import { buildSeedModelCards, OUT_OF_SCOPE_USE_STATEMENT } from '../src/services/modelCardSeed'
import { buildSeedFailureModes } from '../src/services/failureModeSeed'
import { clearFailureModeMemory, seedDefaultFailureModes } from '../src/services/failureModeService'
import { enforceNonDiagnostic } from '../src/services/nonDiagnostic'
import type { ModelCard } from '../src/types/modelcard.types'

interface HttpResult {
  status: number
  body: Record<string, unknown>
}

function cardTextFields(card: ModelCard): string[] {
  return [
    card.name,
    card.summary,
    card.description,
    card.intendedUse,
    card.outOfScopeUse,
    card.trainingData.description,
    card.trainingData.volume,
    ...card.intendedUsers,
    ...card.risksAndLimitations,
  ]
}

describe('model cards + failure modes API (HTTP)', () => {
  let server: Server
  let base = ''
  let admin = ''
  let nurse = ''

  before(async () => {
    seedUsers()
    clearModelCardMemory()
    clearFailureModeMemory()
    await seedGlobalSecurityPolicy()
    seedDefaultCards()
    seedDefaultFailureModes()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    admin = await login('admin', 'Admin@123')
    nurse = await login('nurse', 'Nurse@123')
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

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

  async function login(username: string, password: string): Promise<string> {
    const res = await request('POST', '/api/auth/login', { username, password })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return String(res.body.token)
  }

  it('seeds eight default model cards, idempotently', () => {
    assert.equal(listCards().length, 8)
    assert.equal(buildSeedModelCards().length, 8)
    assert.equal(seedDefaultCards().length, 0)
  })

  it('stamps the fixed safety statements and the required out-of-scope phrases on every card', () => {
    for (const card of listCards()) {
      assert.ok(card.nonDiagnosticStatement.includes('does not diagnose'), card.cardId)
      assert.ok(card.humanInTheLoopStatement.includes('reviewed by a qualified healthcare worker'), card.cardId)
      assert.ok(card.outOfScopeUse.includes('diagnosis'), card.cardId)
      assert.ok(card.outOfScopeUse.includes('prescription'), card.cardId)
      assert.ok(card.outOfScopeUse.includes('treatment planning'), card.cardId)
      assert.ok(card.outOfScopeUse.includes('triage category assignment per clinical protocol'), card.cardId)
      assert.ok(card.outOfScopeUse.includes('replacement of clinician judgment'), card.cardId)
      assert.equal(card.outOfScopeUse, OUT_OF_SCOPE_USE_STATEMENT)
    }
  })

  it('keeps every seeded card and failure-mode string inside the non-diagnostic guard', () => {
    for (const card of listCards()) {
      for (const text of cardTextFields(card)) assert.equal(enforceNonDiagnostic(text).ok, true, text)
    }
    for (const mode of buildSeedFailureModes()) {
      for (const text of [mode.title, mode.description, mode.triggerExample, mode.mitigation]) {
        assert.equal(enforceNonDiagnostic(text).ok, true, text)
      }
    }
  })

  it('lists cards and returns a card with its failure modes', async () => {
    const list = await request('GET', '/api/model-cards', undefined, nurse)
    assert.equal(list.status, 200)
    assert.equal((list.body.cards as unknown[]).length, 8)

    const one = await request('GET', '/api/model-cards/anonymiser', undefined, nurse)
    assert.equal(one.status, 200)
    assert.equal((one.body.card as ModelCard).cardId, 'anonymiser')
    const failures = one.body.failureModes as Array<{ layerId: string }>
    assert.ok(failures.length >= 3)
    assert.ok(failures.every((mode) => mode.layerId === 'anonymiser'))

    const missing = await request('GET', '/api/model-cards/nope', undefined, nurse)
    assert.equal(missing.status, 404)
  })

  it('requires authentication for the card list', async () => {
    const res = await request('GET', '/api/model-cards')
    assert.equal(res.status, 401)
  })

  it('rejects card updates from a non-admin', async () => {
    const res = await request(
      'PATCH',
      '/api/model-cards/anonymiser',
      { summary: 'Updated summary.', newVersion: '2.0.0', changelogEntry: 'Test.' },
      nurse,
    )
    assert.equal(res.status, 403)
  })

  it('enforces the version bump and changelog requirements', async () => {
    const noVersion = await request('PATCH', '/api/model-cards/anonymiser', {}, admin)
    assert.equal(noVersion.status, 400)
    assert.match(String(noVersion.body.error), /Version must be bumped/)

    const badVersion = await request(
      'PATCH',
      '/api/model-cards/anonymiser',
      { newVersion: 'v1', changelogEntry: 'x' },
      admin,
    )
    assert.equal(badVersion.status, 400)

    const notBumped = await request(
      'PATCH',
      '/api/model-cards/anonymiser',
      { newVersion: '1.0.0', changelogEntry: 'x' },
      admin,
    )
    assert.equal(notBumped.status, 400)
    assert.match(String(notBumped.body.error), /above the current version/)

    const noChangelog = await request('PATCH', '/api/model-cards/anonymiser', { newVersion: '1.1.0' }, admin)
    assert.equal(noChangelog.status, 400)
    assert.match(String(noChangelog.body.error), /Changelog entry required/)
  })

  it('applies a version-gated update and records version history', async () => {
    const res = await request(
      'PATCH',
      '/api/model-cards/anonymiser',
      { summary: 'Clarified coverage across the supported languages.', newVersion: '1.1.0', changelogEntry: 'Clarified language coverage.' },
      admin,
    )
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const card = res.body.card as ModelCard
    assert.equal(card.modelVersion, '1.1.0')
    assert.equal(card.versionHistory.length, 2)
    assert.equal(card.versionHistory[1].version, '1.1.0')
    assert.equal(card.updatedBy, 'admin')

    const after = await request('GET', '/api/model-cards/anonymiser', undefined, admin)
    assert.equal((after.body.card as ModelCard).modelVersion, '1.1.0')
  })

  it('rejects non-diagnostic language in a card update', async () => {
    const res = await request(
      'PATCH',
      '/api/model-cards/anonymiser',
      { summary: 'This layer diagnoses dengue fever from the intake note.', newVersion: '1.2.0', changelogEntry: 'x' },
      admin,
    )
    assert.equal(res.status, 400)
    assert.match(String(res.body.error), /Non-diagnostic/)
  })

  it('manages failure modes for an admin and rejects a non-admin', async () => {
    const denied = await request(
      'POST',
      '/api/failure-modes',
      { layerId: 'report-parser', title: 'x', description: 'y', triggerExample: 'z', impact: 'low', likelihood: 'rare', status: 'open', mitigation: 'w' },
      nurse,
    )
    assert.equal(denied.status, 403)

    const created = await request(
      'POST',
      '/api/failure-modes',
      {
        layerId: 'report-parser',
        title: 'Unit alias gap',
        description: 'A synthetic failure used only by the test.',
        triggerExample: 'A synthetic trigger line.',
        impact: 'medium',
        likelihood: 'rare',
        status: 'open',
        mitigation: 'Handled by a reviewer check.',
      },
      admin,
    )
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const failureId = String((created.body.failureMode as { failureId: string }).failureId)

    const filtered = await request('GET', '/api/failure-modes?layerId=report-parser', undefined, admin)
    assert.equal(filtered.status, 200)
    assert.ok((filtered.body.failureModes as Array<{ layerId: string }>).every((mode) => mode.layerId === 'report-parser'))

    const updated = await request('PATCH', `/api/failure-modes/${failureId}`, { status: 'mitigated' }, admin)
    assert.equal(updated.status, 200)
    assert.equal((updated.body.failureMode as { status: string }).status, 'mitigated')

    const invalid = await request('POST', '/api/failure-modes', { layerId: 'report-parser', impact: 'critical' }, admin)
    assert.equal(invalid.status, 400)

    const removed = await request('DELETE', `/api/failure-modes/${failureId}`, undefined, admin)
    assert.equal(removed.status, 200)
    const gone = await request('GET', `/api/failure-modes/${failureId}`, undefined, admin)
    assert.equal(gone.status, 404)
  })

  it('records a model-card view in the audit trail', async () => {
    await request('GET', '/api/model-cards/triage-engine', undefined, admin)
    const audit = await request('GET', '/api/audit', undefined, admin)
    assert.equal(audit.status, 200)
    assert.ok((audit.body.entries as Array<{ action: string }>).some((entry) => entry.action === 'modelcard.viewed'))
  })
})
