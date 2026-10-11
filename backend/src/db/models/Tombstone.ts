import mongoose, { Schema } from 'mongoose'

export interface DbTombstone {
  _id: string
  facilityId: string
  id: string
  scope: 'session' | 'consent' | 'export' | 'policy'
  sessionId?: string | null
  patientId?: string | null
  category?: string | null
  targetId?: string | null
  reason: string
  deletedAt: string
  deletedBy: string
  deletedByRole: string
  policyVersion: string
}

const TombstoneSchema = new Schema<DbTombstone>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    scope: { type: String, enum: ['session', 'consent', 'export', 'policy'], required: true, index: true },
    sessionId: { type: String, index: true },
    patientId: { type: String },
    category: { type: String },
    targetId: { type: String },
    reason: { type: String, required: true },
    deletedAt: { type: String, required: true, index: true },
    deletedBy: { type: String, required: true },
    deletedByRole: { type: String, required: true },
    policyVersion: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const TombstoneModel = mongoose.model<DbTombstone>('Tombstone', TombstoneSchema, 'tombstones')
