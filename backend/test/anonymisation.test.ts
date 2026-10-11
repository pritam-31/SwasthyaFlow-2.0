import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { seedUsers } from '../src/services/authStore'
import {
  anonymiseText,
  anonymiseFilename,
  buildCoverage,
  toLegacyAnonymizationReport,
} from '../src/services/unifiedAnonymizer'
import { runHarness, runLeakTests, LEAK_CORPUS, type HarnessCase } from '../src/services/anonymisationTestHarness'
import { clearReports, getMetrics, scrubRaw, storeReport } from '../src/services/anonymisationReportService'
import { clearFeedback, getFeedbackMetrics } from '../src/services/reviewerFeedbackService'
import { assertNoPII, clearSessions, createSession, getSession } from '../src/services/sessionStore'
import { clearAudit } from '../src/services/auditStore'
import type { AnonymisationReport } from '../src/types/anonymisation.types'
import type { TriageNote } from '../src/types'

function emptyNote(): TriageNote {
  const stamp = new Date().toISOString()
  return {
    structuredNote: { chiefComplaint: 'Fever', history: 'Two days', vitals: 'Not provided' },
    observations: [],
    urgencyFlags: [],
    missingInformation: [],
    followUpQuestions: [],
    riskScore: 'Low',
    status: 'ai-draft',
    generatedAt: stamp,
    disclaimer: 'Non-diagnostic observational draft.',
  }
}

/* ------------------------------------------------------------------ */
/*  Pure anonymiser                                                    */
/* ------------------------------------------------------------------ */

describe('unifiedAnonymizer', () => {
  it('redacts PII with typed placeholders in the established label style', () => {
    const result = anonymiseText('My name is Ramesh Kumar and phone 9876543210.', 'intake-text', 'en')
    assert.ok(result.text.includes('[NAME REDACTED]'))
    assert.ok(result.text.includes('[PHONE REDACTED]'))
    assert.ok(!result.text.includes('Ramesh Kumar'))
    assert.ok(!result.text.includes('9876543210'))
  })

  it('never alters clinical content', () => {
    const clinical = 'Hb 9.2, BP 160/100, sugar 240, on Metformin, allergic to Penicillin.'
    const result = anonymiseText(clinical, 'clinician-note', 'en')
    assert.equal(result.text, clinical)
    assert.equal(result.redactedCount, 0)
  })

  it('is idempotent — a second pass finds nothing new', () => {
    const first = anonymiseText('Call Ramesh Kumar on 9876543210.', 'intake-text', 'en')
    const second = anonymiseText(first.text, 'intake-text', 'en')
    assert.equal(second.text, first.text)
    assert.equal(second.redactedCount, 0)
  })

  it('coverage ratio is 1 when nothing was found and 0 for an unknown-only set', () => {
    assert.equal(buildCoverage([]).coverageRatio, 1)
    const unknown = buildCoverage([
      { category: 'unknown', modality: 'intake-text', span: { start: 0, end: 1 }, replacement: '[REDACTED]', confidence: 0.4, language: 'en' },
    ])
    assert.equal(unknown.coverageRatio, 0)
    assert.equal(unknown.unknown, 1)
  })

  it('replaces a PII-bearing filename with an opaque id and keeps the extension', () => {
    assert.equal(anonymiseFilename('cbc-report.pdf'), 'cbc-report.pdf')
    const hashed = anonymiseFilename('Ramesh Kumar aadhaar 1234.pdf')
    assert.match(hashed, /^file-[0-9a-f]{8}\.pdf$/)
  })

  it('projects matches onto the legacy report shape', () => {
    const matches = anonymiseText('Name Ramesh Kumar, phone 9876543210.', 'intake-text', 'en').matches
    const legacy = toLegacyAnonymizationReport(matches, 'en')
    assert.ok(legacy.redactedCount >= 2)
    const categories = legacy.redactions.map((r) => r.category)
    assert.ok(categories.includes('name'))
    assert.ok(categories.includes('phone'))
  })
})

/* ------------------------------------------------------------------ */
/*  Leak-test harness                                                  */
/* ------------------------------------------------------------------ */

describe('anonymisationTestHarness', () => {
  it('passes the built-in synthetic corpus', () => {
    const result = runLeakTests()
    assert.equal(result.failed, 0, JSON.stringify(result.failures, null, 2))
    assert.equal(result.passed, LEAK_CORPUS.length)
  })

  it('actually catches a leak (sanity check)', () => {
    const leaky: HarnessCase[] = [
      {
        name: 'deliberate-leak',
        modality: 'intake-text',
        text: 'Ramesh Kumar',
        language: 'en',
        mustBeAbsent: ['Ramesh Kumar'],
      },
    ]
    const result = runHarness(leaky)
    assert.equal(result.passed, 0)
    assert.equal(result.failed, 1)
    assert.ok(result.failures[0].leak.startsWith('pii:'))
  })
})

/* ------------------------------------------------------------------ */
/*  Report store + scrub                                               */
/* ------------------------------------------------------------------ */

