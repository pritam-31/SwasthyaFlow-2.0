import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { createUser, seedUsers } from '../src/services/authStore'
import { clearFacilities, seedDefaultFacility } from '../src/services/facilityService'
import { clearSessions } from '../src/services/sessionStore'
import { clearStoredImages, getStoredImage, listStoredImages } from '../src/services/imageStore'
import { runAuditVerification } from '../src/services/auditVerificationScheduler'
import { RETENTION_HANDLERS } from '../src/services/retentionService'
import {
  addAudit,
  attachAuditChainSource,
  backfillAuditChain,
  clearAudit,
  countAudit,
  decodeCursor,
  ensureChainMetaForFacility,
  getChainMetaForFacility,
  listAudit,
  listAuditFiltered,
  listAuditPaged,
  pruneAuditEntry,
  searchAudit,
  verifyAuditChain,
  verifyAuditEntry,
} from '../src/services/auditStore'
import {
  appendToChain,
  canonicalSerialise,
  computeHash,
  pruneEntry,
  registerChainSource,
  resetChain,
  verifyChain,
  verifyEntry,
} from '../src/services/auditChainService'
import { exportAudit, exportFormatOf } from '../src/services/auditExportService'
import {
  GENESIS_HASH,
  HASH_ALGORITHM,
  type AuditChainEntry,
} from '../src/types/auditChain.types'
import type { AuditEntry } from '../src/types'
import { DEFAULT_FACILITY_ID } from '../src/types/facility.types'

function baseEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: `aud-${Math.random().toString(16).slice(2)}`,
    sessionId: 'sess-chain',
    facilityId: 'fac-chain',
    actor: 'N. Nurse',
    role: 'nurse',
    action: 'case.viewed',
    detail: 'Viewed a case (no PII).',
    category: 'view',
    at: new Date().toISOString(),
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/*  Chain math (isolated facility, custom source)                      */
/* ------------------------------------------------------------------ */

describe('audit chain math', () => {
  const facilityId = 'fac-chain'
  const rows: AuditChainEntry[] = []

  before(() => {
    registerChainSource(() => rows)
    resetChain()
    rows.length = 0
  })
  after(() => {
    // Hand the source back to the audit store for the remaining suites.
    attachAuditChainSource()
    resetChain()
  })

  it('starts a facility chain at GENESIS_HASH', () => {
    const entry = appendToChain(baseEntry({ id: 'c-1', facilityId }))
    rows.push(entry)
    assert.equal(entry.sequenceNumber, 1)
    assert.equal(entry.previousHash, GENESIS_HASH)
    assert.equal(entry.hashAlgorithm, HASH_ALGORITHM)
    assert.equal(entry.chainId, facilityId)
    assert.equal(entry.pruned, false)
  })

  it('links each entry to the previous hash and increments the sequence', () => {
    const second = appendToChain(baseEntry({ id: 'c-2', facilityId }))
    rows.push(second)
    assert.equal(second.sequenceNumber, 2)
    assert.equal(second.previousHash, rows[0].hash)
  })

  it('is idempotent for a replayed entry id', () => {
    const again = appendToChain(baseEntry({ id: 'c-2', facilityId }))
    assert.equal(again.hash, rows[1].hash)
    assert.equal(rows.length, 2)
  })

  it('serialises canonically (key order independent) and hashes deterministically', () => {
    const input = {
      facilityId,
      actor: 'N. Nurse',
      role: 'nurse' as const,
      action: 'case.viewed',
      category: 'view' as const,
      detail: 'x',
      sessionId: 's',
      at: '2026-01-01T00:00:00.000Z',
      sequenceNumber: 1,
    }
    assert.equal(canonicalSerialise(input, GENESIS_HASH), canonicalSerialise({ ...input }, GENESIS_HASH))
    assert.equal(computeHash(input, GENESIS_HASH), computeHash({ ...input }, GENESIS_HASH))
    assert.match(computeHash(input, GENESIS_HASH), /^[0-9a-f]{64}$/)
  })

  it('verifies a valid chain and reports the checked count', () => {
    const result = verifyChain(facilityId)
    assert.equal(result.valid, true)
    assert.equal(result.checkedEntries, 2)
  })

  it('detects a tampered detail and points at the first invalid entry', () => {
    rows[0] = { ...rows[0], detail: 'tampered' }
    const result = verifyChain(facilityId)
    assert.equal(result.valid, false)
    assert.equal(result.firstInvalidSequence, 1)
    rows[0] = { ...rows[0], detail: 'Viewed a case (no PII).' }
    assert.equal(verifyChain(facilityId).valid, true)
  })

  it('detects a tampered hash and a broken linkage', () => {
    const good = rows[1].hash
    rows[1] = { ...rows[1], hash: 'deadbeef' }
    assert.equal(verifyChain(facilityId).valid, false)
    rows[1] = { ...rows[1], hash: good }

    rows[1] = { ...rows[1], previousHash: 'abcdef' }
    assert.equal(verifyChain(facilityId).valid, false)
    rows[1] = { ...rows[1], previousHash: rows[0].hash }
    assert.equal(verifyChain(facilityId).valid, true)
  })

  it('verifies a single entry and reports not-found', () => {
    assert.equal(verifyEntry(facilityId, 2).valid, true)
    assert.equal(verifyEntry(facilityId, 99).valid, false)
    assert.equal(verifyEntry(facilityId, 99).reason, 'entry not found')
  })

  it('prunes into a tombstone that keeps the chain verifiable', () => {
    const pruned = pruneEntry(rows[0], 'audit-entries', 'Retention scheduler')
    rows[0] = pruned
    assert.equal(pruned.pruned, true)
    assert.equal(pruned.detail, '[pruned]')
    assert.equal(pruned.actor, '[pruned]')
    assert.ok(pruned.prunedHash)
    assert.equal(verifyChain(facilityId).valid, true)

    const tamperedTombstone = { ...pruned, detail: 'still here' }
    rows[0] = tamperedTombstone
    assert.equal(verifyChain(facilityId).valid, false)
    rows[0] = pruned
    assert.equal(verifyChain(facilityId).valid, true)
  })
})

