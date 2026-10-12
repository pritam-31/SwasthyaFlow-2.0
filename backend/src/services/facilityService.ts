import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { deleteFacility as deletePersistedFacility, listPersistedFacilities, upsertFacility } from '../repositories/facilityRepository'
import {
  DEFAULT_FACILITY_ID,
  DEFAULT_FACILITY_NAME,
  FACILITY_TYPES,
  type Facility,
  type FacilityCreateInput,
  type FacilityStatus,
  type FacilityType,
  type FacilityUpdateInput,
} from '../types/facility.types'
import { addAudit } from './auditStore'

/**
 * Facility registry (P1-10).
 *
 * In-memory Map is the source of truth; Mongo is a write-through mirror when
 * persistence is enabled — matching every other store in this prototype.
 */

export class FacilityError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const facilities = new Map<string, Facility>()

function persist(facility: Facility): void {
  if (!persistenceEnabled()) return
  const snapshot = { ...facility }
  enqueue('facility:' + facility.id, () => upsertFacility(snapshot))
}

function now(): string {
  return new Date().toISOString()
}

function isType(value: unknown): value is FacilityType {
  return typeof value === 'string' && (FACILITY_TYPES as string[]).includes(value)
}

function normalizeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

export function getFacility(id: string): Facility | undefined {
  return facilities.get(id)
}

export function facilityExists(id: string): boolean {
  return facilities.has(id)
}

