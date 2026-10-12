import { AppointmentNotificationModel, type DbAppointmentNotification } from '../db/models/AppointmentNotification'
import type { AppointmentNotification } from '../types/appointment.types'

function toDoc(notification: AppointmentNotification): DbAppointmentNotification {
  return {
    _id: notification.id,
    id: notification.id,
    userId: notification.userId,
    facilityId: notification.facilityId,
    kind: notification.kind,
    title: notification.title,
    message: notification.message,
    appointmentId: notification.appointmentId,
    bookingReference: notification.bookingReference,
    read: notification.read,
    createdAt: notification.createdAt,
  }
}

function toNotification(doc: DbAppointmentNotification): AppointmentNotification {
  return {
    id: doc.id,
    userId: doc.userId,
    facilityId: doc.facilityId,
    kind: doc.kind as AppointmentNotification['kind'],
    title: doc.title,
    message: doc.message,
    appointmentId: doc.appointmentId,
    bookingReference: doc.bookingReference,
    read: doc.read,
    createdAt: doc.createdAt,
  }
}

export async function upsertAppointmentNotification(notification: AppointmentNotification): Promise<void> {
  await AppointmentNotificationModel.replaceOne({ _id: notification.id }, toDoc(notification), { upsert: true })
}

export async function listPersistedAppointmentNotifications(): Promise<AppointmentNotification[]> {
  const docs = await AppointmentNotificationModel.find().lean<DbAppointmentNotification[]>().exec()
  return docs.map(toNotification)
}