import mongoose, { Schema } from 'mongoose'
import { APPOINTMENT_STATUSES } from '../../types/appointment.types'

export interface DbAppointmentAudit {
  _id: string
  id: string
  appointmentId: string
  bookingReference: string
  facilityId: string
  previousStatus?: string | null
  newStatus: string
  action: string
  actor: string
  actorRole: string
  reason?: string | null
  at: string
}

const AppointmentAuditSchema = new Schema<DbAppointmentAudit>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    appointmentId: { type: String, required: true, index: true },
    bookingReference: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    previousStatus: { type: String, enum: [...APPOINTMENT_STATUSES, 'none'], default: 'none' },
    newStatus: { type: String, enum: APPOINTMENT_STATUSES, required: true },
    action: { type: String, required: true },
    actor: { type: String, required: true },
    actorRole: { type: String, required: true },
    reason: { type: String, default: null },
    at: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

AppointmentAuditSchema.index({ appointmentId: 1, at: -1 })

export const AppointmentAuditModel = mongoose.model<DbAppointmentAudit>(
  'AppointmentAudit',
  AppointmentAuditSchema,
  'appointment_audits',
)