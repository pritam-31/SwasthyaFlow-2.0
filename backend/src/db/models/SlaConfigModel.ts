import mongoose, { Schema } from 'mongoose'

/** Per-facility SLA thresholds in minutes (P1-11). One document per facility. */
export interface DbSlaConfig {
  _id: string
  facilityId: string
  critical: number
  high: number
  medium: number
  low: number
  routine: number
  updatedAt: string
  updatedBy: string
}

const SlaConfigSchema = new Schema<DbSlaConfig>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, unique: true },
    critical: { type: Number, required: true },
    high: { type: Number, required: true },
    medium: { type: Number, required: true },
    low: { type: Number, required: true },
    routine: { type: Number, required: true },
    updatedAt: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const SlaConfigModel = mongoose.model<DbSlaConfig>('SlaConfig', SlaConfigSchema, 'sla_configs')
