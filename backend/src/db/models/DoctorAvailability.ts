import mongoose, { Schema } from 'mongoose'

export interface DbAvailabilityWindow {
  _id: string
  id: string
  doctorId: string
  facilityId: string
  kind: 'weekly' | 'date'
  dayOfWeek?: number | null
  date?: string | null
  leave?: boolean | null
  startTime: string
  endTime: string
  durationMinutes: number
  breakStart?: string | null
  breakEnd?: string | null
  maxAppointmentsPerDay?: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

const AvailabilitySchema = new Schema<DbAvailabilityWindow>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    doctorId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    kind: { type: String, enum: ['weekly', 'date'], required: true },
    dayOfWeek: { type: Number, default: null },
    date: { type: String, default: null },
    leave: { type: Boolean, default: null },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    breakStart: { type: String, default: null },
    breakEnd: { type: String, default: null },
    maxAppointmentsPerDay: { type: Number, default: null },
    active: { type: Boolean, required: true, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

AvailabilitySchema.index({ doctorId: 1, kind: 1, active: 1 })

export const DoctorAvailabilityModel = mongoose.model<DbAvailabilityWindow>(
  'DoctorAvailability',
  AvailabilitySchema,
  'doctor_availability',
)