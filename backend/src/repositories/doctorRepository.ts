import { DoctorModel, type DbDoctor } from '../db/models/Doctor'
import type { DoctorProfile } from '../types/appointment.types'

function toDoc(doctor: DoctorProfile): DbDoctor {
  return {
    _id: doctor.id,
    id: doctor.id,
    userId: doctor.userId,
    facilityId: doctor.facilityId,
    departmentId: doctor.departmentId,
    name: doctor.name,
    specialization: doctor.specialization,
    qualifications: doctor.qualifications ?? null,
    experienceYears: doctor.experienceYears ?? null,
    consultationType: doctor.consultationType,
    photoInitials: doctor.photoInitials ?? null,
    active: doctor.active,
    createdAt: doctor.createdAt,
    updatedAt: doctor.updatedAt,
  }
}

function toDoctor(doc: DbDoctor): DoctorProfile {
  return {
    id: doc.id,
    userId: doc.userId,
    facilityId: doc.facilityId,
    departmentId: doc.departmentId,
    name: doc.name,
    specialization: doc.specialization,
    qualifications: doc.qualifications ?? undefined,
    experienceYears: doc.experienceYears ?? undefined,
    consultationType: doc.consultationType as DoctorProfile['consultationType'],
    photoInitials: doc.photoInitials ?? undefined,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function upsertDoctor(doctor: DoctorProfile): Promise<void> {
  await DoctorModel.replaceOne({ _id: doctor.id }, toDoc(doctor), { upsert: true })
}

export async function listPersistedDoctors(): Promise<DoctorProfile[]> {
  const docs = await DoctorModel.find().lean<DbDoctor[]>().exec()
  return docs.map(toDoctor)
}

export async function deleteDoctor(id: string): Promise<void> {
  await DoctorModel.deleteOne({ _id: id })
}