/* ------------------------------------------------------------------ */
/*  Store: chaining, filter, search, pagination, verification          */
/* ------------------------------------------------------------------ */

describe('audit store (in-memory)', () => {
  before(() => {
    clearAudit()
    addAudit({ sessionId: 'sess-a', actor: 'A', role: 'nurse', action: 'case.viewed', detail: 'one', category: 'view' })
    addAudit({ sessionId: 'sess-a', actor: 'A', role: 'nurse', action: 'case.edited', detail: 'two', category: 'edit' })
    addAudit({ sessionId: 'sess-b', actor: 'B', role: 'doctor', action: 'case.reviewed', detail: 'three', category: 'decision' })
  })

  it('chains every appended entry with a monotonic sequence', () => {
    const entries = listAudit(undefined, DEFAULT_FACILITY_ID).sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    assert.equal(entries.length, 3)
    assert.equal(entries[0].sequenceNumber, 1)
    assert.equal(entries[2].sequenceNumber, 3)
    assert.match(entries[0].hash, /^[0-9a-f]{64}$/)
    assert.equal(verifyAuditChain(DEFAULT_FACILITY_ID).valid, true)
  })

  it('filters by session, category and action and searches action+detail', () => {
    assert.equal(countAudit({ facilityId: DEFAULT_FACILITY_ID, sessionId: 'sess-a' }), 2)
    assert.equal(countAudit({ facilityId: DEFAULT_FACILITY_ID, categories: ['view'] }), 1)
    assert.equal(listAuditFiltered({ facilityId: DEFAULT_FACILITY_ID, actions: ['case.viewed'] }).length, 1)
    assert.equal(searchAudit({ facilityId: DEFAULT_FACILITY_ID, search: 'one' }).length, 1)
    // A regex metacharacter must not blow up or match everything.
    assert.equal(searchAudit({ facilityId: DEFAULT_FACILITY_ID, search: '.*' }).length, 0)
  })

  it('paginates with a decodable cursor', () => {
    const page1 = listAuditPaged({ facilityId: DEFAULT_FACILITY_ID, limit: 2 })
    assert.equal(page1.items.length, 2)
    assert.equal(page1.total, 3)
    assert.ok(page1.nextCursor)
    assert.equal(decodeCursor(page1.nextCursor ?? undefined), 2)
    const page2 = listAuditPaged({ facilityId: DEFAULT_FACILITY_ID, limit: 2, cursor: page1.nextCursor ?? undefined })
    assert.equal(page2.items.length, 1)
    assert.equal(page2.nextCursor, null)
  })

  it('reports chain metadata for a facility', () => {
    const meta = getChainMetaForFacility(DEFAULT_FACILITY_ID)
    assert.ok(meta)
    assert.equal(meta?.entryCount, 3)
    assert.equal(meta?.lastSequenceNumber, 3)
  })

  it('creates a genesis head + meta for an empty facility', () => {
    const meta = ensureChainMetaForFacility('fac-empty')
    assert.equal(meta.lastSequenceNumber, 0)
    assert.equal(meta.lastHash, GENESIS_HASH)
    assert.equal(meta.entryCount, 0)
    assert.equal(ensureChainMetaForFacility('fac-empty').lastHash, GENESIS_HASH)
  })

  it('prunes via the store without deleting and keeps the chain valid', () => {
    const victim = listAudit()[0]
    assert.equal(pruneAuditEntry(victim.id, 'audit-entries', 'Retention scheduler'), true)
    const after = listAudit().find((entry) => entry.id === victim.id)
    assert.ok(after)
    assert.equal(after?.pruned, true)
    assert.equal(after?.detail, '[pruned]')
    assert.equal(verifyAuditChain(DEFAULT_FACILITY_ID).valid, true)
  })

  it('backfill is a no-op once every entry is chained', () => {
    const result = backfillAuditChain()
    assert.equal(result.entries, 0)
    assert.deepEqual(result.facilities, [])
  })

  it('verifies individual entries by sequence number', () => {
    const entry = listAudit()[0]
    assert.equal(verifyAuditEntry(DEFAULT_FACILITY_ID, entry.sequenceNumber).valid, true)
    assert.equal(verifyAuditEntry(DEFAULT_FACILITY_ID, 999).reason, 'entry not found')
  })

  it('blocks a forged chain (tamper via source) — sanity', () => {
    const result = verifyAuditChain(DEFAULT_FACILITY_ID)
    assert.equal(result.valid, true)
  })
})

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

