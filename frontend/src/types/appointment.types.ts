/**
 * Client-side mirror of /backend/src/types/appointment.types.ts.
 *
 * An appointment is a facility-scoped, human-in-the-loop booking. It never
 * contains raw medical findings; it links to a triage session (when booked
 * from a reviewed case) or to the authenticated patient account (direct
 * booking). Workflow categories are operational labels, never a diagnosis.
 */

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

export type BookingMode = 'direct' | 'triage'

export type ConsultationType =
  | 'general'
  | 'followup'
  | 'checkup'
  | 'referral'
  | 'procedure'
  | 'urgent-review'

export type AppointmentPriority = 'routine' | 'staff-review' | 'urgent-escalation'

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
  sessionId?: string | null
  referralId?: string | null
  appointmentDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  visitReason: string
  consultationType: ConsultationType
  bookingMode: BookingMode
  status: AppointmentStatus
  priority: AppointmentPriority
  slotKey: string
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
  patientId?: string
  patientName?: string
  doctorId: string
  departmentId?: string
  appointmentDate: string
  startTime: string
  visitReason: string
  consultationType?: ConsultationType
  priority?: AppointmentPriority
  bookingMode?: BookingMode
  sessionId?: string
}

export interface RescheduleRequestInput {
  requestedDate: string
  requestedStartTime: string
  reason?: string
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

export type AvailabilityKind = 'weekly' | 'date'

export interface AvailabilityWindow {
  id: string
  doctorId: string
  facilityId: string
  kind: AvailabilityKind
  dayOfWeek?: number
  date?: string
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

export interface OpenSlot {
  time: string
  endTime: string
  durationMinutes: number
}

export interface NextAvailability {
  doctorId: string
  availability: { date: string; slot?: OpenSlot } | null
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

/* ---------------- UI metadata ---------------- */

export const CONSULTATION_TYPES: ConsultationType[] = [
  'general',
  'followup',
  'checkup',
  'referral',
  'procedure',
  'urgent-review',
]

export const CONSULTATION_TYPE_LABEL: Record<ConsultationType, string> = {
  general: 'General consultation',
  followup: 'Follow-up visit',
  checkup: 'Health check-up',
  referral: 'Referral review',
  procedure: 'Procedure / dressing',
  'urgent-review': 'Prompt specialist review',
}

export interface StatusMeta {
  label: string
  classes: string
  dot: string
}

export const APPOINTMENT_STATUS_META: Record<AppointmentStatus, StatusMeta> = {
  pending: {
    label: 'Pending review',
    classes: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
  },
  confirmed: {
    label: 'Confirmed',
    classes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    classes: 'bg-rose-50 text-rose-800 ring-rose-200',
    dot: 'bg-rose-500',
  },
  reschedule_requested: {
    label: 'Reschedule requested',
    classes: 'bg-sky-50 text-sky-800 ring-sky-200',
    dot: 'bg-sky-500',
  },
  rescheduled: {
    label: 'Rescheduled',
    classes: 'bg-violet-50 text-violet-800 ring-violet-200',
    dot: 'bg-violet-500',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-ink-100 text-ink-600 ring-ink-200',
    dot: 'bg-ink-400',
  },
  checked_in: {
    label: 'Checked in',
    classes: 'bg-sky-50 text-sky-800 ring-sky-200',
    dot: 'bg-sky-500',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  no_show: {
    label: 'No show',
    classes: 'bg-ink-100 text-ink-600 ring-ink-200',
    dot: 'bg-ink-400',
  },
}

export const PRIORITY_META: Record<AppointmentPriority, StatusMeta> = {
  routine: {
    label: 'Routine',
    classes: 'bg-white text-ink-500 ring-ink-200',
    dot: 'bg-ink-300',
  },
  'staff-review': {
    label: 'Needs staff review',
    classes: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
  },
  'urgent-escalation': {
    label: 'Prompt escalation',
    classes: 'bg-rose-50 text-rose-800 ring-rose-200',
    dot: 'bg-rose-500',
  },
}