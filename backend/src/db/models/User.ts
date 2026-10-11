import mongoose, { Schema } from 'mongoose'

export interface DbUser {
  _id: string
  username: string
  displayName: string
  role: 'patient' | 'nurse' | 'doctor' | 'admin' | 'system-admin' | 'facility-admin'
  facilityId: string
  createdAt: string
  passwordHash: string
  salt: string
  deactivatedAt?: string | null
  /** P1-12: 'scrypt' (legacy) or 'argon2id'. Upgraded on next successful login. */
  passwordAlgorithm?: string | null
  passwordChangedAt?: string | null
  lastLoginAt?: string | null
  lastLoginIp?: string | null
  failedLoginCount?: number | null
  lockedUntil?: string | null
  twoFactorEnabled?: boolean | null
  /** AES-256-GCM ciphertext — never the plaintext TOTP secret. */
  twoFactorSecret?: string | null
  /** Bumped on role change so live sessions can be forced to re-login. */
  roleChangedAt?: string | null
  /** Bumped when the user's home facility changes (forces re-login). */
  facilityChangedAt?: string | null
}

const UserSchema = new Schema<DbUser>(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true, index: true, unique: true },
    displayName: { type: String, required: true },
    role: {
      type: String,
      enum: ['patient', 'nurse', 'doctor', 'admin', 'system-admin', 'facility-admin'],
      required: true,
    },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    createdAt: { type: String, required: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    deactivatedAt: { type: String, required: false, default: null },
    passwordAlgorithm: { type: String, required: false, default: 'scrypt' },
    passwordChangedAt: { type: String, required: false, default: null },
    lastLoginAt: { type: String, required: false, default: null },
    lastLoginIp: { type: String, required: false, default: null },
    failedLoginCount: { type: Number, required: false, default: 0 },
    lockedUntil: { type: String, required: false, default: null, index: true },
    twoFactorEnabled: { type: Boolean, required: false, default: false },
    twoFactorSecret: { type: String, required: false, default: null },
    roleChangedAt: { type: String, required: false, default: null },
    facilityChangedAt: { type: String, required: false, default: null },
  },
  { versionKey: false, _id: false },
)

export const UserModel = mongoose.model<DbUser>('User', UserSchema, 'users')
