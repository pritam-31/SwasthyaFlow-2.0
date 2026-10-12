import { AppointmentAuditModel, type DbAppointmentAudit } from '../db/models/AppointmentAudit'
import type { AppointmentAuditEntry, AppointmentStatus } from '../types/appointment.types'

function toDoc(entry: AppointmentAuditEntry): DbAppointmentAudit {
  return {
    _id: entry.id,
    id: entry.id,
    appointmentId: entry.appointmentId,
    bookingReference: entry.bookingReference,
    facilityId: entry.facilityId,
    previousStatus: entry.previousStatus ?? 'none',
    newStatus: entry.newStatus,
    action: entry.action,
    actor: entry.actor,
    actorRole: entry.actorRole,
    reason: entry.reason ?? null,
    at: entry.at,
  }
}

function toEntry(doc: DbAppointmentAudit): AppointmentAuditEntry {
  return {
    id: doc.id,
    appointmentId: doc.appointmentId,
    bookingReference: doc.bookingReference,
    facilityId: doc.facilityId,
    previousStatus: doc.previousStatus === 'none' ? undefined : (doc.previousStatus as AppointmentStatus),
    newStatus: doc.newStatus as AppointmentStatus,
    action: doc.action,
    actor: doc.actor,
    actorRole: doc.actorRole,
    reason: doc.reason ?? undefined,
    at: doc.at,
  }
}

export async function upsertAppointmentAudit(entry: AppointmentAuditEntry): Promise<void> {
  await AppointmentAuditModel.replaceOne({ _id: entry.id }, toDoc(entry), { upsert: true })
}

export async function listPersistedAppointmentAudits(): Promise<AppointmentAuditEntry[]> {
  const docs = await AppointmentAuditModel.find().lean<DbAppointmentAudit[]>().exec()
  return docs.map(toEntry)
}