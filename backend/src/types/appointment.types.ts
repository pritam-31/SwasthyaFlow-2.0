/**
 * Hybrid smart appointment management system types.
 *
 * An appointment is a facility-scoped, human-in-the-loop booking. It never
 * contains raw medical findings; it links to a triage session (when booked from
 * a reviewed case) or to the authenticated patient account (direct booking).
 * The workflow categories are operational labels, never a diagnosis.
 */

export const DEFAULT_BOOKING_REF_PREFIX = 'SF'

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'reschedule_requested'
  | 'rescheduled'
  | 'cancelled'
  | 'checked_in'
  | 'completed'
  | 'no_show'

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'rejected',
  'reschedule_requested',
  'rescheduled',
  'cancelled',
  'checked_in',
  'completed',
  'no_show',
]

export type BookingMode = 'direct' | 'triage'

export const BOOKING_MODES: BookingMode[] = ['direct', 'triage']

export type ConsultationType =
  | 'general'
  | 'followup'
  | 'checkup'
  | 'referral'
  | 'procedure'
  | 'urgent-review'

export const CONSULTATION_TYPES: ConsultationType[] = [
  'general',
  'followup',
  'checkup',
  'referral',
  'procedure',
  'urgent-review',
]

/**
 * Operational workflow categories. These are safe, non-diagnostic labels used
 * to route work to the right human. "urgent-escalation" means a qualified
 * professional must assess promptly — never a clinical diagnosis.
 */
export type AppointmentPriority = 'routine' | 'staff-review' | 'urgent-escalation'

export const APPOINTMENT_PRIORITIES: AppointmentPriority[] = ['routine', 'staff-review', 'urgent-escalation']

/**
 * Valid status transitions for the appointment state machine. Every transition
 * is explicit; anything else is rejected by the backend.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled', 'reschedule_requested'],
  confirmed: ['reschedule_requested', 'cancelled', 'checked_in', 'no_show', 'completed'],
  rejected: [],
  reschedule_requested: ['rescheduled', 'confirmed', 'rejected', 'cancelled'],
  rescheduled: ['checked_in', 'cancelled', 'no_show', 'completed', 'reschedule_requested'],
  cancelled: [],
  checked_in: ['completed', 'no_show', 'cancelled'],
  completed: [],
  no_show: [],
}

export interface Appointment {
  id: string
  bookingReference: string
  facilityId: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  departmentId: string
  departmentName: string
  /** Triage session id when booked from a reviewed case (optional). */
  sessionId?: string | null
  /** Referral id when this booking originates from a referral (optional). */
  referralId?: string | null
  /** ISO date (YYYY-MM-DD) of the appointment. */
  appointmentDate: string
  /** 24h "HH:MM" local time slot start. */
  startTime: string
  endTime: string
  durationMinutes: number
  visitReason: string
  consultationType: ConsultationType
  bookingMode: BookingMode
  status: AppointmentStatus
  priority: AppointmentPriority
  /** Slot key part of the concurrency guard: doctorId|date|startTime. */
  slotKey: string
  /** Only active (non-terminal) bookings participate in slot uniqueness. */
  active: boolean
  cancellationReason?: string
  rescheduleRequest?: {
    requestedDate?: string
    requestedStartTime?: string
    reason?: string
    requestedAt: string
    requestedBy: string
  } | null
  createdBy: string
  createdByRole: string
  checkedInAt?: string
  completedAt?: string
  noShowAt?: string
  createdAt: string
  updatedAt: string
}

export interface AppointmentCreateInput {
  patientId: string
  patientName: string
  doctorId: string
  departmentId?: string
  appointmentDate: string
  startTime: string
  visitReason: string
  consultationType?: ConsultationType
  priority?: AppointmentPriority
  bookingMode?: BookingMode
  sessionId?: string
  referralId?: string
}

export interface RescheduleRequestInput {
  requestedDate: string
  requestedStartTime: string
  reason?: string
}

export interface AppointmentActor {
  id: string
  name: string
  role: string
}

export interface AppointmentAuditEntry {
  id: string
  appointmentId: string
  bookingReference: string
  facilityId: string
  previousStatus?: AppointmentStatus
  newStatus: AppointmentStatus
  action: string
  actor: string
  actorRole: string
  reason?: string
  at: string
}

export interface AppointmentNotification {
  id: string
  userId: string
  facilityId: string
  kind:
    | 'booking_submitted'
    | 'booking_confirmed'
    | 'booking_rejected'
    | 'reschedule_requested'
    | 'rescheduled'
    | 'cancelled'
    | 'checked_in'
    | 'completed'
    | 'reminder'
  title: string
  message: string
  appointmentId: string
  bookingReference: string
  read: boolean
  createdAt: string
}

export interface Department {
  id: string
  facilityId: string
  name: string
  description?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface DepartmentCreateInput {
  name: string
  description?: string
  facilityId?: string
}

export interface DoctorProfile {
  id: string
  userId: string
  facilityId: string
  departmentId: string
  name: string
  specialization: string
  qualifications?: string[]
  experienceYears?: number
  consultationType: ConsultationType
  photoInitials?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface DoctorCreateInput {
  userId?: string
  departmentId: string
  name: string
  specialization: string
  qualifications?: string[]
  experienceYears?: number
  consultationType?: ConsultationType
}

export type AvailabilityKind = 'weekly' | 'date'

export interface AvailabilityWindow {
  id: string
  doctorId: string
  facilityId: string
  kind: AvailabilityKind
  /** 0 (Monday) – 6 (Sunday) for weekly windows. */
  dayOfWeek?: number
  /** YYYY-MM-DD for date-specific windows / overrides. */
  date?: string
  /** Holiday / leave when set on a date window and no times are provided. */
  leave?: boolean
  startTime: string
  endTime: string
  durationMinutes: number
  breakStart?: string
  breakEnd?: string
  maxAppointmentsPerDay?: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AvailabilityWindowInput {
  kind: AvailabilityKind
  dayOfWeek?: number
  date?: string
  leave?: boolean
  startTime: string
  endTime: string
  durationMinutes?: number
  breakStart?: string
  breakEnd?: string
  maxAppointmentsPerDay?: number
  active?: boolean
}

export interface AppointmentAnalytics {
  totals: {
    bookings: number
    confirmed: number
    pending: number
    cancelled: number
    completed: number
    checkedIn: number
    noShow: number
    cancellationRate: number
  }
  byDepartment: Array<{ departmentId: string; departmentName: string; count: number }>
  byDoctor: Array<{ doctorId: string; doctorName: string; count: number; completed: number }>
  byFacility: Array<{ facilityId: string; facilityName: string; count: number }>
  daily: Array<{ date: string; count: number }>
}