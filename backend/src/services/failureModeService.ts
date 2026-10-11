import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  deleteFailureMode as removePersisted,
  listFailureModes as loadFailureModes,
  upsertFailureMode,
} from '../repositories/modelcardRepository'
import { addAudit } from './auditStore'
import { buildSeedFailureModes } from './failureModeSeed'
import { HttpError } from '../middleware/errorHandler'
import { optionalString, requireEnum, requireString, sanitiseField } from './modelCardText'
import type { ContentActor } from './modelCardService'
import type { FailureMode, LayerId } from '../types/modelcard.types'
import {
  ALL_LAYER_IDS,
  FAILURE_IMPACTS,
  FAILURE_LIKELIHOODS,
  FAILURE_STATUSES,
  isLayerId,
} from '../types/modelcard.types'

/**
 * Failure-mode catalogue service (P2-13). In-memory first; persisted on write in
 * persistence mode. All text passes the non-diagnostic guard + anonymisation.
 */

const modes = new Map<string, FailureMode>()

function persist(mode: FailureMode): void {
  if (!persistenceEnabled()) return
  enqueue('failuremode:' + mode.failureId, () => upsertFailureMode(mode))
}

/** Idempotently create the 17 default failure modes. */
export function seedDefaultFailureModes(): FailureMode[] {
  const created: FailureMode[] = []
  for (const mode of buildSeedFailureModes()) {
    if (modes.has(mode.failureId)) continue
    modes.set(mode.failureId, mode)
    persist(mode)
    created.push(mode)
  }
  if (created.length > 0) {
    addAudit({
      sessionId: 'system',
      actor: 'system',
      role: 'system-admin',
      action: 'failuremode.seeded',
      detail: `Seeded ${created.length} failure-mode entr(ies).`,
      category: 'system',
    })
  }
  return created
}

export function listFailureModes(layerId?: string): FailureMode[] {
  const all = [...modes.values()].sort((a, b) => a.failureId.localeCompare(b.failureId))
  return layerId ? all.filter((mode) => mode.layerId === layerId) : all
}

export function getFailureMode(failureId: string): FailureMode | undefined {
  return modes.get(failureId)
}

function requireLayerId(body: Record<string, unknown>): LayerId {
  const value = body.layerId
  if (!isLayerId(value)) throw new HttpError(400, `layerId must be one of: ${ALL_LAYER_IDS.join(', ')}.`)
  return value
}

export function createFailureMode(body: Record<string, unknown>, actor: ContentActor): FailureMode {
  const now = new Date().toISOString()
  const mode: FailureMode = {
    failureId: `FM-${randomUUID()}`,
    layerId: requireLayerId(body),
    title: sanitiseField('title', requireString(body, 'title')),
    description: sanitiseField('description', requireString(body, 'description')),
    triggerExample: sanitiseField('triggerExample', requireString(body, 'triggerExample')),
    impact: requireEnum(body, 'impact', FAILURE_IMPACTS),
    likelihood: requireEnum(body, 'likelihood', FAILURE_LIKELIHOODS),
    status: requireEnum(body, 'status', FAILURE_STATUSES),
    mitigation: sanitiseField('mitigation', requireString(body, 'mitigation')),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor.username,
  }
  modes.set(mode.failureId, mode)
  persist(mode)
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'failuremode.created',
    detail: `Created failure mode "${mode.failureId}" for layer "${mode.layerId}".`,
    category: 'edit',
  })
  return mode
}

export function updateFailureMode(failureId: string, body: Record<string, unknown>, actor: ContentActor): FailureMode {
  const mode = modes.get(failureId)
  if (!mode) throw new HttpError(404, 'Failure mode not found.')
  const next: FailureMode = { ...mode }

  if ('layerId' in body) next.layerId = requireLayerId(body)
  const title = optionalString(body, 'title')
  if (title !== undefined) next.title = sanitiseField('title', title)
  const description = optionalString(body, 'description')
  if (description !== undefined) next.description = sanitiseField('description', description)
  const triggerExample = optionalString(body, 'triggerExample')
  if (triggerExample !== undefined) next.triggerExample = sanitiseField('triggerExample', triggerExample)
  const mitigation = optionalString(body, 'mitigation')
  if (mitigation !== undefined) next.mitigation = sanitiseField('mitigation', mitigation)
  if ('impact' in body) next.impact = requireEnum(body, 'impact', FAILURE_IMPACTS)
  if ('likelihood' in body) next.likelihood = requireEnum(body, 'likelihood', FAILURE_LIKELIHOODS)
  if ('status' in body) next.status = requireEnum(body, 'status', FAILURE_STATUSES)

  next.updatedAt = new Date().toISOString()
  next.updatedBy = actor.username
  modes.set(failureId, next)
  persist(next)
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'failuremode.updated',
    detail: `Updated failure mode "${failureId}".`,
    category: 'edit',
  })
  return next
}

export function deleteFailureMode(failureId: string, actor: ContentActor): boolean {
  if (!modes.has(failureId)) return false
  modes.delete(failureId)
  if (persistenceEnabled()) enqueue('failuremode:' + failureId, () => removePersisted(failureId))
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'failuremode.deleted',
    detail: `Deleted failure mode "${failureId}".`,
    category: 'edit',
  })
  return true
}

/** Loads persisted failure modes into memory on boot (persistent mode only). */
export async function hydrateFailureModes(): Promise<void> {
  if (!persistenceEnabled()) return
  const rows = await loadFailureModes()
  modes.clear()
  for (const row of rows) modes.set(row.failureId, row)
}

/** Test-only reset. */
export function clearFailureModeMemory(): void {
  modes.clear()
}
