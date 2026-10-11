/**
 * Facility-level multi-tenancy types (P1-10).
 *
 * A Facility is the tenant boundary. Every scoped entity carries a `facilityId`.
 * A facility name is an identifier: it is redacted to `[FACILITY]` in anonymised
 * outputs and is never returned across a facility boundary.
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
  /** An internal contact reference — never a phone number or personal PII. */
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

export interface FacilityUpdateInput {
  name?: string
  type?: FacilityType
  region?: string
  district?: string
  state?: string
  contactRef?: string
  status?: FacilityStatus
}

export interface FacilityScope {
  facilityId: string
}

/** The five facility-scoped roles (legacy `admin` maps to system-admin). */
export type FacilityRole = 'system-admin' | 'facility-admin' | 'nurse' | 'doctor' | 'patient'

export interface FacilityContext {
  facilityId: string
  facilityName: string
  facilityType: FacilityType
  source: 'user-default' | 'header'
}

export interface FacilitySwitchRequest {
  facilityId: string
}

export interface FacilityStats {
  users: number
  sessions: number
  reports: number
  visuals: number
  auditEntries: number
}
