import mongoose, { Schema } from 'mongoose'

/**
 * Append-only consent event trail (P2-17).
 *
 * One row per grant / revoke / re-grant / version-upgrade. Reasons are
 * anonymised + non-diagnostic-checked before they reach this store; the row
 * never carries raw patient text. Events outlive the case they describe.
 */
export interface DbConsentEvent {
  _id: string
  facilityId: string
  consentRecordId: string
  sessionId: string
  kind: string
  policyVersion: string
  purposes: string[]
  at: string
  actor: string
  actorRole: string
  reasonCode?: string | null
  reasonText?: string | null
  previousConsentId?: string | null
}

const ConsentEventSchema = new Schema<DbConsentEvent>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    consentRecordId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    kind: { type: String, required: true },
    policyVersion: { type: String, required: true },
    purposes: { type: [String], required: true },
    at: { type: String, required: true, index: true },
    actor: { type: String, required: true },
    actorRole: { type: String, required: true },
    reasonCode: { type: String },
    reasonText: { type: String },
    previousConsentId: { type: String },
  },
  { versionKey: false, _id: false },
)

export const ConsentEventModel = mongoose.model<DbConsentEvent>('ConsentEvent', ConsentEventSchema, 'consent_events')
