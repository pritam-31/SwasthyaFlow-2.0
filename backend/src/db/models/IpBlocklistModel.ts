import mongoose, { Schema } from 'mongoose'

/**
 * IP blocklist (P1-12). Raw IP is stored here by necessity (the value that is
 * blocked). An optional `expiresAt` gives a TTL index for temporary bans.
 */
export interface DbIpBlocklistEntry {
  _id: string
  entryId: string
  ip: string
  reason: string
  blockedAt: Date
  expiresAt?: Date | null
  blockedBy: string
}

const IpBlocklistSchema = new Schema<DbIpBlocklistEntry>(
  {
    _id: { type: String, required: true },
    entryId: { type: String, required: true, index: true, unique: true },
    ip: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    blockedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: false, default: null, index: { expireAfterSeconds: 0 } },
    blockedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const IpBlocklistModel = mongoose.model<DbIpBlocklistEntry>(
  'IpBlocklist',
  IpBlocklistSchema,
  'ip_blocklist',
)
