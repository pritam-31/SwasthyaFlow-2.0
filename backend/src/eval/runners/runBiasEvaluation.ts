import { randomUUID } from 'node:crypto'
import type {
  BiasReport,
  EvaluationMetricName,
  EvaluationRun,
  FairnessReportRow,
  ModelMetric,
} from '../../types/modelcard.types'
import { ALL_BIAS_DIMENSIONS, ALL_LAYER_IDS } from '../../types/modelcard.types'
import type { UserRole } from '../../types'
import { EVAL_VERSION } from '../version'
import { readDataset } from '../datasetReader'
import { buildFairnessRow } from '../metrics/fairness'
import { runLayerEvaluation } from './runLayerEvaluation'

/**
 * Bias evaluation orchestrator (P2-13).
 *
 * Reads the committed dataset, scores every layer per slice, then builds the
 * fairness rows, per-layer averages and human-readable summary. Pure w.r.t.
 * persistence — the service/route persists the returned objects.
 */

export interface RunActor {
  id: string
  username: string
  role: UserRole
}

export class EvaluationTimeoutError extends Error {
  constructor() {
    super('Bias evaluation exceeded its time budget.')
    this.name = 'EvaluationTimeoutError'
  }
}

const METRICS: EvaluationMetricName[] = ['precision', 'recall', 'f1']

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function weakestSliceKey(row: FairnessReportRow): string {
  const measured = row.individualSlices.filter((slice) => slice.sampleCount > 0)
  const candidates = measured.length > 0 ? measured : row.individualSlices
  const lowest = [...candidates].sort((a, b) => a.metric - b.metric)[0]
  return `${row.dimension}=${lowest?.value ?? 'unknown'}`
}

export function createEvaluationRun(actor: RunActor, now: Date = new Date()): EvaluationRun {
  return {
    runId: `evalrun-${randomUUID()}`,
    engineVersion: EVAL_VERSION,
    datasetVersion: '',
    generatorVersion: '',
    status: 'queued',
    layersCompleted: [],
    startedAt: now.toISOString(),
    createdBy: { id: actor.id, username: actor.username, role: actor.role },
  }
}

/**
 * Score the dataset for `run`. On success the run is finalised in place and the
 * report is returned. Throws {@link EvaluationTimeoutError} when `deadlineMs`
 * elapses, or the underlying dataset/eval error otherwise.
 */
export function runEvaluation(run: EvaluationRun, actor: RunActor, deadlineMs = 30_000): BiasReport {
  const dataset = readDataset()
  run.datasetVersion = dataset.manifest.version
  run.generatorVersion = dataset.manifest.generatorVersion
  run.status = 'running'
  run.layersCompleted = []

  const started = Date.now()
  const { evaluations, layerMacro, pooled, missingSlices, completedLayers } = runLayerEvaluation(dataset.records)
  if (Date.now() - started > deadlineMs) throw new EvaluationTimeoutError()

  const fairness: FairnessReportRow[] = []
  for (const dimension of ALL_BIAS_DIMENSIONS) {
    const buckets = pooled.get(dimension)
    if (!buckets) continue
    for (const metric of METRICS) fairness.push(buildFairnessRow(dimension, metric, buckets))
  }

  const averageMetrics = {} as Record<string, ModelMetric>
  for (const layerId of ALL_LAYER_IDS) averageMetrics[layerId] = layerMacro[layerId]

  const overallF1 = round4(mean(ALL_LAYER_IDS.map((layerId) => layerMacro[layerId].f1)))
  const concerningSlices = [
    ...new Set(fairness.filter((row) => row.evaluatedMetric === 'f1' && row.flag !== 'green').map(weakestSliceKey)),
  ].sort()

  const report: BiasReport = {
    reportId: `biasreport-${randomUUID()}`,
    runId: run.runId,
    engineVersion: EVAL_VERSION,
    datasetVersion: dataset.manifest.version,
    generatorVersion: dataset.manifest.generatorVersion,
    runAt: new Date().toISOString(),
    createdBy: { id: actor.id, username: actor.username, role: actor.role },
    layers: evaluations,
    fairness,
    missingSlices,
    averageMetrics: averageMetrics as BiasReport['averageMetrics'],
    summary: {
      overallF1,
      concerningSlices,
      note:
        `${concerningSlices.length} slice flag(s) need review and ${missingSlices.length} slice(s) have no data. ` +
        'A flag means "review before relying on this layer for that group"; it does not mean the layer is broken.',
    },
  }

  run.status = completedLayers.length === ALL_LAYER_IDS.length ? 'completed' : 'partial'
  run.layersCompleted = completedLayers
  run.reportId = report.reportId
  run.completedAt = new Date().toISOString()
  return report
}

/** Convenience wrapper (tests): create + evaluate in one call. */
export function runBiasEvaluation(actor: RunActor): { report: BiasReport; run: EvaluationRun } {
  const run = createEvaluationRun(actor)
  const report = runEvaluation(run, actor)
  return { report, run }
}
