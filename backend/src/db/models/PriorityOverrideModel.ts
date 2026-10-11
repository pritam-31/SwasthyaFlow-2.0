import mongoose, { Schema } from 'mongoose'

/** Persisted priority override (P1-11). The in-memory store is the source of truth. */
export interface DbPriorityOverride {
  _id: string
  id: string
  sessionId: string
  facilityId: string
  kind: 'score' | 'band' | 'pin' | 'deprioritise' | 'reviewed'
  value?: number | string | null
  reason: string
  actorId: string
  actorRole: string
  createdAt: string
}

const PriorityOverrideSchema = new Schema<DbPriorityOverride>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    kind: { type: String, enum: ['score', 'band', 'pin', 'deprioritise', 'reviewed'], required: true },
    value: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, required: true },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false, _id: false },
)

export const PriorityOverrideModel = mongoose.model<DbPriorityOverride>(
  'PriorityOverride',
  PriorityOverrideSchema,
  'priority_overrides',
)
