import mongoose, { Schema } from 'mongoose'
import { APPOINTMENT_STATUSES, BOOKING_MODES, CONSULTATION_TYPES, APPOINTMENT_PRIORITIES } from '../../types/appointment.types'

export interface DbAppointment {
  _id: string
  id: string
  bookingReference: string
  facilityId: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  departmentId: string
  departmentName: string
  sessionId?: string | null
  referralId?: string | null
  appointmentDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  visitReason: string
  consultationType: string
  bookingMode: string
  status: string
  priority: string
  slotKey: string
  active: boolean
  cancellationReason?: string | null
  rescheduleRequest?: {
    requestedDate?: string
    requestedStartTime?: string
    reason?: string
    requestedAt: string
    requestedBy: string
  } | null
  createdBy: string
  createdByRole: string
  checkedInAt?: string | null
  completedAt?: string | null
  noShowAt?: string | null
  createdAt: string
  updatedAt: string
}

const AppointmentSchema = new Schema<DbAppointment>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    bookingReference: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    patientId: { type: String, required: true, index: true },
    patientName: { type: String, required: true },
    doctorId: { type: String, required: true, index: true },
    doctorName: { type: String, required: true },
    departmentId: { type: String, required: true, index: true },
    departmentName: { type: String, required: true },
    sessionId: { type: String, default: null, index: true },
    referralId: { type: String, default: null, index: true },
    appointmentDate: { type: String, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    visitReason: { type: String, required: true },
    consultationType: { type: String, enum: CONSULTATION_TYPES, required: true },
    bookingMode: { type: String, enum: BOOKING_MODES, required: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, required: true, index: true },
    priority: { type: String, enum: APPOINTMENT_PRIORITIES, required: true },
    slotKey: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
    cancellationReason: { type: String, default: null },
    rescheduleRequest: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: String, required: true },
    createdByRole: { type: String, required: true },
    checkedInAt: { type: String, default: null },
    completedAt: { type: String, default: null },
    noShowAt: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

/**
 * Concurrency guard: a doctor, on a given date, at a given start time is
 * bookable by exactly ONE active appointment. Terminal rows (cancelled /
 * rejected / no-show) flip `active` to false and release the slot.
 */
AppointmentSchema.index(
  { facilityId: 1, slotKey: 1 },
  { unique: true, partialFilterExpression: { active: true } },
)
AppointmentSchema.index({ facilityId: 1, appointmentDate: 1 })
AppointmentSchema.index({ doctorId: 1, appointmentDate: 1 })
AppointmentSchema.index({ patientId: 1, appointmentDate: -1 })

export const AppointmentModel = mongoose.model<DbAppointment>('Appointment', AppointmentSchema, 'appointments')