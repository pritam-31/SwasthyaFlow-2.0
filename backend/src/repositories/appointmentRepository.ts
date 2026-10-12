import { AppointmentModel, type DbAppointment } from '../db/models/Appointment'
import type { Appointment, AppointmentStatus, AppointmentActor } from '../types/appointment.types'

function toDoc(appointment: Appointment): DbAppointment {
  return {
    _id: appointment.id,
    id: appointment.id,
    bookingReference: appointment.bookingReference,
    facilityId: appointment.facilityId,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName,
    departmentId: appointment.departmentId,
    departmentName: appointment.departmentName,
    sessionId: appointment.sessionId ?? null,
    referralId: appointment.referralId ?? null,
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    durationMinutes: appointment.durationMinutes,
    visitReason: appointment.visitReason,
    consultationType: appointment.consultationType,
    bookingMode: appointment.bookingMode,
    status: appointment.status,
    priority: appointment.priority,
    slotKey: appointment.slotKey,
    active: appointment.active,
    cancellationReason: appointment.cancellationReason ?? null,
    rescheduleRequest: appointment.rescheduleRequest ?? null,
    createdBy: appointment.createdBy,
    createdByRole: appointment.createdByRole,
    checkedInAt: appointment.checkedInAt ?? null,
    completedAt: appointment.completedAt ?? null,
    noShowAt: appointment.noShowAt ?? null,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  }
}

function toAppointment(doc: DbAppointment): Appointment {
  return {
    id: doc.id,
    bookingReference: doc.bookingReference,
    facilityId: doc.facilityId,
    patientId: doc.patientId,
    patientName: doc.patientName,
    doctorId: doc.doctorId,
    doctorName: doc.doctorName,
    departmentId: doc.departmentId,
    departmentName: doc.departmentName,
    sessionId: doc.sessionId ?? null,
    referralId: doc.referralId ?? null,
    appointmentDate: doc.appointmentDate,
    startTime: doc.startTime,
    endTime: doc.endTime,
    durationMinutes: doc.durationMinutes,
    visitReason: doc.visitReason,
    consultationType: doc.consultationType as Appointment['consultationType'],
    bookingMode: doc.bookingMode as Appointment['bookingMode'],
    status: doc.status as AppointmentStatus,
    priority: doc.priority as Appointment['priority'],
    slotKey: doc.slotKey,
    active: doc.active,
    cancellationReason: doc.cancellationReason ?? undefined,
    rescheduleRequest: doc.rescheduleRequest ?? null,
    createdBy: doc.createdBy,
    createdByRole: doc.createdByRole,
    checkedInAt: doc.checkedInAt ?? undefined,
    completedAt: doc.completedAt ?? undefined,
    noShowAt: doc.noShowAt ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function upsertAppointment(appointment: Appointment): Promise<void> {
  await AppointmentModel.replaceOne({ _id: appointment.id }, toDoc(appointment), { upsert: true })
}

export async function listPersistedAppointments(): Promise<Appointment[]> {
  const docs = await AppointmentModel.find().lean<DbAppointment[]>().exec()
  return docs.map(toAppointment)
}

export async function deleteAppointment(id: string): Promise<void> {
  await AppointmentModel.deleteOne({ _id: id })
}

export type { AppointmentActor }