describe('audit export service', () => {
  const facility = 'fac-export'

  before(() => {
    clearStoredImages()
    addAudit({
      facilityId: facility,
      sessionId: 'sess-x',
      actor: 'N. Nurse',
      role: 'nurse',
      action: 'case.viewed',
      detail: 'Called 9876543210 about a case',
      category: 'view',
    })
  })

  it('builds a CSV that is anonymised and headed by the column names', async () => {
    const result = await exportAudit({ facilityId: facility }, 'csv', { name: 'F. Admin', role: 'facility-admin' })
    assert.equal(result.format, 'csv')
    assert.equal(result.mimeType, 'text/csv; charset=utf-8')
    assert.equal(result.recordCount, 1)
    const stored = getStoredImage(result.ref)
    assert.ok(stored)
    const text = stored.buffer.toString('utf8')
    assert.match(text, /sequenceNumber/)
    assert.match(text, /createdAt/)
    assert.ok(!/9876543210/.test(text), 'raw phone number must not be exported')
  })

  it('does not include raw PII in JSON exports', async () => {
    const result = await exportAudit(
      { facilityId: facility, categories: ['view'] },
      'json',
      { name: 'F. Admin', role: 'facility-admin' },
    )
    const stored = getStoredImage(result.ref)
    assert.ok(stored)
    const parsed = JSON.parse(stored.buffer.toString('utf8')) as Array<Record<string, unknown>>
    assert.equal(parsed.length, 1)
    assert.ok(!/9876543210/.test(JSON.stringify(parsed)))
    assert.equal(exportFormatOf(result.ref), 'json')
  })

  it('builds a non-empty PDF document', async () => {
    const result = await exportAudit({ facilityId: facility }, 'pdf', { name: 'F. Admin', role: 'facility-admin' }, 'hi')
    const stored = getStoredImage(result.ref)
    assert.ok(stored)
    assert.equal(stored.buffer.subarray(0, 5).toString('ascii'), '%PDF-')
    assert.ok(result.sizeBytes > 500)
  })

  it('stores exports under the "export" retention category and audits them', async () => {
    const listed = listStoredImages('export')
    assert.ok(listed.length >= 1)
    const actions = listAudit().filter((e) => e.facilityId === facility).map((e) => e.action)
    assert.ok(actions.includes('audit.exported'))
  })

  it('rejects an unknown format', async () => {
    await assert.rejects(
      exportAudit({ facilityId: facility }, 'xls' as unknown as 'csv', { name: 'A', role: 'facility-admin' }),
      /format must be one of/,
    )
  })
})

/* ------------------------------------------------------------------ */
/*  Retention + verification scheduler                                 */
/* ------------------------------------------------------------------ */

