import mongoose, { Schema } from 'mongoose'

export interface DbTimeline {
  _id: string
  facilityId: string
  id: string
  sessionId: string
  events: any[]
  summary: string
  language: string
  generatedAt: string
  status: string
  warnings: string[]
  createdAt: string
  updatedAt: string
}

const TimelineSchema = new Schema<DbTimeline>(
  {
    _id: { type: String, required: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true, unique: true },
    events: { type: Schema.Types.Mixed, required: true },
    summary: { type: String, required: true },
    language: { type: String, required: true },
    generatedAt: { type: String, required: true },
    status: { type: String, required: true },
    warnings: { type: [String], required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const TimelineModel = mongoose.model<DbTimeline>('Timeline', TimelineSchema, 'timelines')
