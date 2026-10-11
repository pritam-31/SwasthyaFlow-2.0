import mongoose, { Schema } from 'mongoose'
import type { EvaluationRun } from '../../types/modelcard.types'

/**
 * Bias evaluation run ledger (P2-13). Records every run attempt (including
 * failures/partials) so the history is auditable. Rows expire after 730 days.
 */
export interface DbEvaluationRun {
  _id: string
  runId: string
  engineVersion: string
  datasetVersion: string
  generatorVersion: string
  status: EvaluationRun['status']
  layersCompleted: string[]
  startedAt: Date
  completedAt: Date | null
  reportId: string | null
  error: string | null
  createdBy: EvaluationRun['createdBy']
}

const EvaluationRunSchema = new Schema<DbEvaluationRun>(
  {
    _id: { type: String, required: true },
    runId: { type: String, required: true, index: true, unique: true },
    engineVersion: { type: String, required: true },
    datasetVersion: { type: String, required: true },
    generatorVersion: { type: String, required: true },
    status: { type: String, required: true, index: true },
    layersCompleted: { type: [String], required: true, default: [] },
    startedAt: { type: Date, required: true, index: { expireAfterSeconds: 60 * 60 * 24 * 730 } },
    completedAt: { type: Date, required: false, default: null },
    reportId: { type: String, required: false, default: null },
    error: { type: String, required: false, default: null },
    createdBy: {
      id: { type: String, required: true },
      username: { type: String, required: true },
      role: { type: String, required: true },
    },
  },
  { versionKey: false, _id: false },
)

export const EvaluationRunModel = mongoose.model<DbEvaluationRun>('EvaluationRun', EvaluationRunSchema, 'evaluation_runs')
