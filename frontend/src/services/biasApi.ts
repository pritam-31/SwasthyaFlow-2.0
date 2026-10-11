/**
 * Bias evaluation API (P2-13) — system-admin only.
 *
 * Every endpoint under `/bias` is rate-limited and gated to a system-admin
 * session by the backend. Running the evaluation is a deliberate, explicit
 * action (never automatic); the UI surfaces the returned report.
 */

import { request } from './api'
import type {
  AnonymiserLeakResult,
  BiasReport,
  DatasetManifest,
  EvaluationRun,
} from '../types/modelcard.types'

export async function fetchManifest(): Promise<DatasetManifest> {
  const res = await request<{ manifest: DatasetManifest }>('/bias/manifest')
  return res.manifest
}

export async function fetchReports(): Promise<BiasReport[]> {
  const res = await request<{ reports: BiasReport[] }>('/bias/reports')
  return res.reports
}

export async function fetchLatestReport(): Promise<BiasReport> {
  const res = await request<{ report: BiasReport }>('/bias/reports/latest')
  return res.report
}

export async function fetchReport(reportId: string): Promise<BiasReport> {
  const res = await request<{ report: BiasReport }>(`/bias/reports/${encodeURIComponent(reportId)}`)
  return res.report
}

export async function deleteReport(reportId: string): Promise<void> {
  await request<{ ok: boolean }>(`/bias/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' })
}

export async function fetchRuns(): Promise<EvaluationRun[]> {
  const res = await request<{ runs: EvaluationRun[] }>('/bias/runs')
  return res.runs
}

export async function runEvaluation(): Promise<BiasReport> {
  const res = await request<{ report: BiasReport }>('/bias/run', { method: 'POST', body: '{}' })
  return res.report
}

export async function runLeakTest(): Promise<AnonymiserLeakResult> {
  const res = await request<{ result: AnonymiserLeakResult }>('/bias/leak', { method: 'POST', body: '{}' })
  return res.result
}
