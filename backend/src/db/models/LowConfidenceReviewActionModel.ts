import mongoose, { Schema } from 'mongoose'

/** Mirrors LowConfidenceItemType from ../types (models stay import-light). */
const LOW_CONFIDENCE_ITEM_TYPES = [
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
]

/**
 * Persisted human review decision on one low-confidence item (P2-14, HITL).
 *
 * The in-memory store is the source of truth during a process; this model
 * persists review actions so they survive a restart and are audit-able. Only
 * ids, verdicts and an optional human reason are stored — the reason is
 * anonymised (non-diagnostic + PII-scrubbed) before it reaches persistence.
 */
export interface DbLowConfidenceReviewAction {
  _id: string
  id: string
  sessionId: string
  facilityId: string
  itemType: string
  itemId: string
  verdict: 'accepted' | 'needs-attention' | 'dismissed'
  reason?: string | null
  actorId: string
  actorRole: string
  createdAt: string
}

const LowConfidenceReviewActionSchema = new Schema<DbLowConfidenceReviewAction>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    itemType: { type: String, required: true, index: true, enum: LOW_CONFIDENCE_ITEM_TYPES },
    itemId: { type: String, required: true, index: true },
    verdict: { type: String, enum: ['accepted', 'needs-attention', 'dismissed'], required: true },
    reason: { type: String, default: null },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false, _id: false },
)

LowConfidenceReviewActionSchema.index({ sessionId: 1, itemType: 1, itemId: 1 })
LowConfidenceReviewActionSchema.index({ sessionId: 1, verdict: 1, createdAt: -1 })

export const LowConfidenceReviewActionModel = mongoose.model<DbLowConfidenceReviewAction>(
  'LowConfidenceReviewAction',
  LowConfidenceReviewActionSchema,
  'low_confidence_review_actions',
)
