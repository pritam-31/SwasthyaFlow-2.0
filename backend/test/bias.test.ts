import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { seedUsers } from '../src/services/authStore'
import { seedGlobalSecurityPolicy } from '../src/services/passwordPolicyService'
import { clearBiasMemory } from '../src/services/biasReportService'
import { buildDataset } from '../src/eval/generators/generateDataset'
import { DATASET_SEED } from '../src/eval/version'
import { DatasetMissingError, readDataset, readManifest } from '../src/eval/datasetReader'
import { runBiasEvaluation } from '../src/eval/runners/runBiasEvaluation'
import { buildFairnessRow, flagFor, type SliceBucket } from '../src/eval/metrics/fairness'
import { rate } from '../src/eval/metrics/precisionRecallF1'
import { ALL_BIAS_DIMENSIONS, ALL_LAYER_IDS, BIAS_SLICE_VALUES } from '../src/types/modelcard.types'
import type { BiasReport, DatasetManifest, AnonymiserLeakResult, EvaluationRun } from '../src/types/modelcard.types'

interface HttpResult {
  status: number
  body: Record<string, unknown>
}

describe('bias evaluation engine (unit)', () => {
  it('derives precision, recall and F1 and returns 0 for empty denominators', () => {
    const perfect = rate({ truePositives: 5, falsePositives: 0, falseNegatives: 0 })
    assert.equal(perfect.precision, 1)
    assert.equal(perfect.recall, 1)
    assert.equal(perfect.f1, 1)

    const noTruePositives = rate({ truePositives: 0, falsePositives: 2, falseNegatives: 0 })
    assert.equal(noTruePositives.precision, 0)
    assert.equal(noTruePositives.recall, 0)
    assert.equal(noTruePositives.f1, 0)

    const mixed = rate({ truePositives: 2, falsePositives: 2, falseNegatives: 0 })
    assert.equal(mixed.precision, 0.5)
    assert.equal(mixed.recall, 1)
    assert.equal(mixed.f1, 0.6667)
  })

  it('maps a max−min spread onto green/amber/red at the documented thresholds', () => {
    assert.equal(flagFor(0.049), 'green')
    assert.equal(flagFor(0.05), 'amber')
    assert.equal(flagFor(0.099), 'amber')
    assert.equal(flagFor(0.1), 'red')
  })

  it('flags a large slice disparity red and keeps the "review" framing', () => {
    const buckets = new Map<string, SliceBucket>([
      ['en', { confusion: { truePositives: 18, falsePositives: 2, falseNegatives: 0 }, sampleCount: 20 }],
      ['hi', { confusion: { truePositives: 18, falsePositives: 2, falseNegatives: 0 }, sampleCount: 20 }],
      ['or', { confusion: { truePositives: 6, falsePositives: 2, falseNegatives: 12 }, sampleCount: 20 }],
    ])
    const row = buildFairnessRow('language', 'f1', buckets)
    assert.equal(row.flag, 'red')
    assert.equal(row.evaluatedMetric, 'f1')
    assert.equal(row.individualSlices.length, 3)
    assert.ok(row.maxMin >= 0.1)
    assert.match(row.interpretation, /not a claim that the layer is broken/)
  })

  it('generates the same bytes for a fixed seed and matches the committed manifest', () => {
    const first = buildDataset(DATASET_SEED)
    const second = buildDataset(DATASET_SEED)
    assert.equal(first.manifest.checksum, second.manifest.checksum)
    assert.equal(first.manifest.checksum, readManifest().checksum)
    assert.notEqual(buildDataset(DATASET_SEED + 1).manifest.checksum, first.manifest.checksum)
  })

  it('produces a balanced, complete committed dataset', () => {
    const { manifest, records } = readDataset()
    assert.equal(manifest.files.length, 9)
    assert.equal(records.length, 1980)

    const triage = manifest.files.filter((file) => file.fileName.startsWith('triage-'))
    assert.equal(triage.length, 3)
    for (const file of triage) assert.equal(file.count, 300)
    for (const file of manifest.files) {
      if (!file.fileName.startsWith('triage-')) assert.equal(file.count, 180)
    }

    for (const dimension of ALL_BIAS_DIMENSIONS) {
      const counts = manifest.sliceCounts[dimension]
      let total = 0
      for (const value of Object.values(counts)) total += value
      assert.equal(total, records.length, dimension)
      for (const value of BIAS_SLICE_VALUES[dimension]) {
        assert.ok((counts[value] ?? 0) > 0, `${dimension}=${value} should have samples`)
      }
    }
  })

  it('runs the full evaluation to a complete report', () => {
    const { report, run } = runBiasEvaluation({ id: 'tester', username: 'tester', role: 'system-admin' })
    assert.equal(new Set(report.layers.map((layer) => layer.layerId)).size, 8)
    assert.equal(report.layers.length, 33)
    assert.equal(report.fairness.length, 5 * 3)
    assert.equal(Object.keys(report.averageMetrics).length, 8)
    assert.equal(report.missingSlices.length, 0)
    assert.ok(report.summary.overallF1 > 0.8)
    assert.ok(report.summary.concerningSlices.includes('language=or'))
    assert.equal(run.status, 'completed')
    assert.equal(run.reportId, report.reportId)
    assert.equal(run.layersCompleted.length, ALL_LAYER_IDS.length)
  })

  it('throws when the dataset is absent', () => {
    const original = process.env.BIAS_DATASET_DIR
    process.env.BIAS_DATASET_DIR = mkdtempSync(path.join(tmpdir(), `swathyaflow-missing-${randomUUID()}-`))
    try {
      assert.throws(() => readManifest(), DatasetMissingError)
    } finally {
      if (original === undefined) delete process.env.BIAS_DATASET_DIR
      else process.env.BIAS_DATASET_DIR = original
    }
  })
})

