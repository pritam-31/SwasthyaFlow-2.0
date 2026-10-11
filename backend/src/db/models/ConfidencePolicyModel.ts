import mongoose, { Schema } from 'mongoose'

/**
 * Per-facility confidence thresholds (P2-14). `facilityId = 'global'` is the
 * system-wide default every other facility inherits unless it overrides.
 *
 * A policy holds only numeric workflow thresholds — never patient data, never
 * raw text, never anything clinical. Values are validated against fixed bounds
 * by `confidencePolicyService` before they reach this store.
 */
export interface DbConfidencePolicy {
  _id: string
  policyId: string
  facilityId: string
  thresholds: Record<string, unknown>
  updatedAt: string
  updatedBy: string
}

const ConfidencePolicySchema = new Schema<DbConfidencePolicy>(
  {
    _id: { type: String, required: true },
    policyId: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true, unique: true },
    thresholds: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const ConfidencePolicyModel = mongoose.model<DbConfidencePolicy>(
  'ConfidencePolicy',
  ConfidencePolicySchema,
  'confidence_policies',
)
