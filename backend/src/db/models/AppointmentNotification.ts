import mongoose, { Schema } from 'mongoose'

export interface DbAppointmentNotification {
  _id: string
  id: string
  userId: string
  facilityId: string
  kind: string
  title: string
  message: string
  appointmentId: string
  bookingReference: string
  read: boolean
  createdAt: string
}

const AppointmentNotificationSchema = new Schema<DbAppointmentNotification>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    userId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    appointmentId: { type: String, required: true, index: true },
    bookingReference: { type: String, required: true },
    read: { type: Boolean, required: true, default: false },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

AppointmentNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 })

export const AppointmentNotificationModel = mongoose.model<DbAppointmentNotification>(
  'AppointmentNotification',
  AppointmentNotificationSchema,
  'appointment_notifications',
)