describe('bias evaluation API (HTTP)', () => {
  let server: Server
  let base = ''
  let admin = ''
  let nurse = ''

  before(async () => {
    seedUsers()
    clearBiasMemory()
    await seedGlobalSecurityPolicy()
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

  it('rejects bias endpoints for a non-admin and for anonymous callers', async () => {
    assert.equal((await request('GET', '/api/bias/manifest', undefined, nurse)).status, 403)
    assert.equal((await request('POST', '/api/bias/run', undefined, nurse)).status, 403)
    assert.equal((await request('GET', '/api/bias/reports')).status, 401)
  })

  it('returns the dataset manifest to an admin', async () => {
    const res = await request('GET', '/api/bias/manifest', undefined, admin)
    assert.equal(res.status, 200)
    const manifest = res.body.manifest as DatasetManifest
    assert.equal(manifest.version, '1.0.0')
    assert.equal(manifest.files.length, 9)
    assert.ok((manifest.sliceCounts.language.en ?? 0) > 0)
  })

  it('runs the evaluation, persists a report and exposes the run ledger', async () => {
    const missingLatest = await request('GET', '/api/bias/reports/latest', undefined, admin)
    assert.equal(missingLatest.status, 404)

    const run = await request('POST', '/api/bias/run', undefined, admin)
    assert.equal(run.status, 201, JSON.stringify(run.body))
    const report = run.body.report as BiasReport
    assert.equal(report.layers.length, 33)
    assert.equal(report.fairness.length, 15)
    assert.equal(Object.keys(report.averageMetrics).length, 8)

    const latest = await request('GET', '/api/bias/reports/latest', undefined, admin)
    assert.equal(latest.status, 200)
    assert.equal((latest.body.report as BiasReport).reportId, report.reportId)

    const one = await request('GET', `/api/bias/reports/${report.reportId}`, undefined, admin)
    assert.equal(one.status, 200)

    const list = await request('GET', '/api/bias/reports', undefined, admin)
    assert.ok((list.body.reports as unknown[]).length >= 1)

    const runs = await request('GET', '/api/bias/runs', undefined, admin)
    const ledger = runs.body.runs as EvaluationRun[]
    assert.ok(ledger.length >= 1)
    assert.equal(ledger[0].status, 'completed')
  })

  it('runs the anonymiser leak test', async () => {
    const res = await request('POST', '/api/bias/leak', undefined, admin)
    assert.equal(res.status, 200)
    const result = res.body.result as AnonymiserLeakResult
    assert.equal(result.failed, 0)
    assert.ok(result.passed >= 30)
    assert.equal(result.precision, 1)
    assert.equal(result.recall, 1)
  })

  it('records bias audit entries', async () => {
    const audit = await request('GET', '/api/audit', undefined, admin)
    assert.equal(audit.status, 200)
    const actions = (audit.body.entries as Array<{ action: string }>).map((entry) => entry.action)
    assert.ok(actions.includes('bias.evaluation-run'))
    assert.ok(actions.includes('bias.manifest-viewed'))
  })

  it('deletes a report and 404s thereafter', async () => {
    const run = await request('POST', '/api/bias/run', undefined, admin)
    const reportId = (run.body.report as BiasReport).reportId
    const removed = await request('DELETE', `/api/bias/reports/${reportId}`, undefined, admin)
    assert.equal(removed.status, 200)
    const gone = await request('GET', `/api/bias/reports/${reportId}`, undefined, admin)
    assert.equal(gone.status, 404)
  })
})
