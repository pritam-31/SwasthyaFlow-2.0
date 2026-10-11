import mongoose, { Schema } from 'mongoose'

export interface DbRetentionAction {
  _id: string
  facilityId: string
  id: string
  at: string
  actor: string
  actorRole: string
  action: string
  category?: string | null
  targetId?: string | null
  detail: string
}

const RetentionActionSchema = new Schema<DbRetentionAction>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    at: { type: String, required: true, index: true },
    actor: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    category: { type: String },
    targetId: { type: String },
    detail: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const RetentionActionModel = mongoose.model<DbRetentionAction>('RetentionAction', RetentionActionSchema, 'retention_actions')
