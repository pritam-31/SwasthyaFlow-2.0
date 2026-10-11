import mongoose, { Schema } from 'mongoose'

/**
 * One row per processed idempotent write (P1-8). Only a hash of the payload is
 * ever stored — never the payload itself, so no PII can leak here. A TTL index
 * expires rows 24 h after creation.
 */
export interface DbIdempotencyKey {
  _id: string
  key: string
  facilityId: string
  payloadHash: string
  responseStatus: number
  responseBody: unknown
  /** Correlation id of the originating request (P1-12) — never PII. */
  requestId?: string | null
  createdAt: Date
  expiresAt: Date
}

const IdempotencyKeySchema = new Schema<DbIdempotencyKey>(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, default: 'facility-default' },
    payloadHash: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed, required: false },
    requestId: { type: String, required: false, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  {
    versionKey: false,
    _id: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.payloadHash
        return ret
      },
    },
  },
)

IdempotencyKeySchema.index({ facilityId: 1, key: 1 }, { unique: true })

export const IdempotencyKeyModel = mongoose.model<DbIdempotencyKey>(
  'IdempotencyKey',
  IdempotencyKeySchema,
  'idempotency_keys',
)
