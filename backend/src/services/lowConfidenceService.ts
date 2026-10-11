import { randomUUID } from 'node:crypto'
import { LowConfidenceReviewActionModel, type DbLowConfidenceReviewAction } from '../db/models/LowConfidenceReviewActionModel'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { addAudit } from './auditStore'
import { getEffectiveThresholds } from './confidencePolicyService'
import { buildSessionConfidence } from './confidenceService'
import { anonymiseText } from './unifiedAnonymizer'
import { enforceNonDiagnostic } from './reportParser'
import type {
  LowConfidenceItem,
  LowConfidenceItemType,
  LowConfidenceReviewAction,
  LowConfidenceVerdict,
  PatientSession,
  SessionConfidence,
  UserRole,
} from '../types'

/**
 * Low-confidence surfacing + human-in-the-loop review store (P2-14).
 *
 * The in-memory store is the source of truth during a process; review actions
 * are also persisted so they survive a restart. Only ids, verdicts and an
 * anonymised, non-diagnostic reason are ever stored. A human decision does not
 * change the AI value — it records the decision next to it.
 */

const MAX_STORED_ACTIONS = 2000
const actionsBySession = new Map<string, LowConfidenceReviewAction[]>()

export interface ReviewActionValidation {
  ok: boolean
  errors: string[]
}

/** Validates a candidate review action. Returns generic message keys only. */
export function validateReviewAction(
  itemType: string,
  verdict: string,
  reason: string | undefined,
): ReviewActionValidation {
  const errors: string[] = []
  if (!LOW_CONFIDENCE_ITEM_TYPES_SET.has(itemType as LowConfidenceItemType)) {
    errors.push('confidence.unknown-item-type')
  }
  if (!LOW_CONFIDENCE_VERDICTS_SET.has(verdict as LowConfidenceVerdict)) {
    errors.push('confidence.unknown-verdict')
  }
  if ((verdict === 'needs-attention' || verdict === 'dismissed') && !reason?.trim()) {
    errors.push('confidence.reason-required')
  }
  return { ok: errors.length === 0, errors }
}

// Kept as Sets for O(1) membership; values mirror the confidence.types consts.
const LOW_CONFIDENCE_ITEM_TYPES_SET = new Set<LowConfidenceItemType>([
  'urgency',
  'missing-info',
  'lab',
  'vital',
  'visual',
  'timeline',
  'follow-up',
  'priority-component',
  'anonymisation',
  'report-type',
  'language',
  'ocr',
  'triage-note',
])
const LOW_CONFIDENCE_VERDICTS_SET = new Set<LowConfidenceVerdict>([
  'accepted',
  'needs-attention',
  'dismissed',
])

/** Anonymise + de-diagnose a human reason before it can be stored. */
function sanitiseReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined
  const cleaned = enforceNonDiagnostic(anonymiseText(reason, 'audit-detail').text).trim()
  return cleaned.length > 0 ? cleaned : undefined
}

export interface RecordReviewActionInput {
  session: PatientSession
  itemType: LowConfidenceItemType
  itemId: string
  verdict: LowConfidenceVerdict
  reason?: string
  actor: { id: string; role: UserRole }
}

/** Records one human decision against a low-confidence item (validated upstream). */
export function recordReviewAction(input: RecordReviewActionInput): LowConfidenceReviewAction {
  const action: LowConfidenceReviewAction = {
    id: `lcr-${randomUUID()}`,
    sessionId: input.session.id,
    itemType: input.itemType,
    itemId: input.itemId,
    verdict: input.verdict,
    reason: sanitiseReason(input.reason),
    actorId: input.actor.id,
    actorRole: input.actor.role,
    createdAt: new Date().toISOString(),
  }

  const list = actionsBySession.get(input.session.id) ?? []
  list.push(action)
  if (list.length > MAX_STORED_ACTIONS) list.splice(0, list.length - MAX_STORED_ACTIONS)
  actionsBySession.set(input.session.id, list)

  if (persistenceEnabled()) {
    const doc: DbLowConfidenceReviewAction = {
      _id: action.id,
      id: action.id,
      sessionId: action.sessionId,
      facilityId: input.session.facilityId,
      itemType: action.itemType,
      itemId: action.itemId,
      verdict: action.verdict,
      reason: action.reason ?? null,
      actorId: action.actorId,
      actorRole: action.actorRole,
      createdAt: action.createdAt,
    }
    enqueue('confidence-review', () => LowConfidenceReviewActionModel.replaceOne({ id: action.id }, doc, { upsert: true }).exec())
  }

  addAudit({
    sessionId: input.session.id,
    facilityId: input.session.facilityId,
    actor: input.actor.id,
    role: input.actor.role,
    action: 'confidence.review-action',
    detail: `Confidence review ${action.verdict} for ${action.itemType} ${action.itemId}.`,
    category: 'decision',
  })

  return action
}

/** Every review action recorded against a session, newest first. */
export function listReviewActions(sessionId: string): LowConfidenceReviewAction[] {
  return [...(actionsBySession.get(sessionId) ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** Session-wide confidence (worst-case + aggregate + low-confidence items). */
export async function getSessionConfidence(session: PatientSession): Promise<SessionConfidence> {
  const thresholds = await getEffectiveThresholds(session.facilityId)
  return buildSessionConfidence(session, thresholds)
}

/** Only the items currently under the facility's low threshold. */
export async function getLowConfidenceItems(session: PatientSession): Promise<LowConfidenceItem[]> {
  const confidence = await getSessionConfidence(session)
  return confidence.items
}

/** Loads persisted review actions into memory on boot (persistent mode only). */
export async function hydrateLowConfidenceReviewActions(): Promise<void> {
  actionsBySession.clear()
  if (!persistenceEnabled()) return
  const rows = await LowConfidenceReviewActionModel.find().lean<DbLowConfidenceReviewAction[]>().exec()
  for (const row of rows) {
    const action: LowConfidenceReviewAction = {
      id: row.id,
      sessionId: row.sessionId,
      itemType: row.itemType as LowConfidenceItemType,
      itemId: row.itemId,
      verdict: row.verdict,
      reason: row.reason ?? undefined,
      actorId: row.actorId,
      actorRole: row.actorRole as UserRole,
      createdAt: row.createdAt,
    }
    const list = actionsBySession.get(action.sessionId) ?? []
    list.push(action)
    actionsBySession.set(action.sessionId, list)
  }
}

/** Test-only reset. */
export function clearLowConfidenceStoreMemory(): void {
  actionsBySession.clear()
}
