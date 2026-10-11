import mongoose, { Schema } from 'mongoose'
import { FACILITY_TYPES, FACILITY_STATUSES } from '../../types/facility.types'

export interface DbFacility {
  _id: string
  id: string
  name: string
  type: string
  status: string
  region?: string | null
  district?: string | null
  state?: string | null
  contactRef?: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

const FacilitySchema = new Schema<DbFacility>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: FACILITY_TYPES, required: true, index: true },
    status: { type: String, enum: FACILITY_STATUSES, required: true, index: true },
    region: { type: String, default: null },
    district: { type: String, default: null },
    state: { type: String, default: null },
    contactRef: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const FacilityModel = mongoose.model<DbFacility>('Facility', FacilitySchema, 'facilities')