describe('anonymisationReportService', () => {
  after(clearReports)

  function sampleReport(): AnonymisationReport {
    const match = anonymiseText('My name is Ramesh Kumar.', 'intake-text', 'en').matches[0]
    return {
      id: 'anon-test',
      sessionId: 'sess-test',
      sourceModality: 'intake-text',
      matches: [match],
      redactedCount: 1,
      warnings: [],
      coverage: buildCoverage([match]),
      createdAt: new Date().toISOString(),
      actorId: 'usr-1',
      actorRole: 'doctor',
      language: 'en',
    }
  }

  it('captures raw internally but scrubRaw strips it', () => {
    const stored = storeReport(sampleReport())
    assert.ok(stored.matches[0].raw && stored.matches[0].raw.includes('Ramesh Kumar'))
    const scrubbed = scrubRaw(stored)
    assert.equal(scrubbed.matches[0].raw, undefined)
    assert.equal(scrubbed.redactedCount, 1)
  })

  it('aggregates metrics across reports', () => {
    clearReports()
    storeReport(sampleReport())
    const metrics = getMetrics()
    assert.equal(metrics.totalRedacted, 1)
    assert.equal(metrics.byModality['intake-text'], 1)
  })
})

/* ------------------------------------------------------------------ */
/*  sessionStore guard                                                 */
/* ------------------------------------------------------------------ */

describe('sessionStore.assertNoPII', () => {
  before(clearSessions)
  after(clearSessions)

  it('accepts an anonymised session and rejects a leaky one', () => {
    const session = createSession({
      displayText: 'Fever since two days, [NAME REDACTED] seen at OPD.',
      anonymization: { redactedCount: 1, redactions: [{ category: 'name', count: 1 }] },
      note: emptyNote(),
      language: 'English',
      ageBand: '18-39',
      sex: 'Female',
      intakePoint: 'OPD',
      ownerId: 'usr-test',
      createdBy: 'Tester',
      createdByRole: 'nurse',
    })
    assert.doesNotThrow(() => assertNoPII(session))

    const leaky = getSession(session.id)
    assert.ok(leaky)
    assert.throws(() => assertNoPII({ ...leaky!, displayText: 'Phone 9876543210 on file.' }), /un-anonymised PII/)
  })
})

/* ------------------------------------------------------------------ */
/*  HTTP API                                                           */
/* ------------------------------------------------------------------ */

describe('anonymisation API (HTTP)', () => {
  let server: Server
  let base = ''

  before(async () => {
    seedUsers()
    clearSessions()
    clearReports()
    clearFeedback()
    clearAudit()
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

  it('requires authentication', async () => {
    const res = await fetch(`${base}/api/anonymisation/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    })
    assert.equal(res.status, 401)
  })

  it('previews redaction for any authenticated role and never returns raw matches', async () => {
    const patient = await login('patient', 'Patient@123')
    const { status, body } = await api(patient, 'POST', '/api/anonymisation/preview', {
      text: 'My name is Ramesh Kumar, phone 9876543210.',
      language: 'en',
    })
    assert.equal(status, 200)
    const text = body.text as string
    assert.ok(text.includes('[NAME REDACTED]'))
    const report = body.report as { matches: Array<{ raw?: string }>; coverage: { coverageRatio: number } }
    assert.ok(report.matches.length >= 2)
    assert.ok(report.matches.every((m) => m.raw === undefined), 'raw must be stripped')
    assert.ok(report.coverage.coverageRatio > 0)
  })

  it('enforces RBAC on reports, metrics, patterns and leak tests', async () => {
    const patient = await login('patient', 'Patient@123')
    const doctor = await login('doctor', 'Doctor@123')
    const admin = await login('admin', 'Admin@123')

    assert.equal((await api(patient, 'GET', '/api/anonymisation/reports')).status, 403)
    assert.equal((await api(doctor, 'GET', '/api/anonymisation/reports')).status, 200)
    assert.equal((await api(doctor, 'GET', '/api/anonymisation/metrics')).status, 403)
    assert.equal((await api(admin, 'GET', '/api/anonymisation/metrics')).status, 200)
    assert.equal((await api(doctor, 'GET', '/api/anonymisation/patterns')).status, 403)
    assert.equal((await api(admin, 'GET', '/api/anonymisation/patterns')).status, 200)

    assert.equal((await api(doctor, 'POST', '/api/anonymisation/leak-tests')).status, 403)
    const leak = await api(admin, 'POST', '/api/anonymisation/leak-tests')
    assert.equal(leak.status, 200)
    assert.equal((leak.body.result as { failed: number }).failed, 0)
  })

  it('records reviewer feedback against a stored report', async () => {
    const doctor = await login('doctor', 'Doctor@123')
    const preview = await api(doctor, 'POST', '/api/anonymisation/run', {
      modality: 'intake-text',
      text: 'Ramesh Kumar called from 9876543210.',
    })
    assert.equal(preview.status, 200)
    const report = preview.body.report as { id: string }

    const submitted = await api(doctor, 'POST', '/api/anonymisation/feedback', {
      reportId: report.id,
      modality: 'intake-text',
      matchIndex: 0,
      verdict: 'correct',
      note: 'Looks right for this format.',
    })
    assert.equal(submitted.status, 200)

    const listed = await api(doctor, 'GET', `/api/anonymisation/feedback?reportId=${report.id}`)
    assert.equal(listed.status, 200)
    assert.equal((listed.body.feedback as unknown[]).length, 1)
    assert.equal(getFeedbackMetrics().total, 1)
  })

  it('rejects an invalid feedback verdict', async () => {
    const doctor = await login('doctor', 'Doctor@123')
    const bad = await api(doctor, 'POST', '/api/anonymisation/feedback', {
      reportId: 'anon-x',
      modality: 'intake-text',
      matchIndex: 0,
      verdict: 'maybe',
    })
    assert.equal(bad.status, 400)
  })
})
