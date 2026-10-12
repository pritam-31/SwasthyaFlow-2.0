import { DoctorAvailabilityModel, type DbAvailabilityWindow } from '../db/models/DoctorAvailability'
import type { AvailabilityWindow } from '../types/appointment.types'

function toDoc(window: AvailabilityWindow): DbAvailabilityWindow {
  return {
    _id: window.id,
    id: window.id,
    doctorId: window.doctorId,
    facilityId: window.facilityId,
    kind: window.kind,
    dayOfWeek: window.dayOfWeek ?? null,
    date: window.date ?? null,
    leave: window.leave ?? null,
    startTime: window.startTime,
    endTime: window.endTime,
    durationMinutes: window.durationMinutes,
    breakStart: window.breakStart ?? null,
    breakEnd: window.breakEnd ?? null,
    maxAppointmentsPerDay: window.maxAppointmentsPerDay ?? null,
    active: window.active,
    createdAt: window.createdAt,
    updatedAt: window.updatedAt,
  }
}

function toWindow(doc: DbAvailabilityWindow): AvailabilityWindow {
  return {
    id: doc.id,
    doctorId: doc.doctorId,
    facilityId: doc.facilityId,
    kind: doc.kind,
    dayOfWeek: doc.dayOfWeek ?? undefined,
    date: doc.date ?? undefined,
    leave: doc.leave ?? undefined,
    startTime: doc.startTime,
    endTime: doc.endTime,
    durationMinutes: doc.durationMinutes,
    breakStart: doc.breakStart ?? undefined,
    breakEnd: doc.breakEnd ?? undefined,
    maxAppointmentsPerDay: doc.maxAppointmentsPerDay ?? undefined,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function upsertAvailabilityWindow(window: AvailabilityWindow): Promise<void> {
  await DoctorAvailabilityModel.replaceOne({ _id: window.id }, toDoc(window), { upsert: true })
}

export async function listPersistedAvailability(): Promise<AvailabilityWindow[]> {
  const docs = await DoctorAvailabilityModel.find().lean<DbAvailabilityWindow[]>().exec()
  return docs.map(toWindow)
}

export async function deleteAvailabilityWindow(id: string): Promise<void> {
  await DoctorAvailabilityModel.deleteOne({ _id: id })
}