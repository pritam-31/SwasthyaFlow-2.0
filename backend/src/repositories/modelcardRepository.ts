import { ModelCardModel, FailureModeModel } from '../db/models'
import type { FailureMode, ModelCard } from '../types/modelcard.types'

/** Mongo-backed model-card + failure-mode collections (P2-13). Persistence mode only. */

/* ------------------------------ Model cards ------------------------------ */

export async function upsertModelCard(card: ModelCard): Promise<void> {
  await ModelCardModel.replaceOne(
    { cardId: card.cardId },
    {
      _id: card.cardId,
      cardId: card.cardId,
      layerId: card.layerId,
      name: card.name,
      modelVersion: card.modelVersion,
      summary: card.summary,
      description: card.description,
      intendedUse: card.intendedUse,
      outOfScopeUse: card.outOfScopeUse,
      nonDiagnosticStatement: card.nonDiagnosticStatement,
      humanInTheLoopStatement: card.humanInTheLoopStatement,
      trainingData: card.trainingData,
      intendedUsers: card.intendedUsers,
      risksAndLimitations: card.risksAndLimitations,
      versionHistory: card.versionHistory,
      status: card.status,
      createdAt: new Date(card.createdAt),
      updatedAt: new Date(card.updatedAt),
      updatedBy: card.updatedBy,
    },
    { upsert: true },
  )
}

export async function listModelCards(): Promise<ModelCard[]> {
  const rows = await ModelCardModel.find().lean().exec()
  return rows.map((row) => ({
    cardId: row.cardId,
    layerId: row.layerId,
    name: row.name,
    modelVersion: row.modelVersion,
    summary: row.summary,
    description: row.description,
    intendedUse: row.intendedUse,
    outOfScopeUse: row.outOfScopeUse,
    nonDiagnosticStatement: row.nonDiagnosticStatement,
    humanInTheLoopStatement: row.humanInTheLoopStatement,
    trainingData: row.trainingData,
    intendedUsers: row.intendedUsers,
    risksAndLimitations: row.risksAndLimitations,
    versionHistory: row.versionHistory,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    updatedBy: row.updatedBy,
  }))
}

/* ----------------------------- Failure modes ----------------------------- */

export async function upsertFailureMode(mode: FailureMode): Promise<void> {
  await FailureModeModel.replaceOne(
    { failureId: mode.failureId },
    {
      _id: mode.failureId,
      failureId: mode.failureId,
      layerId: mode.layerId,
      title: mode.title,
      description: mode.description,
      triggerExample: mode.triggerExample,
      impact: mode.impact,
      likelihood: mode.likelihood,
      status: mode.status,
      mitigation: mode.mitigation,
      createdAt: new Date(mode.createdAt),
      updatedAt: new Date(mode.updatedAt),
      updatedBy: mode.updatedBy,
    },
    { upsert: true },
  )
}

export async function deleteFailureMode(failureId: string): Promise<void> {
  await FailureModeModel.deleteOne({ failureId })
}

export async function listFailureModes(): Promise<FailureMode[]> {
  const rows = await FailureModeModel.find().lean().exec()
  return rows.map((row) => ({
    failureId: row.failureId,
    layerId: row.layerId,
    title: row.title,
    description: row.description,
    triggerExample: row.triggerExample,
    impact: row.impact,
    likelihood: row.likelihood,
    status: row.status,
    mitigation: row.mitigation,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    updatedBy: row.updatedBy,
  }))
}
