import mongoose, { Schema } from 'mongoose'

export interface DbConsentRecord {
  _id: string
  facilityId: string
  consentRecordId: string
  sessionId: string
  policyVersion: string
  purposes: string[]
  grantedAt: string
  grantedBy: string
  grantedByRole: string
  revokedAt?: string | null
  revokedBy?: string | null
  revokedByRole?: string | null
  retentionLinkedAt: string
  withdrawalReasonCode?: string | null
  withdrawalReasonText?: string | null
  previousConsentId?: string | null
  supersededByConsentId?: string | null
}

const ConsentRecordSchema = new Schema<DbConsentRecord>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    consentRecordId: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true, unique: true },
    policyVersion: { type: String, required: true },
    purposes: { type: [String], required: true },
    grantedAt: { type: String, required: true, index: true },
    grantedBy: { type: String, required: true },
    grantedByRole: { type: String, required: true },
    revokedAt: { type: String },
    revokedBy: { type: String },
    revokedByRole: { type: String },
    retentionLinkedAt: { type: String, required: true },
    withdrawalReasonCode: { type: String },
    withdrawalReasonText: { type: String },
    previousConsentId: { type: String },
    supersededByConsentId: { type: String },
  },
  { versionKey: false, _id: false },
)

export const ConsentRecordModel = mongoose.model<DbConsentRecord>('ConsentRecord', ConsentRecordSchema, 'consent_records')
