/**
 * Facility management API (P1-10). All calls go through the shared `request`
 * client, which attaches the session token and the active `X-Facility-Id`.
 */

import { request } from './api'
import type { AuthUser } from './api'
import type {
  Facility,
  FacilityCreateInput,
  FacilityStats,
  FacilityType,
} from '../types/facility.types'
import type { UserRole } from '../types/triage'

export interface FacilityUserInput {
  username: string
  displayName: string
  password: string
  role: UserRole
}

/** The facilities the caller may see (system-admin: all, others: own). */
export async function listFacilities(): Promise<Facility[]> {
  const res = await request<{ facilities: Facility[] }>('/facilities')
  return res.facilities
}

export async function createFacility(input: FacilityCreateInput): Promise<Facility> {
  const res = await request<{ facility: Facility }>('/facilities', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.facility
}

export async function getFacility(id: string): Promise<Facility> {
  const res = await request<{ facility: Facility }>(`/facilities/${id}`)
  return res.facility
}

export async function updateFacility(
  id: string,
  input: Partial<FacilityCreateInput> & { status?: Facility['status'] },
): Promise<Facility> {
  const res = await request<{ facility: Facility }>(`/facilities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return res.facility
}

export async function switchFacility(facilityId: string): Promise<Facility> {
  const res = await request<{ facility: Facility }>('/facilities/switch', {
    method: 'POST',
    body: JSON.stringify({ facilityId }),
  })
  return res.facility
}

export function suspendFacility(id: string): Promise<Facility> {
  return request<{ facility: Facility }>(`/facilities/${id}/suspend`, { method: 'POST', body: '{}' }).then(
    (r) => r.facility,
  )
}

export function archiveFacility(id: string): Promise<Facility> {
  return request<{ facility: Facility }>(`/facilities/${id}/archive`, { method: 'POST', body: '{}' }).then(
    (r) => r.facility,
  )
}

export function deleteFacility(id: string): Promise<void> {
  return request<{ ok: boolean }>(`/facilities/${id}`, { method: 'DELETE' }).then(() => undefined)
}

export function facilityStats(id: string): Promise<FacilityStats> {
  return request<{ stats: FacilityStats }>(`/facilities/${id}/stats`).then((r) => r.stats)
}

export async function listFacilityUsers(id: string): Promise<AuthUser[]> {
  const res = await request<{ users: AuthUser[] }>(`/facilities/${id}/users`)
  return res.users
}

export async function createFacilityUser(id: string, input: FacilityUserInput): Promise<AuthUser> {
  const res = await request<{ user: AuthUser }>(`/facilities/${id}/users`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.user
}

export async function setFacilityUserRole(id: string, userId: string, role: UserRole): Promise<AuthUser> {
  const res = await request<{ user: AuthUser }>(`/facilities/${id}/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
  return res.user
}

export function deleteFacilityUser(id: string, userId: string): Promise<void> {
  return request<{ ok: boolean }>(`/facilities/${id}/users/${userId}`, { method: 'DELETE' }).then(
    () => undefined,
  )
}

export type { Facility, FacilityCreateInput, FacilityStats, FacilityType }
