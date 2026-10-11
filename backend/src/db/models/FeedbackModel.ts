import mongoose, { Schema } from 'mongoose'

/** Mirrors the consts in ../types/feedback.types (models stay import-light). */
const FEEDBACK_TARGET_TYPES = [
  'urgency-flag',
  'missing-info',
  'lab-value',
  'vital',
  'visual',
  'timeline-event',
  'follow-up-question',
  'priority-component',
  'anonymisation-match',
  'report-type',
  'language-detection',
  'ocr-result',
  'triage-note',
  'rule',
]

const FEEDBACK_VERDICTS = ['useful', 'not-useful', 'partially-useful', 'unclear']
const FEEDBACK_REASON_CODES = [
  'correct',
  'false-positive',
  'false-negative',
  'irrelevant',
  'missing-context',
  'wrong-language',
  'over-redacted',
  'under-redacted',
  'misprioritised',
  'other',
]
const FEEDBACK_SEVERITIES = ['low', 'medium', 'high']
const FEEDBACK_STATUSES = ['active', 'edited', 'deleted']

/**
 * Persisted clinician feedback (P2-15).
 *
 * The in-memory store is the source of truth during a process; this model
 * persists feedback so it survives a restart. Every free-text field is
 * anonymised (PII-scrubbed) and de-diagnosed before it reaches persistence.
 */
export interface DbFeedback {
  _id: string
  id: string
  facilityId: string
  sessionId: string | null
  targetType: string
  targetId: string
  targetLabel: string
  layerId: string | null
  verdict: string
  reasonCode: string
  reasonText: string | null
  severity: string
  suggestedFix: string | null
  actorId: string
  actorRole: string
  createdAt: string
  updatedAt: string
  editedAt?: string | null
  editedBy?: string | null
  deletedAt?: string | null
  deletedBy?: string | null
  status: string
}

const FeedbackSchema = new Schema<DbFeedback>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    sessionId: { type: String, default: null, index: true },
    targetType: { type: String, required: true, index: true, enum: FEEDBACK_TARGET_TYPES },
    targetId: { type: String, required: true, index: true },
    targetLabel: { type: String, required: true, default: '' },
    layerId: { type: String, default: null, index: true },
    verdict: { type: String, required: true, index: true, enum: FEEDBACK_VERDICTS },
    reasonCode: { type: String, required: true, index: true, enum: FEEDBACK_REASON_CODES },
    reasonText: { type: String, default: null },
    severity: { type: String, required: true, index: true, enum: FEEDBACK_SEVERITIES, default: 'medium' },
    suggestedFix: { type: String, default: null },
    actorId: { type: String, required: true, index: true },
    actorRole: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
    editedAt: { type: String, default: null },
    editedBy: { type: String, default: null },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
    status: { type: String, required: true, index: true, enum: FEEDBACK_STATUSES, default: 'active' },
  },
  { versionKey: false, _id: false },
)

FeedbackSchema.index({ facilityId: 1, status: 1, createdAt: -1 })
FeedbackSchema.index({ facilityId: 1, targetType: 1, targetId: 1 })
FeedbackSchema.index({ facilityId: 1, layerId: 1, verdict: 1 })
FeedbackSchema.index({ sessionId: 1, verdict: 1 })

export const FeedbackModel = mongoose.model<DbFeedback>('Feedback', FeedbackSchema, 'clinician_feedback')
