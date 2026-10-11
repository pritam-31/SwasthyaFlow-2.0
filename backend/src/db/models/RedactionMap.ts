import mongoose, { Schema } from 'mongoose'

export interface DbRedactionMap {
  _id: string
  sessionId: string
  createdAt: string
  entries: Array<{ category: string; count: number }>
}

const RedactionMapSchema = new Schema<DbRedactionMap>(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true, unique: true },
    createdAt: { type: String, required: true },
    entries: {
      type: [
        {
          category: { type: String, required: true },
          count: { type: Number, required: true },
        },
      ],
      required: true,
    },
  },
  { versionKey: false, _id: false },
)

export const RedactionMapModel = mongoose.model<DbRedactionMap>('RedactionMap', RedactionMapSchema, 'redaction_maps')
