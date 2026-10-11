import mongoose, { Schema } from 'mongoose'

export interface DbReviewerFeedback {
  _id: string
  facilityId: string
  id: string
  sessionId?: string | null
  reportId: string
  modality: string
  matchIndex: number
  verdict: 'false-positive' | 'false-negative' | 'correct'
  note?: string | null
  actorId: string
  actorRole: string
  createdAt: string
}

const ReviewerFeedbackSchema = new Schema<DbReviewerFeedback>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, index: true },
    reportId: { type: String, required: true, index: true },
    modality: { type: String, required: true },
    matchIndex: { type: Number, required: true },
    verdict: { type: String, enum: ['false-positive', 'false-negative', 'correct'], required: true },
    note: { type: String },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false, _id: false },
)

export const ReviewerFeedbackModel = mongoose.model<DbReviewerFeedback>('ReviewerFeedback', ReviewerFeedbackSchema, 'reviewer_feedback')
