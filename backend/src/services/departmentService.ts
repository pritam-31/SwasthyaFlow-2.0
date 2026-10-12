import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { deleteDepartment as deletePersisted, listPersistedDepartments, upsertDepartment } from '../repositories/departmentRepository'
import { DEFAULT_FACILITY_ID } from '../types/facility.types'
import type { Department, DepartmentCreateInput } from '../types/appointment.types'
import { addAudit } from './auditStore'

export class DepartmentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const departments = new Map<string, Department>()

function persist(department: Department): void {
  if (!persistenceEnabled()) return
  enqueue('department:' + department.id, () => upsertDepartment({ ...department }))
}

function now(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

export function getDepartment(id: string): Department | undefined {
  return departments.get(id)
}

export function listDepartments(facilityId?: string): Department[] {
  const all = [...departments.values()].sort((a, b) => a.name.localeCompare(b.name))
  return facilityId ? all.filter((d) => d.facilityId === facilityId) : all
}

export function listDepartmentsForFacility(facilityId: string): Department[] {
  return listDepartments(facilityId).filter((d) => d.active)
}

export function departmentNameOf(id: string, _facilityId: string): string {
  return departments.get(id)?.name ?? 'General'
}

/* ------------------------------------------------------------------ */
/*  Writes                                                             */
/* ------------------------------------------------------------------ */

export function createDepartment(input: DepartmentCreateInput, facilityId: string, actor: string): Department {
  const name = normalizeText(input.name, 120)
  if (!name) throw new DepartmentError(400, 'Department name is required.')
  const stamp = now()
  const scopedFacilityId = input.facilityId?.trim() || facilityId
  const department: Department = {
    id: `dep-${randomUUID().slice(0, 8)}`,
    facilityId: scopedFacilityId,
    name,
    description: normalizeText(input.description, 300),
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  }
  departments.set(department.id, department)
  persist(department)
  addAudit({
    facilityId: scopedFacilityId,
    sessionId: 'appointments',
    actor,
    role: 'system-admin',
    action: 'department.created',
    detail: `Department "${department.name}" created.`,
    category: 'system',
  })
  return department
}

export function updateDepartment(id: string, patch: { name?: string; description?: string; active?: boolean }, actor: string): Department {
  const existing = departments.get(id)
  if (!existing) throw new DepartmentError(404, 'Department not found.')
  const next: Department = { ...existing, updatedAt: now() }
  if (patch.name !== undefined) {
    const name = normalizeText(patch.name, 120)
    if (!name) throw new DepartmentError(400, 'Department name cannot be empty.')
    next.name = name
  }
  if (patch.description !== undefined) next.description = normalizeText(patch.description, 300)
  if (patch.active !== undefined) next.active = Boolean(patch.active)
  departments.set(id, next)
  persist(next)
  addAudit({
    facilityId: next.facilityId,
    sessionId: 'appointments',
    actor,
    role: 'system-admin',
    action: patch.active === false ? 'department.deactivated' : 'department.updated',
    detail: `Department "${next.name}" updated.`,
    category: 'system',
  })
  return next
}

export function deleteDepartment(id: string, facilityId: string, actor: string): void {
  const existing = departments.get(id)
  if (!existing) throw new DepartmentError(404, 'Department not found.')
  if (existing.facilityId !== facilityId) throw new DepartmentError(404, 'Department not found.')
  departments.delete(id)
  if (persistenceEnabled()) enqueue('department:' + id, () => deletePersisted(id))
  addAudit({
    facilityId,
    sessionId: 'appointments',
    actor,
    role: 'system-admin',
    action: 'department.deleted',
    detail: `Department "${existing.name}" deleted.`,
    category: 'system',
  })
}

/* ------------------------------------------------------------------ */
/*  Boot + hydration + seeds                                           */
/* ------------------------------------------------------------------ */

export function seedDefaultDepartments(): Department[] {
  const seed: Array<{ name: string; description: string }> = [
    { name: 'General Medicine', description: 'General outpatient consultations.' },
    { name: 'Pediatrics', description: 'Child and adolescent care.' },
    { name: 'Obstetrics & Gynaecology', description: 'Maternal and reproductive health.' },
    { name: 'Orthopaedics', description: 'Bone, joint and muscle care.' },
    { name: 'Dermatology', description: 'Skin and minor dermatology concerns.' },
  ]
  const created: Department[] = []
  for (const item of seed) {
    if ([...departments.values()].some((d) => d.facilityId === DEFAULT_FACILITY_ID && d.name === item.name)) continue
    const stamp = now()
    const department: Department = {
      id: `dep-${randomUUID().slice(0, 8)}`,
      facilityId: DEFAULT_FACILITY_ID,
      name: item.name,
      description: item.description,
      active: true,
      createdAt: stamp,
      updatedAt: stamp,
    }
    departments.set(department.id, department)
    persist(department)
    created.push(department)
  }
  return created
}

export async function hydrateDepartments(): Promise<void> {
  const rows = await listPersistedDepartments()
  departments.clear()
  for (const department of rows) departments.set(department.id, department)
}

export function clearDepartments(): void {
  departments.clear()
}