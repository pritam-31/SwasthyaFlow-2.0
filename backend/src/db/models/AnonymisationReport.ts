import mongoose, { Schema } from 'mongoose'

export interface DbAnonymisationReport {
  _id: string
  facilityId: string
  id: string
  sessionId?: string | null
  sourceModality: string
  matches: unknown[]
  redactedCount: number
  warnings: string[]
  coverage: unknown
  createdAt: string
  actorId: string
  actorRole: string
  language?: string | null
}

const AnonymisationReportSchema = new Schema<DbAnonymisationReport>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, index: true },
    sourceModality: { type: String, required: true, index: true },
    matches: { type: Schema.Types.Mixed, required: true },
    redactedCount: { type: Number, required: true },
    warnings: { type: [String], required: true },
    coverage: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, required: true, index: true },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    language: { type: String },
  },
  { versionKey: false, _id: false },
)

export const AnonymisationReportModel = mongoose.model<DbAnonymisationReport>('AnonymisationReport', AnonymisationReportSchema, 'anonymisation_reports')
