import mongoose, { Schema } from 'mongoose'

/**
 * Known device per user (soft binding, P1-12). The fingerprint is a hash — the
 * raw client attributes are never stored. (userId, fingerprintHash) is unique.
 */
export interface DbDevice {
  _id: string
  deviceId: string
  userId: string
  fingerprintHash: string
  userAgent: string
  firstSeenAt: Date
  lastSeenAt: Date
  ip: string
  revokedAt?: Date | null
}

const DeviceSchema = new Schema<DbDevice>(
  {
    _id: { type: String, required: true },
    deviceId: { type: String, required: true, index: true, unique: true },
    userId: { type: String, required: true, index: true },
    fingerprintHash: { type: String, required: true, index: true },
    userAgent: { type: String, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    ip: { type: String, required: true },
    revokedAt: { type: Date, required: false, default: null },
  },
  { versionKey: false, _id: false },
)

DeviceSchema.index({ userId: 1, fingerprintHash: 1 }, { unique: true })

export const DeviceModel = mongoose.model<DbDevice>('Device', DeviceSchema, 'devices')
