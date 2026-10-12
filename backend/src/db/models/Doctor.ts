import mongoose, { Schema } from 'mongoose'
import { CONSULTATION_TYPES } from '../../types/appointment.types'

export interface DbDoctor {
  _id: string
  id: string
  userId: string
  facilityId: string
  departmentId: string
  name: string
  specialization: string
  qualifications?: string[] | null
  experienceYears?: number | null
  consultationType: string
  photoInitials?: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

const DoctorSchema = new Schema<DbDoctor>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    userId: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    departmentId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    qualifications: { type: [String], default: null },
    experienceYears: { type: Number, default: null },
    consultationType: { type: String, enum: CONSULTATION_TYPES, required: true },
    photoInitials: { type: String, default: null },
    active: { type: Boolean, required: true, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

DoctorSchema.index({ facilityId: 1, departmentId: 1 })

export const DoctorModel = mongoose.model<DbDoctor>('Doctor', DoctorSchema, 'doctors')