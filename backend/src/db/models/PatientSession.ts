import mongoose, { Schema } from 'mongoose'

/**
 * The session aggregate is stored whole (so the in-memory stores can hydrate
 * from a single document) AND its parts are mirrored into their own
 * collections (triage_notes, extracted_reports, …) for querying. The aggregate
 * is authoritative; the sub-collections are derived.
 */
export interface DbPatientSession {
  _id: string
  id: string
  patientId: string
  language: string
  ageBand: string
  sex: string
  intakePoint: string
  facility: string
  facilityId: string
  displayText: string
  anonymization: unknown
  reports: unknown[]
  visuals: unknown[]
  note: unknown | null
  timeline: unknown | null
  overrides: unknown[]
  referral: unknown | null
  pendingUploads: unknown[]
  status: string
  ownerId: string
  createdBy: string
  createdByRole: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  consentRecordId?: string | null
  assignedTo?: string | null
  assignedToName?: string | null
  seeded: boolean
}

const PatientSessionSchema = new Schema<DbPatientSession>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    patientId: { type: String, required: true, index: true },
    language: { type: String, required: true },
    ageBand: { type: String, required: true },
    sex: { type: String, required: true },
    intakePoint: { type: String, required: true },
    facility: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    displayText: { type: String, required: true },
    anonymization: { type: Schema.Types.Mixed, required: true },
    reports: { type: Schema.Types.Mixed, required: true, default: [] },
    visuals: { type: Schema.Types.Mixed, required: true, default: [] },
    note: { type: Schema.Types.Mixed, default: null },
    timeline: { type: Schema.Types.Mixed, default: null },
    overrides: { type: Schema.Types.Mixed, required: true, default: [] },
    referral: { type: Schema.Types.Mixed, default: null },
    pendingUploads: { type: Schema.Types.Mixed, required: true, default: [] },
    status: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    createdByRole: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
    deletedAt: { type: String, default: null },
    consentRecordId: { type: String, default: null },
    assignedTo: { type: String, default: null },
    assignedToName: { type: String, default: null },
    seeded: { type: Boolean, required: true, default: false },
  },
  { versionKey: false, _id: false },
)

export const PatientSessionModel = mongoose.model<DbPatientSession>('PatientSession', PatientSessionSchema, 'patient_sessions')
