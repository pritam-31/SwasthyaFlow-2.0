/**
 * Facility-level multi-tenancy types (P1-10). Mirrors the backend contract in
 * `backend/src/types/facility.types.ts`. A Facility is the tenant boundary.
 */

export const DEFAULT_FACILITY_ID = 'facility-default'
export const DEFAULT_FACILITY_NAME = 'Default Facility'

export type FacilityType =
  | 'government-hospital'
  | 'phc'
  | 'health-camp'
  | 'company-clinic'
  | 'industrial-health-unit'
  | 'campus-health-centre'
  | 'other'

export const FACILITY_TYPES: FacilityType[] = [
  'government-hospital',
  'phc',
  'health-camp',
  'company-clinic',
  'industrial-health-unit',
  'campus-health-centre',
  'other',
]

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  'government-hospital': 'Government Hospital',
  phc: 'Primary Health Centre',
  'health-camp': 'Health Camp',
  'company-clinic': 'Company Clinic',
  'industrial-health-unit': 'Industrial Health Unit',
  'campus-health-centre': 'Campus Health Centre',
  other: 'Other',
}

export type FacilityStatus = 'active' | 'suspended' | 'archived'

export const FACILITY_STATUSES: FacilityStatus[] = ['active', 'suspended', 'archived']

export interface Facility {
  id: string
  name: string
  type: FacilityType
  status: FacilityStatus
  region?: string
  district?: string
  state?: string
  contactRef?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface FacilityCreateInput {
  name: string
  type: FacilityType
  region?: string
  district?: string
  state?: string
  contactRef?: string
}

export interface FacilityStats {
  users: number
  sessions: number
  reports: number
  visuals: number
  auditEntries: number
}
