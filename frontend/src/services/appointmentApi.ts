/**
 * Appointment-system API client. Mirrors the endpoints mounted in
 * /backend/src/routes/*.routes.ts. Role rules live on the backend — the UI
 * only renders what the signed-in user is allowed to do and surfaces errors.
 */

import { request } from './api'
import type {
  Appointment,
  AppointmentAnalytics,
  AppointmentAuditEntry,
  AppointmentCreateInput,
  AppointmentNotification,
  AppointmentStatus,
  AvailabilityWindow,
  Department,
  DoctorProfile,
  NextAvailability,
  OpenSlot,
  RescheduleRequestInput,
} from '../types/appointment.types'

export interface AppointmentActor {
  id: string
  name: string
  role: string
}

/* ---------------- Departments ---------------- */

export function fetchDepartments(): Promise<{ departments: Department[] }> {
  return request('/departments')
}

export function createDepartment(body: {
  name: string
  description?: string
  facilityId?: string
}): Promise<{ department: Department }> {
  return request('/departments', { method: 'POST', body: JSON.stringify(body) })
}

export function updateDepartment(
  id: string,
  body: { name?: string; description?: string; active?: boolean },
): Promise<{ department: Department }> {
  return request(`/departments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteDepartment(id: string): Promise<void> {
  return request(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ---------------- Doctors & schedule ---------------- */

export function fetchDoctors(): Promise<{ doctors: DoctorProfile[] }> {
  return request('/doctors')
}

export function fetchMyDoctor(): Promise<{ doctor: DoctorProfile }> {
  return request('/doctors/me')
}

export function createDoctor(body: {
  name: string
  specialization: string
  departmentId: string
  qualifications?: string[]
  experienceYears?: number
  consultationType?: string
  userId?: string
}): Promise<{ doctor: DoctorProfile }> {
  return request('/doctors', { method: 'POST', body: JSON.stringify(body) })
}

export function updateDoctor(
  id: string,
  body: {
    name?: string
    specialization?: string
    departmentId?: string
    qualifications?: string[]
    experienceYears?: number
    consultationType?: string
    active?: boolean
  },
): Promise<{ doctor: DoctorProfile }> {
  return request(`/doctors/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function fetchAvailability(doctorId: string): Promise<{ availability: AvailabilityWindow[] }> {
  return request(`/doctors/${encodeURIComponent(doctorId)}/availability`)
}

export function createAvailabilityWindow(
  doctorId: string,
  body: Partial<AvailabilityWindow> & {
    kind: 'weekly' | 'date'
    startTime: string
    endTime: string
  },
): Promise<{ window: AvailabilityWindow }> {
  return request(`/doctors/${encodeURIComponent(doctorId)}/availability`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateAvailabilityWindow(
  windowId: string,
  body: { startTime?: string; endTime?: string; durationMinutes?: number; maxAppointmentsPerDay?: number; active?: boolean; leave?: boolean },
): Promise<{ window: AvailabilityWindow }> {
  return request(`/doctors/availability/${encodeURIComponent(windowId)}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteAvailabilityWindow(windowId: string): Promise<void> {
  return request(`/doctors/availability/${encodeURIComponent(windowId)}`, { method: 'DELETE' })
}

/** Open, bookable slots for a doctor on a specific date (YYYY-MM-DD). */
export function fetchSlots(
  doctorId: string,
  date: string,
): Promise<{ doctorId: string; date: string; slots: OpenSlot[]; windows: AvailabilityWindow[] }> {
  return request(`/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`)
}

/** First date with an open slot for a doctor (from an optional start date). */
export function fetchNextAvailable(doctorId: string, from?: string): Promise<NextAvailability> {
  const q = from ? `?from=${encodeURIComponent(from)}` : ''
  return request(`/doctors/${encodeURIComponent(doctorId)}/next-available${q}`)
}

/* ---------------- Appointments ---------------- */

/** Role-aware listing: patient → own, doctor → roster, staff → facility. */
export function fetchAppointments(status?: AppointmentStatus): Promise<{ appointments: Appointment[] }> {
  return request(status ? `/appointments?status=${encodeURIComponent(status)}` : '/appointments')
}

/** Own list for the signed-in user (patient or doctor). */
export function fetchMyAppointments(): Promise<{ appointments: Appointment[] }> {
  return request('/appointments/my')
}

export function fetchAppointment(id: string): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}`)
}

export function bookAppointment(body: AppointmentCreateInput): Promise<{ appointment: Appointment }> {
  return request('/appointments', { method: 'POST', body: JSON.stringify(body) })
}

export function transitionAppointment(
  id: string,
  status: AppointmentStatus,
  reason?: string,
): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  })
}

export function cancelAppointment(id: string, reason: string): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function requestReschedule(id: string, body: RescheduleRequestInput): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/reschedule`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function decideReschedule(
  id: string,
  body: { approved: boolean; requestedDate?: string; requestedStartTime?: string; reason?: string },
): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/reschedule/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function checkInAppointment(id: string): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/check-in`, { method: 'POST', body: '{}' })
}

export function completeAppointment(id: string): Promise<{ appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/complete`, { method: 'POST', body: '{}' })
}

export function fetchAppointmentAudit(
  id: string,
): Promise<{ audit: AppointmentAuditEntry[]; appointment: Appointment }> {
  return request(`/appointments/${encodeURIComponent(id)}/audit`)
}

export function deleteAppointment(id: string): Promise<void> {
  return request(`/appointments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/* ---------------- Admin / facility management ---------------- */

export function fetchFacilityAppointments(params?: {
  status?: AppointmentStatus
  doctorId?: string
  departmentId?: string
  dateFrom?: string
  dateTo?: string
  q?: string
}): Promise<{ appointments: Appointment[] }> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return request(`/admin/appointments${qs ? `?${qs}` : ''}`)
}

export function fetchAppointmentAnalytics(from?: string): Promise<{ analytics: AppointmentAnalytics }> {
  return request(from ? `/admin/appointments/analytics?from=${encodeURIComponent(from)}` : '/admin/appointments/analytics')
}

/* ---------------- Notifications ---------------- */

export function fetchNotifications(): Promise<{ notifications: AppointmentNotification[] }> {
  return request('/notifications')
}

export function fetchUnreadCount(): Promise<{ unread: number }> {
  return request('/notifications/unread-count')
}

export function markNotificationRead(id: string): Promise<{ notification: AppointmentNotification }> {
  return request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: '{}' })
}

export function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return request('/notifications/read-all', { method: 'POST', body: '{}' })
}