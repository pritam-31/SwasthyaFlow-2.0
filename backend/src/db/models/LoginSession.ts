import mongoose, { Schema } from 'mongoose'

export interface DbLoginSession {
  _id: string
  token: string
  userId: string
  expiresAt: string
  /** Session metadata (P1-12) — raw UA/IP only where operationally needed. */
  ip?: string | null
  userAgent?: string | null
  deviceFingerprintHash?: string | null
  lastSeenAt?: string | null
  revokedAt?: string | null
  revokedReason?: string | null
}

const LoginSessionSchema = new Schema<DbLoginSession>(
  {
    _id: { type: String, required: true },
    token: { type: String, required: true, index: true, unique: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: String, required: true },
    ip: { type: String, required: false, default: null },
    userAgent: { type: String, required: false, default: null },
    deviceFingerprintHash: { type: String, required: false, default: null },
    lastSeenAt: { type: String, required: false, default: null },
    revokedAt: { type: String, required: false, default: null },
    revokedReason: { type: String, required: false, default: null },
  },
  { versionKey: false, _id: false },
)

LoginSessionSchema.index({ userId: 1, revokedAt: 1 })

export const LoginSessionModel = mongoose.model<DbLoginSession>('LoginSession', LoginSessionSchema, 'login_sessions')
