import mongoose, { Schema } from 'mongoose'

export interface DbExtractedReport {
  _id: string
  facilityId: string
  id: string
  sessionId: string
  patientId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  source: string
  type: string
  language: string
  reportDate?: string | null
  status: string
  redactedText: string
  anonymization: any
  labValues: any[]
  vitals: any[]
  findings: string[]
  warnings: string[]
  ocr: any
  disclaimer: string
  reviewedBy?: string | null
  reviewedByRole?: string | null
  reviewNote?: string | null
  rejectionReason?: string | null
  createdAt: string
  updatedAt: string
}

const ExtractedReportSchema = new Schema<DbExtractedReport>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    source: { type: String, required: true },
    type: { type: String, required: true },
    language: { type: String, required: true },
    reportDate: { type: String },
    status: { type: String, required: true },
    redactedText: { type: String, required: true },
    anonymization: { type: Schema.Types.Mixed, required: true },
    labValues: { type: Schema.Types.Mixed, required: true },
    vitals: { type: Schema.Types.Mixed, required: true },
    findings: { type: [String], required: true },
    warnings: { type: [String], required: true },
    ocr: { type: Schema.Types.Mixed, required: true },
    disclaimer: { type: String, required: true },
    reviewedBy: { type: String },
    reviewedByRole: { type: String },
    reviewNote: { type: String },
    rejectionReason: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const ExtractedReportModel = mongoose.model<DbExtractedReport>('ExtractedReport', ExtractedReportSchema, 'extracted_reports')
