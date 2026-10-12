import { DepartmentModel, type DbDepartment } from '../db/models/Department'
import type { Department } from '../types/appointment.types'

function toDoc(department: Department): DbDepartment {
  return {
    _id: department.id,
    id: department.id,
    facilityId: department.facilityId,
    name: department.name,
    description: department.description ?? null,
    active: department.active,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
  }
}

function toDepartment(doc: DbDepartment): Department {
  return {
    id: doc.id,
    facilityId: doc.facilityId,
    name: doc.name,
    description: doc.description ?? undefined,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function upsertDepartment(department: Department): Promise<void> {
  await DepartmentModel.replaceOne({ _id: department.id }, toDoc(department), { upsert: true })
}

export async function listPersistedDepartments(): Promise<Department[]> {
  const docs = await DepartmentModel.find().lean<DbDepartment[]>().exec()
  return docs.map(toDepartment)
}

export async function deleteDepartment(id: string): Promise<void> {
  await DepartmentModel.deleteOne({ _id: id })
}