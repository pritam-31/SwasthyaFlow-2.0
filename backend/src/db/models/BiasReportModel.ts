import mongoose, { Schema } from 'mongoose'
import type {
  BiasReport,
  FairnessReportRow,
  LayerEvaluation,
  ModelMetric,
} from '../../types/modelcard.types'

/**
 * Bias evaluation report (P2-13). One row per completed/partial run. The
 * structured payload (`layers`, `fairness`, `averageMetrics`) is stored via the
 * typed Mixed type — the app-level {@link BiasReport} interface keeps the shape
 * precise. Rows expire after 730 days via a TTL index.
 */
export interface DbBiasReport {
  _id: string
  reportId: string
  runId: string
  engineVersion: string
  datasetVersion: string
  generatorVersion: string
  runAt: Date
  createdBy: BiasReport['createdBy']
  layers: LayerEvaluation[]
  fairness: FairnessReportRow[]
  missingSlices: string[]
  averageMetrics: Record<string, ModelMetric>
  summary: BiasReport['summary']
}

const BiasReportSchema = new Schema<DbBiasReport>(
  {
    _id: { type: String, required: true },
    reportId: { type: String, required: true, index: true, unique: true },
    runId: { type: String, required: true, index: true },
    engineVersion: { type: String, required: true },
    datasetVersion: { type: String, required: true },
    generatorVersion: { type: String, required: true },
    runAt: { type: Date, required: true, index: { expireAfterSeconds: 60 * 60 * 24 * 730 } },
    createdBy: {
      id: { type: String, required: true },
      username: { type: String, required: true },
      role: { type: String, required: true },
    },
    layers: { type: Schema.Types.Mixed, required: true },
    fairness: { type: Schema.Types.Mixed, required: true },
    missingSlices: { type: [String], required: true, default: [] },
    averageMetrics: { type: Schema.Types.Mixed, required: true },
    summary: {
      overallF1: { type: Number, required: true },
      concerningSlices: { type: [String], required: true },
      note: { type: String, required: true },
    },
  },
  { versionKey: false, _id: false },
)

export const BiasReportModel = mongoose.model<DbBiasReport>('BiasReport', BiasReportSchema, 'bias_reports')
