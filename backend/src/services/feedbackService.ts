import { randomUUID } from 'node:crypto'
import { FeedbackModel, type DbFeedback } from '../db/models/FeedbackModel'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { addAudit } from './auditStore'
import { anonymiseText } from './unifiedAnonymizer'
import { enforceNonDiagnostic } from './reportParser'
import { isLayerId } from '../types/modelcard.types'
import {
  FEEDBACK_FIX_MAX,
  FEEDBACK_REASON_MAX,
  isFeedbackReasonCode,
  isFeedbackSeverity,
  isFeedbackTargetType,
  isFeedbackVerdict,
  type Feedback,
  type FeedbackFilter,
} from '../types/feedback.types'
import type { UserRole } from '../types'

/**
 * Clinician feedback loop store (P2-15).
 *
 * The in-memory store is the source of truth during a process; feedback is also
 * persisted so it survives a restart. Every free-text field is anonymised
 * (PII-scrubbed) and de-diagnosed before it is stored. Feedback is advisory: a
 * human verdict never auto-applies to a rule, threshold or score.
 */

const MAX_STORED_FEEDBACK = 5000
const feedbackItems = new Map<string, Feedback>()

export interface FeedbackActor {
  id: string
  role: UserRole
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

/** Validates a candidate create payload. Returns generic message keys only. */
export function validateFeedbackCreate(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  if (!isFeedbackTargetType(input.targetType)) errors.push('feedback.unknown-target-type')
  if (typeof input.targetId !== 'string' || input.targetId.trim() === '') errors.push('feedback.target-id-required')
  if (!isFeedbackVerdict(input.verdict)) errors.push('feedback.unknown-verdict')
  if (!isFeedbackReasonCode(input.reasonCode)) errors.push('feedback.unknown-reason-code')
  if (input.severity !== undefined && !isFeedbackSeverity(input.severity)) errors.push('feedback.unknown-severity')
  if (input.layerId !== undefined && input.layerId !== null && !isLayerId(input.layerId)) {
    errors.push('feedback.unknown-layer')
  }
  if (typeof input.reasonText === 'string' && input.reasonText.trim().length > FEEDBACK_REASON_MAX * 4) {
    errors.push('feedback.reason-too-long')
  }
  if (typeof input.suggestedFix === 'string' && input.suggestedFix.trim().length > FEEDBACK_FIX_MAX * 4) {
    errors.push('feedback.fix-too-long')
  }
  return { ok: errors.length === 0, errors }
}

/** Validates a candidate update payload. Returns generic message keys only. */
export function validateFeedbackUpdate(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  if (input.verdict !== undefined && !isFeedbackVerdict(input.verdict)) errors.push('feedback.unknown-verdict')
  if (input.reasonCode !== undefined && !isFeedbackReasonCode(input.reasonCode)) {
    errors.push('feedback.unknown-reason-code')
  }
  if (input.severity !== undefined && !isFeedbackSeverity(input.severity)) errors.push('feedback.unknown-severity')
  return { ok: errors.length === 0, errors }
}

/** Anonymise + de-diagnose a free-text field before it can be stored. */
function sanitiseText(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = enforceNonDiagnostic(anonymiseText(value, 'audit-detail').text).trim()
  return cleaned.length > 0 ? cleaned.slice(0, max) : null
}

export interface SubmitFeedbackInput {
  facilityId: string
  sessionId?: string | null
  targetType: string
  targetId: string
  targetLabel?: string | null
  layerId?: string | null
  verdict: string
  reasonCode: string
  reasonText?: string | null
  severity?: string
  suggestedFix?: string | null
  actor: FeedbackActor
}

/** Records one reviewer verdict (validated upstream). */
export function submitFeedback(input: SubmitFeedbackInput): Feedback {
  const now = new Date().toISOString()
  const label = sanitiseText(input.targetLabel, 200) ?? input.targetId.slice(0, 200)
  const layerId = input.layerId && isLayerId(input.layerId) ? input.layerId : null
  const item: Feedback = {
    id: `fb-${randomUUID()}`,
    facilityId: input.facilityId,
    sessionId: input.sessionId && input.sessionId.trim() !== '' ? input.sessionId : null,
    targetType: input.targetType as Feedback['targetType'],
    targetId: input.targetId.slice(0, 200),
    targetLabel: label,
    layerId,
    verdict: input.verdict as Feedback['verdict'],
    reasonCode: input.reasonCode as Feedback['reasonCode'],
    reasonText: sanitiseText(input.reasonText, FEEDBACK_REASON_MAX),
    severity: (input.severity as Feedback['severity']) ?? 'medium',
    suggestedFix: sanitiseText(input.suggestedFix, FEEDBACK_FIX_MAX),
    actorId: input.actor.id,
    actorRole: input.actor.role,
    createdAt: now,
    updatedAt: now,
    status: 'active',
  }
  store(item)

  addAudit({
    sessionId: item.sessionId ?? 'feedback',
    facilityId: item.facilityId,
    actor: item.actorId,
    role: item.actorRole,
    action: 'feedback.created',
    detail: `Feedback ${item.verdict}/${item.reasonCode} for ${item.targetType} ${item.targetId}.`,
    category: 'decision',
  })

  return item
}

function store(item: Feedback): void {
  feedbackItems.set(item.id, item)
  if (feedbackItems.size > MAX_STORED_FEEDBACK) {
    const oldest = [...feedbackItems.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    if (oldest) feedbackItems.delete(oldest.id)
  }
  if (persistenceEnabled()) {
    enqueue('feedback', () => FeedbackModel.replaceOne({ id: item.id }, toDbFeedback(item), { upsert: true }).exec())
  }
}

function matchesFilter(item: Feedback, filter: FeedbackFilter): boolean {
  if (filter.status ? item.status !== filter.status : item.status === 'deleted') return false
  if (filter.sessionId && item.sessionId !== filter.sessionId) return false
  if (filter.targetType && item.targetType !== filter.targetType) return false
  if (filter.layerId && item.layerId !== filter.layerId) return false
  if (filter.verdict && item.verdict !== filter.verdict) return false
  if (filter.reasonCode && item.reasonCode !== filter.reasonCode) return false
  if (filter.severity && item.severity !== filter.severity) return false
  if (filter.actorId && item.actorId !== filter.actorId) return false
  if (filter.since && item.createdAt < filter.since) return false
  if (filter.until && item.createdAt > filter.until) return false
  return true
}

/** Newest first. Deleted items are excluded unless `filter.status === 'deleted'`. */
export function listFeedback(facilityId: string, filter: FeedbackFilter = {}): Feedback[] {
  return listAllFeedback()
    .filter((item) => item.facilityId === facilityId)
    .filter((item) => matchesFilter(item, filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Every stored feedback item across facilities (aggregation + export only). */
export function listAllFeedback(): Feedback[] {
  return [...feedbackItems.values()]
}

/** One item, scoped to a facility. Empty for another tenant's item. */
export function getFeedback(facilityId: string, id: string): Feedback | undefined {
  const item = feedbackItems.get(id)
  if (!item || item.facilityId !== facilityId) return undefined
  return item
}

export interface UpdateFeedbackInput {
  verdict?: string
  reasonCode?: string
  reasonText?: string | null
  severity?: string
  suggestedFix?: string | null
  targetLabel?: string | null
}

/** Records one human edit. `targetType` / `targetId` / `sessionId` are immutable. */
export function updateFeedback(facilityId: string, id: string, patch: UpdateFeedbackInput, actor: FeedbackActor): Feedback {
  const item = getFeedback(facilityId, id)
  if (!item) throw new Error('feedback-not-found')
  const now = new Date().toISOString()

  const updated: Feedback = {
    ...item,
    verdict: (patch.verdict as Feedback['verdict']) ?? item.verdict,
    reasonCode: (patch.reasonCode as Feedback['reasonCode']) ?? item.reasonCode,
    reasonText: patch.reasonText === undefined ? item.reasonText : sanitiseText(patch.reasonText, FEEDBACK_REASON_MAX),
    severity: (patch.severity as Feedback['severity']) ?? item.severity,
    suggestedFix: patch.suggestedFix === undefined ? item.suggestedFix : sanitiseText(patch.suggestedFix, FEEDBACK_FIX_MAX),
    targetLabel: patch.targetLabel === undefined ? item.targetLabel : sanitiseText(patch.targetLabel, 200) ?? item.targetLabel,
    editedAt: now,
    editedBy: actor.id,
    updatedAt: now,
    status: 'edited',
  }
  store(updated)

  addAudit({
    sessionId: updated.sessionId ?? 'feedback',
    facilityId: updated.facilityId,
    actor: actor.id,
    role: actor.role,
    action: 'feedback.updated',
    detail: `Feedback ${updated.id} updated (${updated.verdict}/${updated.reasonCode}).`,
    category: 'decision',
  })

  return updated
}

/** Soft-deletes a feedback item; the row survives for the audit trail. */
export function deleteFeedback(facilityId: string, id: string, actor: FeedbackActor): Feedback {
  const item = getFeedback(facilityId, id)
  if (!item) throw new Error('feedback-not-found')
  const now = new Date().toISOString()
  const updated: Feedback = {
    ...item,
    status: 'deleted',
    deletedAt: now,
    deletedBy: actor.id,
    updatedAt: now,
  }
  store(updated)

  addAudit({
    sessionId: updated.sessionId ?? 'feedback',
    facilityId: updated.facilityId,
    actor: actor.id,
    role: actor.role,
    action: 'feedback.deleted',
    detail: `Feedback ${updated.id} withdrawn for ${updated.targetType} ${updated.targetId}.`,
    category: 'decision',
  })

  return updated
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

export interface FeedbackExportResult {
  exportId: string
  facilityId: string
  generatedAt: string
  generatedBy: string
  generatedByRole: UserRole
  disclaimer: string
  total: number
  feedback: Feedback[]
}

export interface ExportFeedbackInput {
  sessionId?: string
  since?: string
  until?: string
  actor: { id: string; name: string; role: UserRole }
}

/** Portable, non-diagnostic copy of a facility's feedback (never patient payload). */
export function exportFeedback(facilityId: string, input: ExportFeedbackInput): FeedbackExportResult {
  const filter: FeedbackFilter = { status: 'active' }
  if (input.sessionId) filter.sessionId = input.sessionId
  if (input.since) filter.since = input.since
  if (input.until) filter.until = input.until
  const rows = listFeedback(facilityId, filter)
  const exportId = `fexp-${randomUUID()}`

  addAudit({
    sessionId: input.sessionId ?? 'feedback',
    facilityId,
    actor: input.actor.id,
    role: input.actor.role,
    action: 'feedback.exported',
    detail: `Feedback export ${exportId} generated (${rows.length} item(s)).`,
    category: 'export',
  })

  return {
    exportId,
    facilityId,
    generatedAt: new Date().toISOString(),
    generatedBy: input.actor.name,
    generatedByRole: input.actor.role,
    disclaimer:
      'Exported clinician feedback about workflow quality only. It is anonymised, non-diagnostic and advisory — ' +
      'it is never applied to a rule, threshold or score automatically.',
    total: rows.length,
    feedback: rows,
  }
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

function toDbFeedback(item: Feedback): DbFeedback {
  return {
    _id: item.id,
    id: item.id,
    facilityId: item.facilityId,
    sessionId: item.sessionId,
    targetType: item.targetType,
    targetId: item.targetId,
    targetLabel: item.targetLabel,
    layerId: item.layerId,
    verdict: item.verdict,
    reasonCode: item.reasonCode,
    reasonText: item.reasonText,
    severity: item.severity,
    suggestedFix: item.suggestedFix,
    actorId: item.actorId,
    actorRole: item.actorRole,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    editedAt: item.editedAt ?? null,
    editedBy: item.editedBy ?? null,
    deletedAt: item.deletedAt ?? null,
    deletedBy: item.deletedBy ?? null,
    status: item.status,
  }
}

function fromDbFeedback(row: DbFeedback): Feedback {
  const item: Feedback = {
    id: row.id,
    facilityId: row.facilityId,
    sessionId: row.sessionId ?? null,
    targetType: row.targetType as Feedback['targetType'],
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    layerId: (row.layerId as Feedback['layerId']) ?? null,
    verdict: row.verdict as Feedback['verdict'],
    reasonCode: row.reasonCode as Feedback['reasonCode'],
    reasonText: row.reasonText ?? null,
    severity: row.severity as Feedback['severity'],
    suggestedFix: row.suggestedFix ?? null,
    actorId: row.actorId,
    actorRole: row.actorRole as Feedback['actorRole'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status as Feedback['status'],
  }
  if (row.editedAt) item.editedAt = row.editedAt
  if (row.editedBy) item.editedBy = row.editedBy
  if (row.deletedAt) item.deletedAt = row.deletedAt
  if (row.deletedBy) item.deletedBy = row.deletedBy
  return item
}

/** Loads persisted feedback into memory on boot (persistent mode only). */
export async function hydrateFeedback(): Promise<void> {
  feedbackItems.clear()
  if (!persistenceEnabled()) return
  const rows = await FeedbackModel.find().lean<DbFeedback[]>().exec()
  for (const row of rows) feedbackItems.set(row.id, fromDbFeedback(row))
}

/** Test-only reset. */
export function clearFeedbackStoreMemory(): void {
  feedbackItems.clear()
}

/** Retention sweep helper — soft-deletes one expired item (audit trail survives). */
export function softDeleteFeedbackForRetention(id: string): boolean {
  const item = feedbackItems.get(id)
  if (!item || item.status === 'deleted') return false
  const now = new Date().toISOString()
  store({ ...item, status: 'deleted', deletedAt: now, deletedBy: 'retention', updatedAt: now })
  return true
}
