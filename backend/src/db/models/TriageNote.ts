import mongoose, { Schema } from 'mongoose'

export interface DbTriageNote {
  _id: string
  facilityId: string
  id: string
  sessionId: string
  structuredNote: any
  observations: string[]
  urgencyFlags: any[]
  missingInformation: any[]
  followUpQuestions: any[]
  riskScore: string
  status: string
  language?: string | null
  generatedAt: string
  disclaimer: string
  createdAt: string
  updatedAt: string
}

const TriageNoteSchema = new Schema<DbTriageNote>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true, unique: true },
    structuredNote: { type: Schema.Types.Mixed, required: true },
    observations: { type: [String], required: true },
    urgencyFlags: { type: Schema.Types.Mixed, required: true },
    missingInformation: { type: Schema.Types.Mixed, required: true },
    followUpQuestions: { type: Schema.Types.Mixed, required: true },
    riskScore: { type: String, required: true },
    status: { type: String, required: true },
    language: { type: String },
    generatedAt: { type: String, required: true },
    disclaimer: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const TriageNoteModel = mongoose.model<DbTriageNote>('TriageNote', TriageNoteSchema, 'triage_notes')
