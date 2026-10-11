import mongoose, { Schema } from 'mongoose'

export interface DbExtractedVisual {
  _id: string
  facilityId: string
  id: string
  sessionId: string
  patientId: string
  fileName: string
  originalMimeType: string
  originalSizeBytes: number
  storedMimeType: string
  width: number
  height: number
  visualType: string
  status: string
  pii: any[]
  piiSummary: any
  extraction: any
  warnings: string[]
  disclaimer: string
  reviewedBy?: string | null
  reviewedByRole?: string | null
  reviewNote?: string | null
  rejectionReason?: string | null
  createdAt: string
  updatedAt: string
}

const ExtractedVisualSchema = new Schema<DbExtractedVisual>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    patientId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    originalMimeType: { type: String, required: true },
    originalSizeBytes: { type: Number, required: true },
    storedMimeType: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    visualType: { type: String, required: true },
    status: { type: String, required: true },
    pii: { type: Schema.Types.Mixed, required: true },
    piiSummary: { type: Schema.Types.Mixed, required: true },
    extraction: { type: Schema.Types.Mixed, required: true },
    warnings: { type: [String], required: true },
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

export const ExtractedVisualModel = mongoose.model<DbExtractedVisual>('ExtractedVisual', ExtractedVisualSchema, 'extracted_visuals')
