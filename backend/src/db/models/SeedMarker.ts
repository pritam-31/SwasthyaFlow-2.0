import mongoose, { Schema } from 'mongoose'

export interface DbSeedMarker {
  _id: string
  name: string
  version: string
  seededAt: string
}

const SeedMarkerSchema = new Schema<DbSeedMarker>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, index: true, unique: true },
    version: { type: String, required: true },
    seededAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const SeedMarkerModel = mongoose.model<DbSeedMarker>('SeedMarker', SeedMarkerSchema, 'seed_markers')
