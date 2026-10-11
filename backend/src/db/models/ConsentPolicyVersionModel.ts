import mongoose, { Schema } from 'mongoose'

/**
 * Consent policy versions (P2-17).
 *
 * A patient consents to a named policy version. When a new version is
 * published, an existing consent can be upgraded explicitly (patient-owned),
 * and the upgrade is recorded as a consent event. Version rows are immutable
 * after publication.
 */
export interface DbConsentPolicyVersion {
  _id: string
  version: string
  publishedAt: string
  publishedBy: string
  summary: string
}

const ConsentPolicyVersionSchema = new Schema<DbConsentPolicyVersion>(
  {
    _id: { type: String, required: true },
    version: { type: String, required: true, index: true, unique: true },
    publishedAt: { type: String, required: true },
    publishedBy: { type: String, required: true },
    summary: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const ConsentPolicyVersionModel = mongoose.model<DbConsentPolicyVersion>(
  'ConsentPolicyVersion',
  ConsentPolicyVersionSchema,
  'consent_policy_versions',
)
