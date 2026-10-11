import mongoose, { Schema } from 'mongoose'

export interface DbFollowUpQuestion {
  _id: string
  facilityId: string
  id: string
  sessionId: string
  question: string
  status: string
  answer?: string | null
  language: string
  category: string
  target: string
  priority: number
  reason: string
  sourceType: string
  sourceRef: string
  askedAt?: string | null
  answeredAt?: string | null
  answeredBy?: string | null
  answerLanguage?: string | null
  createdAt: string
  updatedAt: string
}

const FollowUpQuestionSchema = new Schema<DbFollowUpQuestion>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    question: { type: String, required: true },
    status: { type: String, required: true },
    answer: { type: String },
    language: { type: String, required: true },
    category: { type: String, required: true },
    target: { type: String, required: true },
    priority: { type: Number, required: true },
    reason: { type: String, required: true },
    sourceType: { type: String, required: true },
    sourceRef: { type: String, required: true },
    askedAt: { type: String },
    answeredAt: { type: String },
    answeredBy: { type: String },
    answerLanguage: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const FollowUpQuestionModel = mongoose.model<DbFollowUpQuestion>('FollowUpQuestion', FollowUpQuestionSchema, 'follow_up_questions')
