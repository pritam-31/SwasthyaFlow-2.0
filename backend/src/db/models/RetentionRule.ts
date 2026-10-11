import mongoose, { Schema } from 'mongoose'

export interface DbRetentionRule {
  _id: string
  facilityId: string
  category: string
  label: string
  description: string
  retentionDays: number
  scope: string
  enabled: boolean
  version: string
  updatedAt: string
  updatedBy: string
}

const RetentionRuleSchema = new Schema<DbRetentionRule>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    category: { type: String, required: true, index: true, unique: true },
    label: { type: String, required: true },
    description: { type: String, required: true },
    retentionDays: { type: Number, required: true, min: 0 },
    scope: { type: String, required: true },
    enabled: { type: Boolean, required: true },
    version: { type: String, required: true },
    updatedAt: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const RetentionRuleModel = mongoose.model<DbRetentionRule>('RetentionRule', RetentionRuleSchema, 'retention_rules')
