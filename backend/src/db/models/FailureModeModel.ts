import mongoose, { Schema } from 'mongoose'
import type { FailureImpact, FailureLikelihood, FailureStatus, LayerId } from '../../types/modelcard.types'

/**
 * Failure-mode catalogue entry (P2-13). Documents a known way a layer can fail,
 * its impact and the mitigation. Description/example/mitigation text is
 * pre-anonymised and pre-validated by the service.
 */
export interface DbFailureMode {
  _id: string
  failureId: string
  layerId: LayerId
  title: string
  description: string
  triggerExample: string
  impact: FailureImpact
  likelihood: FailureLikelihood
  status: FailureStatus
  mitigation: string
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

const FailureModeSchema = new Schema<DbFailureMode>(
  {
    _id: { type: String, required: true },
    failureId: { type: String, required: true, index: true, unique: true },
    layerId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    triggerExample: { type: String, required: true },
    impact: { type: String, required: true, index: true },
    likelihood: { type: String, required: true },
    status: { type: String, required: true, index: true },
    mitigation: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const FailureModeModel = mongoose.model<DbFailureMode>('FailureMode', FailureModeSchema, 'failure_modes')
