import mongoose, { Schema } from 'mongoose'

/**
 * Fixed-window rate-limit counters (P1-12). Keys are hashed — raw IPs never
 * reach this collection. `expiresAt` drives a TTL index so counters self-clean
 * shortly after their window ends.
 */
export interface DbRateLimit {
  _id: string
  key: string
  windowStart: Date
  count: number
  expiresAt: Date
}

const RateLimitSchema = new Schema<DbRateLimit>(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, index: true, unique: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, _id: false },
)

RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimitModel = mongoose.model<DbRateLimit>('RateLimit', RateLimitSchema, 'rate_limits')