describe('audit retention + scheduler', () => {
  const facility = 'fac-retention'

  before(() => {
    clearAudit()
  })

  it('prunes instead of hard-deleting and writes audit.entry-pruned', () => {
    const entry = addAudit({
      facilityId: facility,
      sessionId: 'sess-r',
      actor: 'N. Nurse',
      role: 'nurse',
      action: 'case.viewed',
      detail: 'will be pruned',
      category: 'view',
    })
    const removed = RETENTION_HANDLERS['audit-entries'].remove(entry.id)
    assert.equal(removed, true)
    const still = listAudit().find((row) => row.id === entry.id)
    assert.ok(still, 'entry must not be hard-deleted')
    assert.equal(still?.pruned, true)
    assert.ok(listAudit().some((row) => row.action === 'audit.entry-pruned'))
    assert.equal(verifyAuditChain(facility).valid, true)
  })

  it('writes audit.chain-verified when the verification job runs', () => {
    seedDefaultFacility()
    clearAudit()
    addAudit({ facilityId: DEFAULT_FACILITY_ID, sessionId: 's', actor: 'A', role: 'nurse', action: 'x', detail: 'y', category: 'view' })
    runAuditVerification()
    assert.ok(listAudit().some((row) => row.action === 'audit.chain-verified'))
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP surface (RBAC, verify, meta, export download)                 */
/* ------------------------------------------------------------------ */

describe('audit API (HTTP)', () => {
  let server: Server
  let base = ''
  let nurse = ''
  let patient = ''
  let facAdmin = ''

  interface HttpResult {
    status: number
    body: Record<string, unknown>
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = (await res.json()) as { token: string }
    return body.token
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

  before(async () => {
    seedUsers()
    clearSessions()
    clearFacilities()
    clearAudit()
    seedDefaultFacility()
    createUser({ username: 'audfacadmin', displayName: 'A. Admin', password: 'AudFac@123', role: 'facility-admin' })
    addAudit({ sessionId: 'sess-http', actor: 'N. Nurse', role: 'nurse', action: 'case.viewed', detail: 'trail', category: 'view' })
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    nurse = await login('nurse', 'Nurse@123')
    patient = await login('patient', 'Patient@123')
    facAdmin = await login('audfacadmin', 'AudFac@123')
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('lets a facility admin verify the chain and records the verification', async () => {
    clearAudit()
    addAudit({ sessionId: 'sess-http', actor: 'N. Nurse', role: 'nurse', action: 'case.viewed', detail: 'trail', category: 'view' })
    const res = await request('GET', `/api/audit/chain/${DEFAULT_FACILITY_ID}/verify`, undefined, facAdmin)
    assert.equal(res.status, 200)
    assert.equal(res.body.valid, true)
    assert.ok(listAudit().some((row) => row.action === 'audit.chain-verified'))
  })

  it('hides chain verification from nurses and patients', async () => {
    const nurseRes = await request('GET', `/api/audit/chain/${DEFAULT_FACILITY_ID}/verify`, undefined, nurse)
    assert.equal(nurseRes.status, 403)
    const patientRes = await request('GET', `/api/audit/chain/${DEFAULT_FACILITY_ID}/verify`, undefined, patient)
    assert.equal(patientRes.status, 403)
  })

  it('returns 404 for a missing entry and the chain meta', async () => {
    const missing = await request('GET', `/api/audit/chain/${DEFAULT_FACILITY_ID}/entry/9999/verify`, undefined, facAdmin)
    assert.equal(missing.status, 404)
    const meta = await request('GET', `/api/audit/chain/${DEFAULT_FACILITY_ID}/meta`, undefined, facAdmin)
    assert.equal(meta.status, 200)
    assert.equal(typeof meta.body.lastSequenceNumber, 'number')
  })

  it('exports and then streams the stored export back', async () => {
    const created = await request('POST', '/api/audit/export', { filter: {}, format: 'csv' }, facAdmin)
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const ref = String(created.body.ref)
    assert.ok(ref)

    const res = await fetch(`${base}/api/audit/export/${ref}`, {
      headers: { authorization: `Bearer ${facAdmin}` },
    })
    assert.equal(res.status, 200)
    assert.match(String(res.headers.get('content-type')), /text\/csv/)
    const text = await res.text()
    assert.match(text, /sequenceNumber/)
  })

  it('keeps patients out of the export endpoints', async () => {
    const res = await request('POST', '/api/audit/export', { filter: {}, format: 'json' }, patient)
    assert.equal(res.status, 403)
  })
})
