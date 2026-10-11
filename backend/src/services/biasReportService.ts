import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteBiasReport as removePersisted,
  listBiasReports as loadReports,
  listEvaluationRuns as loadRuns,
  upsertBiasReport,
  upsertEvaluationRun,
} from '../repositories/biasRepository'
import { addAudit } from './auditStore'
import { HttpError } from '../middleware/errorHandler'
import { DatasetMissingError, readManifest } from '../eval/datasetReader'
import {
  EvaluationTimeoutError,
  createEvaluationRun,
  runEvaluation,
  type RunActor,
} from '../eval/runners/runBiasEvaluation'
import { runAnonymiserLeakTest } from '../eval/runners/runAnonymiserLeakTest'
import type {
  AnonymiserLeakResult,
  BiasReport,
  DatasetManifest,
  EvaluationRun,
} from '../types/modelcard.types'
import type { ContentActor } from './modelCardService'

/**
 * Bias report service (P2-13).
 *
 * Owns the run ledger and report history, records the audit trail and maps
 * evaluation failures to clean HTTP errors. Reports are immutable once written.
 */

const reports = new Map<string, BiasReport>()
const runs = new Map<string, EvaluationRun>()

function persistReport(report: BiasReport): void {
  if (!persistenceEnabled()) return
  enqueue('biasreport:' + report.reportId, () => upsertBiasReport(report))
}

function persistRun(run: EvaluationRun): void {
  if (!persistenceEnabled()) return
  enqueue('evalrun:' + run.runId, () => upsertEvaluationRun(run))
}

export function listReports(): BiasReport[] {
  return [...reports.values()].sort((a, b) => b.runAt.localeCompare(a.runAt))
}

export function getReport(reportId: string): BiasReport | undefined {
  return reports.get(reportId)
}

export function latestReport(): BiasReport | undefined {
  return listReports()[0]
}

export function listRuns(): EvaluationRun[] {
  return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function deleteReport(reportId: string, actor: ContentActor): boolean {
  if (!reports.has(reportId)) return false
  reports.delete(reportId)
  if (persistenceEnabled()) enqueue('biasreport:' + reportId, () => removePersisted(reportId))
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'bias.report-deleted',
    detail: `Deleted bias report "${reportId}".`,
    category: 'edit',
  })
  return true
}

export function recordReportView(reportId: string, actor: ContentActor): void {
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'bias.report-viewed',
    detail: `Viewed bias report "${reportId}".`,
    category: 'view',
  })
}

export function getManifest(actor: ContentActor): DatasetManifest {
  const manifest = readManifest()
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'bias.manifest-viewed',
    detail: `Viewed dataset manifest v${manifest.version}.`,
    category: 'view',
  })
  return manifest
}

export function runLeakTest(actor: ContentActor): AnonymiserLeakResult {
  const result = runAnonymiserLeakTest()
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'bias.evaluation-run',
    detail: `Anonymiser leak test: ${result.passed} passed, ${result.failed} failed.`,
    category: 'system',
  })
  return result
}

/** Run the full bias evaluation; persists the run ledger + report and audits. */
export function performBiasRun(actor: ContentActor): BiasReport {
  const runActor: RunActor = { id: actor.id, username: actor.username, role: actor.role }
  const run = createEvaluationRun(runActor)
  runs.set(run.runId, run)
  persistRun(run)

  try {
    const report = runEvaluation(run, runActor)
    reports.set(report.reportId, report)
    persistReport(report)
    runs.set(run.runId, run)
    persistRun(run)
    addAudit({
      sessionId: 'system',
      actor: actor.username,
      role: actor.role,
      action: 'bias.evaluation-run',
      detail: `Bias evaluation ${run.status} (run ${run.runId}); ${report.summary.concerningSlices.length} slice flag(s) need review.`,
      category: 'system',
    })
    return report
  } catch (err) {
    run.status = 'failed'
    run.completedAt = new Date().toISOString()
    run.error = err instanceof Error ? err.message : 'unknown error'
    runs.set(run.runId, run)
    persistRun(run)
    addAudit({
      sessionId: 'system',
      actor: actor.username,
      role: actor.role,
      action: 'bias.evaluation-run',
      detail: `Bias evaluation failed (run ${run.runId}).`,
      category: 'system',
    })
    if (err instanceof DatasetMissingError) throw new HttpError(500, 'Evaluation dataset is missing or incomplete.')
    if (err instanceof EvaluationTimeoutError) throw new HttpError(504, 'Bias evaluation timed out.')
    throw new HttpError(500, 'Bias evaluation failed.')
  }
}

/** Loads persisted reports + runs into memory on boot (persistent mode only). */
export async function hydrateBias(): Promise<void> {
  if (!persistenceEnabled()) return
  reports.clear()
  runs.clear()
  for (const report of await loadReports()) reports.set(report.reportId, report)
  for (const run of await loadRuns()) runs.set(run.runId, run)
}

/** Test-only reset. */
export function clearBiasMemory(): void {
  reports.clear()
  runs.clear()
}
