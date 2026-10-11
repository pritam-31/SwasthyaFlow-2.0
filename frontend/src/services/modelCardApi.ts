/**
 * Model card + failure-mode API (P2-13).
 *
 * Read endpoints work for any signed-in user; the update / create / delete
 * endpoints require a system-admin session and are rejected server-side
 * otherwise. The frontend never re-implements validation.
 */

import { request } from './api'
import type {
  FailureMode,
  FailureModeInput,
  ModelCard,
  ModelCardStatus,
  ModelTrainingData,
} from '../types/modelcard.types'

export async function listModelCards(): Promise<ModelCard[]> {
  const res = await request<{ cards: ModelCard[] }>('/model-cards')
  return res.cards
}

export async function fetchModelCard(cardId: string): Promise<{ card: ModelCard; failureModes: FailureMode[] }> {
  return request<{ card: ModelCard; failureModes: FailureMode[] }>(`/model-cards/${encodeURIComponent(cardId)}`)
}

export interface ModelCardUpdateInput {
  newVersion: string
  changelogEntry: string
  name?: string
  summary?: string
  description?: string
  intendedUse?: string
  outOfScopeUse?: string
  intendedUsers?: string[]
  risksAndLimitations?: string[]
  status?: ModelCardStatus
  trainingData?: ModelTrainingData
}

export async function updateModelCard(cardId: string, input: ModelCardUpdateInput): Promise<ModelCard> {
  const res = await request<{ card: ModelCard }>(`/model-cards/${encodeURIComponent(cardId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return res.card
}

export async function listFailureModes(layerId?: string): Promise<FailureMode[]> {
  const query = layerId ? `?layerId=${encodeURIComponent(layerId)}` : ''
  const res = await request<{ failureModes: FailureMode[] }>(`/failure-modes${query}`)
  return res.failureModes
}

export async function createFailureMode(input: FailureModeInput): Promise<FailureMode> {
  const res = await request<{ failureMode: FailureMode }>('/failure-modes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.failureMode
}

export async function updateFailureMode(failureId: string, patch: Partial<FailureModeInput>): Promise<FailureMode> {
  const res = await request<{ failureMode: FailureMode }>(`/failure-modes/${encodeURIComponent(failureId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.failureMode
}

export async function deleteFailureMode(failureId: string): Promise<void> {
  await request<{ ok: boolean }>(`/failure-modes/${encodeURIComponent(failureId)}`, { method: 'DELETE' })
}
