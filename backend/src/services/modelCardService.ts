import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { listModelCards, upsertModelCard } from '../repositories/modelcardRepository'
import { addAudit } from './auditStore'
import { buildSeedModelCards } from './modelCardSeed'
import { HttpError } from '../middleware/errorHandler'
import { optionalString, requireEnum, requireString, sanitiseField, stringArray } from './modelCardText'
import type { UserRole } from '../types'
import type { ModelCard, ModelTrainingData } from '../types/modelcard.types'
import {
  ALL_LAYER_IDS,
  compareSemver,
  MODEL_CARD_STATUSES,
  SEMVER_PATTERN,
  isLayerId,
} from '../types/modelcard.types'
import type { SupportedLanguage } from '../types/language.types'

/**
 * Model card service (P2-13).
 *
 * In-memory first (mirrors the rest of the platform); persistence mode writes
 * through the repository. Seeding is idempotent. Updates are version-gated: a
 * new semver + a changelog entry are mandatory, and the version history is
 * append-only.
 */

const LANGS: SupportedLanguage[] = ['en', 'hi', 'or']

const cards = new Map<string, ModelCard>()

export interface ContentActor {
  id: string
  username: string
  role: UserRole
}

function persist(card: ModelCard): void {
  if (!persistenceEnabled()) return
  enqueue('modelcard:' + card.cardId, () => upsertModelCard(card))
}

/** Idempotently create the eight default cards. Returns only newly created ones. */
export function seedDefaultCards(): ModelCard[] {
  const created: ModelCard[] = []
  for (const card of buildSeedModelCards()) {
    if (cards.has(card.cardId)) continue
    cards.set(card.cardId, card)
    persist(card)
    created.push(card)
  }
  if (created.length > 0) {
    addAudit({
      sessionId: 'system',
      actor: 'system',
      role: 'system-admin',
      action: 'modelcard.seeded',
      detail: `Seeded ${created.length} model card(s).`,
      category: 'system',
    })
  }
  return created
}

export function listCards(): ModelCard[] {
  return ALL_LAYER_IDS.map((layerId) => cards.get(layerId)).filter((card): card is ModelCard => Boolean(card))
}

export function getCard(cardId: string): ModelCard | undefined {
  return cards.get(cardId)
}

function parseTrainingData(body: Record<string, unknown>): ModelTrainingData | undefined {
  if (!('trainingData' in body) || body.trainingData === undefined) return undefined
  const raw = body.trainingData
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'trainingData must be an object.')
  }
  const td = raw as Record<string, unknown>
  const description = sanitiseField('trainingData.description', requireString(td, 'description'))
  const volume = sanitiseField('trainingData.volume', requireString(td, 'volume'))
  if (td.syntheticOnly !== true) throw new HttpError(400, 'trainingData.syntheticOnly must be true (synthetic data only).')
  if (!Array.isArray(td.languages) || td.languages.length === 0) {
    throw new HttpError(400, 'trainingData.languages must be a non-empty array.')
  }
  const languages = td.languages.map((item) => {
    if (typeof item !== 'string' || !(LANGS as string[]).includes(item)) {
      throw new HttpError(400, `trainingData.languages must be a subset of: ${LANGS.join(', ')}.`)
    }
    return item as SupportedLanguage
  })
  const modalities = stringArray(td, 'modalities').map((item) => sanitiseField('trainingData.modalities', item))
  return { description, volume, syntheticOnly: true, languages, modalities }
}

export interface ModelCardUpdateResult {
  card: ModelCard
}

/**
 * Apply a version-gated update. Requires `newVersion` (semver, strictly newer)
 * and `changelogEntry`. All text fields pass the non-diagnostic guard and are
 * anonymised before storage.
 */
export function updateCard(cardId: string, body: Record<string, unknown>, actor: ContentActor): ModelCard {
  const card = cards.get(cardId)
  if (!card) throw new HttpError(404, 'Model card not found.')

  const newVersion = typeof body.newVersion === 'string' ? body.newVersion.trim() : ''
  if (!newVersion) throw new HttpError(400, 'Version must be bumped: provide "newVersion".')
  if (!SEMVER_PATTERN.test(newVersion)) {
    throw new HttpError(400, 'Version must be bumped: "newVersion" must be a valid semantic version such as 1.2.0.')
  }
  if (compareSemver(newVersion, card.modelVersion) <= 0) {
    throw new HttpError(400, `Version must be bumped above the current version (${card.modelVersion}).`)
  }
  const changelogEntry = typeof body.changelogEntry === 'string' ? body.changelogEntry.trim() : ''
  if (!changelogEntry) throw new HttpError(400, 'Changelog entry required: provide "changelogEntry".')

  const next: ModelCard = { ...card }

  const name = optionalString(body, 'name')
  if (name !== undefined) next.name = sanitiseField('name', name)
  const summary = optionalString(body, 'summary')
  if (summary !== undefined) next.summary = sanitiseField('summary', summary)
  const description = optionalString(body, 'description')
  if (description !== undefined) next.description = sanitiseField('description', description)
  const intendedUse = optionalString(body, 'intendedUse')
  if (intendedUse !== undefined) next.intendedUse = sanitiseField('intendedUse', intendedUse)
  const outOfScopeUse = optionalString(body, 'outOfScopeUse')
  if (outOfScopeUse !== undefined) next.outOfScopeUse = sanitiseField('outOfScopeUse', outOfScopeUse)

  if ('intendedUsers' in body) {
    next.intendedUsers = stringArray(body, 'intendedUsers').map((item) => sanitiseField('intendedUsers', item))
  }
  if ('risksAndLimitations' in body) {
    next.risksAndLimitations = stringArray(body, 'risksAndLimitations').map((item) => sanitiseField('risksAndLimitations', item))
  }
  if ('status' in body) {
    next.status = requireEnum(body, 'status', MODEL_CARD_STATUSES)
  }
  const trainingData = parseTrainingData(body)
  if (trainingData) next.trainingData = trainingData

  // System text and version history are never editable from the body.
  next.nonDiagnosticStatement = card.nonDiagnosticStatement
  next.humanInTheLoopStatement = card.humanInTheLoopStatement
  next.modelVersion = newVersion
  next.versionHistory = [
    ...card.versionHistory,
    { version: newVersion, date: new Date().toISOString(), changelog: anonymiseChangelog(changelogEntry) },
  ]
  next.updatedAt = new Date().toISOString()
  next.updatedBy = actor.username

  cards.set(cardId, next)
  persist(next)
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'modelcard.updated',
    detail: `Updated model card "${cardId}" to v${newVersion}.`,
    category: 'edit',
  })
  return next
}

function anonymiseChangelog(entry: string): string {
  const check = entry.trim()
  return sanitiseField('changelogEntry', check)
}

/** Record a card view in the audit trail. */
export function recordCardView(cardId: string, actor: ContentActor): void {
  addAudit({
    sessionId: 'system',
    actor: actor.username,
    role: actor.role,
    action: 'modelcard.viewed',
    detail: `Viewed model card "${cardId}".`,
    category: 'view',
  })
}

/** Loads persisted cards into memory on boot (persistent mode only). */
export async function hydrateModelCards(): Promise<void> {
  if (!persistenceEnabled()) return
  const rows = await listModelCards()
  cards.clear()
  for (const row of rows) {
    if (!isLayerId(row.layerId)) continue
    cards.set(row.cardId, row)
  }
}

/** Test-only reset. */
export function clearModelCardMemory(): void {
  cards.clear()
}
