import mongoose, { Schema } from 'mongoose'
import type { LayerId, ModelCardStatus, ModelTrainingData, ModelVersionEntry } from '../../types/modelcard.types'

/**
 * Model card (P2-13). One row per AI/rule layer (`cardId` === `layerId`).
 * Card body text is pre-anonymised and pre-validated by the service before it
 * reaches here. `nonDiagnosticStatement` / `humanInTheLoopStatement` are fixed
 * system text and never editable through the API.
 */
export interface DbModelCard {
  _id: string
  cardId: string
  layerId: LayerId
  name: string
  modelVersion: string
  summary: string
  description: string
  intendedUse: string
  outOfScopeUse: string
  nonDiagnosticStatement: string
  humanInTheLoopStatement: string
  trainingData: ModelTrainingData
  intendedUsers: string[]
  risksAndLimitations: string[]
  versionHistory: ModelVersionEntry[]
  status: ModelCardStatus
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

const ModelCardSchema = new Schema<DbModelCard>(
  {
    _id: { type: String, required: true },
    cardId: { type: String, required: true, index: true, unique: true },
    layerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    modelVersion: { type: String, required: true },
    summary: { type: String, required: true },
    description: { type: String, required: true },
    intendedUse: { type: String, required: true },
    outOfScopeUse: { type: String, required: true },
    nonDiagnosticStatement: { type: String, required: true },
    humanInTheLoopStatement: { type: String, required: true },
    trainingData: {
      description: { type: String, required: true },
      volume: { type: String, required: true },
      syntheticOnly: { type: Boolean, required: true },
      languages: { type: [String], required: true },
      modalities: { type: [String], required: true },
    },
    intendedUsers: { type: [String], required: true },
    risksAndLimitations: { type: [String], required: true },
    versionHistory: {
      type: [
        {
          _id: false,
          version: { type: String, required: true },
          date: { type: String, required: true },
          changelog: { type: String, required: true },
        },
      ],
      required: true,
      default: [],
    },
    status: { type: String, required: true, index: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const ModelCardModel = mongoose.model<DbModelCard>('ModelCard', ModelCardSchema, 'model_cards')
