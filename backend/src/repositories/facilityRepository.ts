import { FacilityModel, type DbFacility } from '../db/models/FacilityModel'
import { UserModel } from '../db/models/User'
import { PatientSessionModel } from '../db/models/PatientSession'
import { ExtractedReportModel } from '../db/models/ExtractedReport'
import { ExtractedVisualModel } from '../db/models/ExtractedVisual'
import { AuditEntryModel } from '../db/models/AuditEntry'
import type { Facility } from '../types/facility.types'

/** Mongo-backed facility registry (P1-10). */

function toDoc(facility: Facility): DbFacility {
  return {
    _id: facility.id,
    id: facility.id,
    name: facility.name,
    type: facility.type,
    status: facility.status,
    region: facility.region ?? null,
    district: facility.district ?? null,
    state: facility.state ?? null,
    contactRef: facility.contactRef ?? null,
    createdAt: facility.createdAt,
    updatedAt: facility.updatedAt,
    createdBy: facility.createdBy,
    updatedBy: facility.updatedBy,
  }
}

function toFacility(doc: DbFacility): Facility {
  return {
    id: doc.id,
    name: doc.name,
    type: doc.type as Facility['type'],
    status: doc.status as Facility['status'],
    region: doc.region ?? undefined,
    district: doc.district ?? undefined,
    state: doc.state ?? undefined,
    contactRef: doc.contactRef ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
  }
}

export async function upsertFacility(facility: Facility): Promise<void> {
  await FacilityModel.replaceOne({ _id: facility.id }, toDoc(facility), { upsert: true })
}

export async function listPersistedFacilities(): Promise<Facility[]> {
  const docs = await FacilityModel.find().lean<DbFacility[]>().exec()
  return docs.map(toFacility)
}

export async function deleteFacility(id: string): Promise<void> {
  await FacilityModel.deleteOne({ _id: id })
}

/** Counts the documents scoped to a facility for the stats card. */
export async function countFacilityDocuments(facilityId: string): Promise<{
  users: number
  sessions: number
  reports: number
  visuals: number
  auditEntries: number
}> {
  const [users, sessions, reports, visuals, auditEntries] = await Promise.all([
    UserModel.countDocuments({ facilityId }).exec(),
    PatientSessionModel.countDocuments({ facilityId }).exec(),
    ExtractedReportModel.countDocuments({ facilityId }).exec(),
    ExtractedVisualModel.countDocuments({ facilityId }).exec(),
    AuditEntryModel.countDocuments({ facilityId }).exec(),
  ])
  return { users, sessions, reports, visuals, auditEntries }
}
