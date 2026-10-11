import mongoose, { Schema } from 'mongoose'

export interface DbReferral {
  _id: string
  facilityId: string
  id: string
  sessionId: string
  patientId: string
  fromFacility: string
  toFacility: string
  reasonForReferral: string
  urgency: string
  summary: string
  missingInformation: string[]
  openQuestions: string[]
  preparedBy: string
  preparedByRole: string
  approvedBy?: string | null
  status: 'draft' | 'approved'
  generatedAt: string
  disclaimer: string
}

const ReferralSchema = new Schema<DbReferral>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    fromFacility: { type: String, required: true },
    toFacility: { type: String, required: true },
    reasonForReferral: { type: String, required: true },
    urgency: { type: String, required: true },
    summary: { type: String, required: true },
    missingInformation: { type: [String], required: true },
    openQuestions: { type: [String], required: true },
    preparedBy: { type: String, required: true },
    preparedByRole: { type: String, required: true },
    approvedBy: { type: String, default: null },
    status: { type: String, required: true },
    generatedAt: { type: String, required: true },
    disclaimer: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const ReferralModel = mongoose.model<DbReferral>('Referral', ReferralSchema, 'referrals')
