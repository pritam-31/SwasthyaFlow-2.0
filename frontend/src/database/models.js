import mongoose from 'mongoose'

export interface ICase {
  patientId: string
  chiefConcern: string
  urgency: 'urgent' | 'prompt' | 'routine'
  reviewStatus: 'awaiting-nurse' | 'awaiting-doctor' | 'reviewed' | 'closed'
  createdAt: string
  language: string
  mode: 'in-person' | 'video' | 'questionnaire'
  mode?: string
  urgencySignals?: Array<{ label: string; level: 'urgent' | 'prompt' | 'routine' }>
  corrections?: Array<{ param: string; value: string; unit: string }>
  missingInfo?: string[]
}

export interface IReport {
  name: string
  caseId: string
  kind: 'pdf' | 'image' | 'xray'
  ocrStatus: 'pending' | 'in-progress' | 'done' | 'failed'
  fields?: Array<{ param: string; value: string; unit: string; referenceRange: string }>
  verified?: boolean
  verifiedCount?: number
  verifiedRatio?: number
}

export interface IUser {
  username: string
  displayName: string
  password: string
  role: 'patient' | 'nurse' | 'doctor' | 'admin'
  facility?: string
  createdAt?: string
}

export interface IAuditEvent {
  id: string
  caseId: string
  time: string
  actor: string
  role: string
  action: string
}

export const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  facility: { type: String },
  createdAt: { type: Date, default: Date.now },
})

export const CaseSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  chiefConcern: { type: String, required: true },
  urgency: { type: String, required: true },
  reviewStatus: { type: String, required: true },
  createdAt: { type: String, required: true },
  language: { type: String, required: true },
  mode: { type: String, required: true },
  urgencySignals: { type: Array },
  corrections: { type: Array },
  missingInfo: { type: Array },
})

export const ReportSchema = new mongoose.Schema({
  name: { type: String, required: true },
  caseId: { type: String, required: true },
  kind: { type: String, required: true },
  ocrStatus: { type: String, required: true },
  fields: { type: Array },
  verified: { type: Boolean, default: false },
  verifiedCount: { type: Number, default: 0 },
  verifiedRatio: { type: Number, default: 0 },
})

export const AuditSchema = new mongoose.Schema({
  caseId: { type: String, required: true },
  time: { type: String, required: true },
  actor: { type: String, required: true },
  role: { type: String, required: true },
  action: { type: String, required: true },
})

export const User = mongoose.model('User', UserSchema)
export const Case = mongoose.model('Case', CaseSchema)
export const Report = mongoose.model('Report', ReportSchema)
export const Audit = mongoose.model('Audit', AuditSchema)

export interface DBConnection {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  User: typeof User
  Case: typeof Case
  Report: typeof Report
  Audit: typeof Audit
}