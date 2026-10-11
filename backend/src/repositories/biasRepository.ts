import { BiasReportModel, EvaluationRunModel } from '../db/models'
import type { DbBiasReport } from '../db/models/BiasReportModel'
import type { DbEvaluationRun } from '../db/models/EvaluationRunModel'
import type { BiasReport, EvaluationRun, LayerId } from '../types/modelcard.types'

/** Mongo-backed bias-report + evaluation-run collections (P2-13). Persistence mode only. */

export async function upsertBiasReport(report: BiasReport): Promise<void> {
  await BiasReportModel.replaceOne(
    { reportId: report.reportId },
    {
      _id: report.reportId,
      reportId: report.reportId,
      runId: report.runId,
      engineVersion: report.engineVersion,
      datasetVersion: report.datasetVersion,
      generatorVersion: report.generatorVersion,
      runAt: new Date(report.runAt),
      createdBy: report.createdBy,
      layers: report.layers,
      fairness: report.fairness,
      missingSlices: report.missingSlices,
      averageMetrics: report.averageMetrics,
      summary: report.summary,
    },
    { upsert: true },
  )
}

export async function listBiasReports(): Promise<BiasReport[]> {
  const rows = await BiasReportModel.find().lean<DbBiasReport[]>().exec()
  return rows.map((row) => ({
    reportId: row.reportId,
    runId: row.runId,
    engineVersion: row.engineVersion,
    datasetVersion: row.datasetVersion,
    generatorVersion: row.generatorVersion,
    runAt: new Date(row.runAt).toISOString(),
    createdBy: row.createdBy,
    layers: row.layers,
    fairness: row.fairness,
    missingSlices: row.missingSlices,
    averageMetrics: row.averageMetrics as BiasReport['averageMetrics'],
    summary: row.summary,
  }))
}

export async function deleteBiasReport(reportId: string): Promise<void> {
  await BiasReportModel.deleteOne({ reportId })
}

export async function upsertEvaluationRun(run: EvaluationRun): Promise<void> {
  await EvaluationRunModel.replaceOne(
    { runId: run.runId },
    {
      _id: run.runId,
      runId: run.runId,
      engineVersion: run.engineVersion,
      datasetVersion: run.datasetVersion,
      generatorVersion: run.generatorVersion,
      status: run.status,
      layersCompleted: run.layersCompleted,
      startedAt: new Date(run.startedAt),
      completedAt: run.completedAt ? new Date(run.completedAt) : null,
      reportId: run.reportId ?? null,
      error: run.error ?? null,
      createdBy: run.createdBy,
    },
    { upsert: true },
  )
}

export async function listEvaluationRuns(): Promise<EvaluationRun[]> {
  const rows = await EvaluationRunModel.find().lean<DbEvaluationRun[]>().exec()
  return rows.map((row) => ({
    runId: row.runId,
    engineVersion: row.engineVersion,
    datasetVersion: row.datasetVersion,
    generatorVersion: row.generatorVersion,
    status: row.status,
    layersCompleted: row.layersCompleted as LayerId[],
    startedAt: new Date(row.startedAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : undefined,
    reportId: row.reportId ?? undefined,
    error: row.error ?? undefined,
    createdBy: row.createdBy,
  }))
}
