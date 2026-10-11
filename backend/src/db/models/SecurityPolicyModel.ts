import mongoose, { Schema } from 'mongoose'

/**
 * Per-facility security policy (P1-12). `facilityId = 'global'` is the
 * system-wide default that every other facility inherits unless it overrides.
 * Secret material is never stored here.
 */
export interface DbSecurityPolicy {
  _id: string
  policyId: string
  facilityId: string
  password: Record<string, unknown>
  lockout: Record<string, unknown>
  session: Record<string, unknown>
  twoFactor: Record<string, unknown>
  ipAllowlist: Record<string, unknown>
  rateLimit: Record<string, unknown>
  updatedAt: string
  updatedBy: string
}

const SecurityPolicySchema = new Schema<DbSecurityPolicy>(
  {
    _id: { type: String, required: true },
    policyId: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true, unique: true },
    password: { type: Schema.Types.Mixed, required: true },
    lockout: { type: Schema.Types.Mixed, required: true },
    session: { type: Schema.Types.Mixed, required: true },
    twoFactor: { type: Schema.Types.Mixed, required: true },
    ipAllowlist: { type: Schema.Types.Mixed, required: true },
    rateLimit: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const SecurityPolicyModel = mongoose.model<DbSecurityPolicy>(
  'SecurityPolicy',
  SecurityPolicySchema,
  'security_policies',
)
