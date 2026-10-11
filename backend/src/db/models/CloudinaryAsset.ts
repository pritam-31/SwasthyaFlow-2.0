import mongoose, { Schema } from 'mongoose'

export interface DbCloudinaryAsset {
  _id: string
  facilityId: string
  id: string
  publicId: string
  secureUrl: string
  resourceType: string
  format: string
  bytes: number
  width: number
  height: number
  folder: 'swasthyaflow/visuals-redacted' | 'swasthyaflow/reports-source' | 'swasthyaflow/exports'
  category: 'visual-redacted' | 'report-source' | 'export'
  sessionId?: string | null
  visualId?: string | null
  reportId?: string | null
  createdAt: string
  tombstonedAt?: string | null
}

const CloudinaryAssetSchema = new Schema<DbCloudinaryAsset>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    publicId: { type: String, required: true, unique: true },
    secureUrl: { type: String, required: true },
    resourceType: { type: String, required: true },
    format: { type: String, required: true },
    bytes: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    folder: { type: String, enum: ['swasthyaflow/visuals-redacted','swasthyaflow/reports-source','swasthyaflow/exports'], required: true },
    category: { type: String, enum: ['visual-redacted','report-source','export'], required: true },
    sessionId: { type: String, index: true },
    visualId: { type: String },
    reportId: { type: String },
    createdAt: { type: String, required: true, index: true },
    tombstonedAt: { type: String },
  },
  { versionKey: false, _id: false },
)

export const CloudinaryAssetModel = mongoose.model<DbCloudinaryAsset>('CloudinaryAsset', CloudinaryAssetSchema, 'cloudinary_assets')