export function listFacilities(): Facility[] {
  return [...facilities.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function listActiveFacilities(): Facility[] {
  return listFacilities().filter((facility) => facility.status === 'active')
}

/** The first active facility — the fallback scope for a system-admin with no header. */
export function defaultFacilityId(): string {
  return listActiveFacilities()[0]?.id ?? DEFAULT_FACILITY_ID
}

export function facilityNameOf(id: string): string {
  return facilities.get(id)?.name ?? DEFAULT_FACILITY_NAME
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function normalizeCreate(input: FacilityCreateInput, actor: string): Facility {
  const name = normalizeText(input.name, 120)
  if (!name) throw new FacilityError(400, 'Facility name is required.')
  if (!isType(input.type)) throw new FacilityError(400, `Facility type must be one of: ${FACILITY_TYPES.join(', ')}.`)
  const stamp = now()
  return {
    id: `fac-${randomUUID().slice(0, 8)}`,
    name,
    type: input.type,
    status: 'active',
    region: normalizeText(input.region, 120),
    district: normalizeText(input.district, 120),
    state: normalizeText(input.state, 120),
    contactRef: normalizeText(input.contactRef, 120),
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: actor,
    updatedBy: actor,
  }
}

/* ------------------------------------------------------------------ */
/*  Writes                                                             */
/* ------------------------------------------------------------------ */

export function createFacility(input: FacilityCreateInput, actor: string): Facility {
  const facility = normalizeCreate(input, actor)
  facilities.set(facility.id, facility)
  persist(facility)
  addAudit({
    facilityId: facility.id,
    sessionId: facility.id,
    actor,
    role: 'system-admin',
    action: 'facility.created',
    detail: `Facility "${facility.name}" (${facility.type}) created.`,
    category: 'system',
  })
  return facility
}

export function updateFacility(id: string, patch: FacilityUpdateInput, actor: string): Facility {
  const existing = facilities.get(id)
  if (!existing) throw new FacilityError(404, 'Facility not found.')
  if (existing.status === 'archived') throw new FacilityError(409, 'Archived facilities are read-only.')

  const next: Facility = { ...existing, updatedBy: actor, updatedAt: now() }
  if (patch.name !== undefined) {
    const name = normalizeText(patch.name, 120)
    if (!name) throw new FacilityError(400, 'Facility name cannot be empty.')
    next.name = name
  }
  if (patch.type !== undefined) {
    if (!isType(patch.type)) throw new FacilityError(400, `Facility type must be one of: ${FACILITY_TYPES.join(', ')}.`)
    next.type = patch.type
  }
  if (patch.region !== undefined) next.region = normalizeText(patch.region, 120)
  if (patch.district !== undefined) next.district = normalizeText(patch.district, 120)
  if (patch.state !== undefined) next.state = normalizeText(patch.state, 120)
  if (patch.contactRef !== undefined) next.contactRef = normalizeText(patch.contactRef, 120)
  if (patch.status !== undefined) {
    if (!['active', 'suspended', 'archived'].includes(patch.status)) {
      throw new FacilityError(400, 'Status must be active, suspended or archived.')
    }
    next.status = patch.status
  }

  facilities.set(id, next)
  persist(next)
  addAudit({
    facilityId: id,
    sessionId: id,
    actor,
    role: 'system-admin',
    action: patch.status === 'suspended' ? 'facility.suspended' : 'facility.updated',
    detail: `Facility "${next.name}" updated.`,
    category: 'system',
  })
  return next
}

export function setFacilityStatus(id: string, status: FacilityStatus, actor: string): Facility {
  return updateFacility(id, { status }, actor)
}

export function archiveFacility(id: string, actor: string): Facility {
  const facility = updateFacility(id, { status: 'archived' }, actor)
  addAudit({
    facilityId: id,
    sessionId: id,
    actor,
    role: 'system-admin',
    action: 'facility.archived',
    detail: `Facility "${facility.name}" archived (terminal).`,
    category: 'system',
  })
  return facility
}

export function deleteFacility(id: string, actor: string): void {
  const existing = facilities.get(id)
  if (!existing) throw new FacilityError(404, 'Facility not found.')
  if (id === DEFAULT_FACILITY_ID) throw new FacilityError(409, 'The default facility cannot be deleted.')
  facilities.delete(id)
  if (persistenceEnabled()) enqueue('facility:' + id, () => deletePersistedFacility(id))
  addAudit({
    facilityId: id,
    sessionId: id,
    actor,
    role: 'system-admin',
    action: 'facility.deleted',
    detail: `Facility "${existing.name}" deleted.`,
    category: 'system',
  })
}

/* ------------------------------------------------------------------ */
/*  Boot + hydration                                                   */
/* ------------------------------------------------------------------ */

/** Creates the default facility when the registry is empty. */
export function seedDefaultFacility(): Facility {
  const existing = facilities.get(DEFAULT_FACILITY_ID)
  if (existing) return existing
  const stamp = now()
  const facility: Facility = {
    id: DEFAULT_FACILITY_ID,
    name: normalizeText(process.env.DEFAULT_FACILITY_NAME, 120) ?? DEFAULT_FACILITY_NAME,
    type: 'phc',
    status: 'active',
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: 'system',
    updatedBy: 'system',
  }
  facilities.set(facility.id, facility)
  persist(facility)
  return facility
}

/**
 * Seeds a demo directory of clinics, hospitals and community health units so
 * the facility registry looks realistic across every healthcare type.
 */
export function seedDemoFacilities(): Facility[] {
  const demo: Array<{ name: string; type: FacilityType; region?: string; district?: string; state?: string }> = [
    { name: 'Sunrise Multi-Speciality Clinic', type: 'company-clinic', region: 'Pune West', district: 'Pune', state: 'Maharashtra' },
    { name: 'GreenLeaf Primary Health Centre', type: 'phc', region: 'Belgaum North', district: 'Belgaum', state: 'Karnataka' },
    { name: 'Navjivan Community Health Centre', type: 'government-hospital', region: 'Nagpur City', district: 'Nagpur', state: 'Maharashtra' },
    { name: 'CityCare Corporate Clinic', type: 'company-clinic', region: 'Andheri East', district: 'Mumbai', state: 'Maharashtra' },
    { name: 'Swasthya Mobile Health Camp', type: 'health-camp', region: 'Remote block', district: 'Bhopal', state: 'Madhya Pradesh' },
    { name: 'Railway Employees Health Unit', type: 'industrial-health-unit', region: 'Rail colony', district: 'Howrah', state: 'West Bengal' },
    { name: 'Campus Wellness Health Centre', type: 'campus-health-centre', region: 'Main campus', district: 'Kharagpur', state: 'West Bengal' },
    { name: 'MediCore Diagnostics & Clinic', type: 'other', region: 'Civil Lines', district: 'Jaipur', state: 'Rajasthan' },
    { name: 'Bahubali Rural Health Camp', type: 'health-camp', region: 'Sonepat block', district: 'Sonepat', state: 'Haryana' },
    { name: 'Anand Maternity & Child Clinic', type: 'phc', region: 'Nashik East', district: 'Nashik', state: 'Maharashtra' },
  ]
  const created: Facility[] = []
  for (const item of demo) {
    if ([...facilities.values()].some((f) => f.name === item.name)) continue
    const stamp = now()
    const facility: Facility = {
      id: `fac-${randomUUID().slice(0, 8)}`,
      name: item.name,
      type: item.type,
      status: 'active',
      region: item.region,
      district: item.district,
      state: item.state,
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: 'system',
      updatedBy: 'system',
    }
    facilities.set(facility.id, facility)
    persist(facility)
    created.push(facility)
  }
  return created
}

export async function hydrateFacilities(): Promise<void> {
  const rows = await listPersistedFacilities()
  facilities.clear()
  for (const facility of rows) facilities.set(facility.id, facility)
  if (facilities.size === 0) seedDefaultFacility()
}

export function clearFacilities(): void {
  facilities.clear()
}
