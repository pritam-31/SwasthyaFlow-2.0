import mongoose, { Schema } from 'mongoose'

/**
 * Refresh tokens are stored hashed only (sha256). A token family groups every
 * rotation of one login; reusing a consumed token revokes the whole family
 * (reuse-detection, P1-12). A TTL index expires rows at `expiresAt`.
 */
export interface DbRefreshToken {
  _id: string
  tokenId: string
  userId: string
  sessionId: string
  tokenHash: string
  familyId: string
  issuedAt: Date
  expiresAt: Date
  usedAt?: Date | null
  revokedAt?: Date | null
  reason?: string | null
}

const RefreshTokenSchema = new Schema<DbRefreshToken>(
  {
    _id: { type: String, required: true },
    tokenId: { type: String, required: true, index: true, unique: true },
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true, unique: true },
    familyId: { type: String, required: true, index: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, required: false, default: null },
    revokedAt: { type: Date, required: false, default: null },
    reason: { type: String, required: false, default: null },
  },
  { versionKey: false, _id: false },
)

export const RefreshTokenModel = mongoose.model<DbRefreshToken>(
  'RefreshToken',
  RefreshTokenSchema,
  'refresh_tokens',
)
