import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { deleteAppointment as deletePersisted, listPersistedAppointments, upsertAppointment } from '../repositories/appointmentRepository'
import { listPersistedAppointmentAudits, upsertAppointmentAudit } from '../repositories/appointmentAuditRepository'
import { DEFAULT_BOOKING_REF_PREFIX, APPOINTMENT_TRANSITIONS, type Appointment, type AppointmentActor, type AppointmentAnalytics, type AppointmentAuditEntry, type AppointmentCreateInput, type AppointmentStatus, type BookingMode, type AppointmentPriority, type RescheduleRequestInput } from '../types/appointment.types'
import type { UserRole } from '../types'
import { addAudit } from './auditStore'
import { notify } from './notificationService'
import { getDepartment } from './departmentService'
import {
  buildSlotKey,
  fromMinutes,
  getDoctor,
  isValidDate,
  isSlotKeyFree,
  openSlotsForDate,
  registerActiveSlot,
  releaseActiveSlot,
  toMinutes,
  todayDate,
  windowsForDate,
} from './doctorService'

export class AppointmentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const appointments = new Map<string, Appointment>()
const appointmentAudits = new Map<string, AppointmentAuditEntry>()

function persist(appointment: Appointment): void {
  if (!persistenceEnabled()) return
  enqueue('appointment:' + appointment.id, () => upsertAppointment({ ...appointment }))
}

function persistAudit(entry: AppointmentAuditEntry): void {
  if (!persistenceEnabled()) return
  enqueue('appointment-audit:' + entry.id, () => upsertAppointmentAudit({ ...entry }))
}

function now(): string {
  return new Date().toISOString()
}

function uniqueBookingReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const ref = () =>
    `${DEFAULT_BOOKING_REF_PREFIX}-${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`
  let candidate = ref()
  while (appointments.has(candidate)) candidate = ref()
  return candidate
}

function assertValidDate(value: unknown): string {
  if (!isValidDate(value)) throw new AppointmentError(400, `Invalid date "${String(value)}" — expected YYYY-MM-DD.`)
  return value
}

function assertValidTime(value: unknown): string {
  try {
    return fromMinutes(toMinutes(String(value)))
  } catch {
    throw new AppointmentError(400, `Invalid time "${String(value)}" — expected HH:MM (24-hour).`)
  }
}

function audit(entry: Omit<AppointmentAuditEntry, 'id' | 'at'>): AppointmentAuditEntry {
  const full: AppointmentAuditEntry = { ...entry, id: `apaud-${randomUUID().slice(0, 8)}`, at: now() }
  appointmentAudits.set(full.id, full)
  persistAudit(full)
  return full
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

export function getAppointment(id: string): Appointment | undefined {
  return appointments.get(id)
}

export function listAppointmentsForFacility(facilityId: string): Appointment[] {
  return [...appointments.values()]
    .filter((a) => a.facilityId === facilityId)
    .sort((a, b) => `${b.appointmentDate}${b.startTime}`.localeCompare(`${a.appointmentDate}${a.startTime}`))
}

export function listAppointmentsByPatient(patientId: string, facilityId?: string): Appointment[] {
  return [...appointments.values()]
    .filter((a) => a.patientId === patientId && (!facilityId || a.facilityId === facilityId))
    .sort((a, b) => `${b.appointmentDate}${b.startTime}`.localeCompare(`${a.appointmentDate}${a.startTime}`))
}

export function listAppointmentsByDoctor(doctorId: string, facilityId?: string): Appointment[] {
  return [...appointments.values()]
    .filter((a) => a.doctorId === doctorId && (!facilityId || a.facilityId === facilityId))
    .sort((a, b) => `${a.appointmentDate}${a.startTime}`.localeCompare(`${b.appointmentDate}${b.startTime}`))
}

export function listAppointmentAudits(appointmentId?: string): AppointmentAuditEntry[] {
  const all = [...appointmentAudits.values()].sort((a, b) => b.at.localeCompare(a.at))
  return appointmentId ? all.filter((e) => e.appointmentId === appointmentId) : all
}

/* ------------------------------------------------------------------ */
/*  Booking                                                            */
/* ------------------------------------------------------------------ */

function durationFor(doctorId: string, date: string, startTime: string): number {
  const windows = windowsForDate(doctorId, date)
  const start = toMinutes(startTime)
  for (const window of windows) {
    const ws = toMinutes(window.startTime)
    const we = toMinutes(window.endTime)
    if (start >= ws && start + window.durationMinutes <= we) return window.durationMinutes
  }
  return 15
}

/** Atomic-looking, concurrency-safe create. Relies on the `activeBySlotKey` registry
 *  (and the Mongo unique partial index in persistent mode) so two patients can
 *  never reserve the same doctor/date/time. */
export function bookAppointment(input: AppointmentCreateInput, actor: AppointmentActor, facilityId: string): Appointment {
  const date = assertValidDate(input.appointmentDate)
  const startTime = assertValidTime(input.startTime)
  if (date < todayDate()) throw new AppointmentError(400, 'Cannot book an appointment in the past.')
  const doctor = getDoctor(input.doctorId)
  if (!doctor || doctor.facilityId !== facilityId) throw new AppointmentError(404, 'Doctor not found.')
  if (!doctor.active) throw new AppointmentError(409, 'This doctor is not currently accepting appointments.')
  const reason = input.visitReason?.trim()
  if (!reason || reason.length < 3 || reason.length > 500) throw new AppointmentError(400, 'Visit reason must be between 3 and 500 characters.')
  const patientId = input.patientId.trim()
  const patientName = input.patientName?.trim()
  if (!patientId || !patientName) throw new AppointmentError(400, 'patientId and patientName are required.')

  // The requested time must be a generated, still-open slot for this doctor/date.
  const open = openSlotsForDate(doctor.id, date)
  if (!open.some((s) => s.time === startTime)) throw new AppointmentError(409, 'That slot is no longer available — the best time may have been booked.')
  const slotKey = buildSlotKey(doctor.id, date, startTime)
  if (!isSlotKeyFree(slotKey)) throw new AppointmentError(409, 'That slot was just booked by another patient — please choose another time.')

  const duration = durationFor(doctor.id, date, startTime)
  const bookingMode: BookingMode = input.bookingMode ?? 'direct'
  const priority: AppointmentPriority = input.priority ?? (bookingMode === 'triage' ? 'staff-review' : 'routine')
  const stamp = now()
  const appointment: Appointment = {
    id: `apt-${randomUUID().slice(0, 8)}`,
    bookingReference: uniqueBookingReference(),
    facilityId,
    patientId,
    patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    departmentId: input.departmentId || doctor.departmentId,
    departmentName: '',
    sessionId: input.sessionId ?? null,
    referralId: input.referralId ?? null,
    appointmentDate: date,
    startTime,
    endTime: fromMinutes(toMinutes(startTime) + duration),
    durationMinutes: duration,
    visitReason: reason,
    consultationType: input.consultationType ?? doctor.consultationType,
    bookingMode,
    status: 'pending',
    priority,
    slotKey,
    active: true,
    createdBy: actor.name,
    createdByRole: actor.role,
    createdAt: stamp,
    updatedAt: stamp,
  }
  // Department name resolved at write time (kept denormalised so reads stay simple).
  appointment.departmentName = getDepartment(appointment.departmentId)?.name ?? 'General'

  appointments.set(appointment.id, appointment)
  persist(appointment)
  registerActiveSlot(slotKey, appointment.id)
  audit({
    appointmentId: appointment.id,
    bookingReference: appointment.bookingReference,
    facilityId,
    newStatus: 'pending',
    action: 'appointment.created',
    actor: actor.name,
    actorRole: actor.role,
    reason: bookingMode === 'triage' ? 'Booked from a reviewed triage case.' : 'Patient self-booking.',
  })
  addAudit({
    facilityId,
    sessionId: 'appointments',
    actor: actor.name,
    role: actor.role as UserRole,
    action: 'appointment.created',
    detail: `Appointment ${appointment.bookingReference} created (${appointment.bookingMode} booking).`,
    category: 'system',
  })
  notify({
    userId: patientId,
    facilityId,
    kind: 'booking_submitted',
    title: 'Appointment request submitted',
    message: `${appointment.bookingReference} — ${appointment.doctorName} on ${appointment.appointmentDate} at ${appointment.startTime}. Awaiting clinic confirmation.`,
    appointmentId: appointment.id,
    bookingReference: appointment.bookingReference,
  })
  notify({
    userId: doctor.userId,
    facilityId,
    kind: 'booking_submitted',
    title: 'New appointment request',
    message: `${appointment.patientName} requested ${appointment.bookingReference} on ${appointment.appointmentDate} at ${appointment.startTime}.`,
    appointmentId: appointment.id,
    bookingReference: appointment.bookingReference,
  })
  return appointment
}

/* ------------------------------------------------------------------ */
/*  Status machine                                                     */
/* ------------------------------------------------------------------ */

export function transitionAppointment(
  id: string,
  toStatus: AppointmentStatus,
  actor: AppointmentActor,
  opts: { reason?: string; requestedDate?: string; requestedStartTime?: string } = {},
): Appointment {
  const appointment = appointments.get(id)
  if (!appointment) throw new AppointmentError(404, 'Appointment not found.')
  const from = appointment.status
  const allowed = APPOINTMENT_TRANSITIONS[from] ?? []
  if (!allowed.includes(toStatus)) throw new AppointmentError(409, `Cannot change an appointment from "${from}" to "${toStatus}".`)

  const next: Appointment = { ...appointment, status: toStatus, updatedAt: now() }
  const terminal = toStatus === 'cancelled' || toStatus === 'rejected' || toStatus === 'no_show'
  if (toStatus === 'cancelled') next.cancellationReason = opts.reason?.trim() || undefined
  if (toStatus === 'checked_in') next.checkedInAt = now()
  if (toStatus === 'completed') next.completedAt = now()
  if (toStatus === 'no_show') next.noShowAt = now()

  if (toStatus === 'rescheduled') {
    if (!opts.requestedDate || !opts.requestedStartTime) throw new AppointmentError(400, 'A new date and time are required to reschedule.')
    const date = assertValidDate(opts.requestedDate)
    const startTime = assertValidTime(opts.requestedStartTime)
    const oldKey = next.slotKey
    const newKey = buildSlotKey(next.doctorId, date, startTime)
    if (date < todayDate()) throw new AppointmentError(400, 'Cannot reschedule to a past date.')
    if (newKey !== oldKey) {
      if (!isSlotKeyFree(newKey)) throw new AppointmentError(409, 'The requested slot is already booked.')
      releaseActiveSlot(oldKey)
      registerActiveSlot(newKey, next.id)
    }
    next.appointmentDate = date
    next.startTime = startTime
    next.durationMinutes = durationFor(next.doctorId, date, startTime)
    next.endTime = fromMinutes(toMinutes(startTime) + next.durationMinutes)
    next.slotKey = newKey
    next.rescheduleRequest = null
  }

  if (terminal) {
    next.active = false
    if (next.slotKey) releaseActiveSlot(next.slotKey)
  }

  appointments.set(id, next)
  persist(next)
  audit({
    appointmentId: next.id,
    bookingReference: next.bookingReference,
    facilityId: next.facilityId,
    previousStatus: from,
    newStatus: toStatus,
    action: `appointment.${actionForStatus(toStatus)}`,
    actor: actor.name,
    actorRole: actor.role,
    reason: opts.reason,
  })
  addAudit({
    facilityId: next.facilityId,
    sessionId: 'appointments',
    actor: actor.name,
    role: actor.role as UserRole,
    action: `appointment.${actionForStatus(toStatus)}`,
    detail: `Appointment ${next.bookingReference} → ${toStatus}.`,
    category: 'decision',
  })
  notifyStatus(next, from, toStatus, actor)
  return next
}

function actionForStatus(status: AppointmentStatus): string {
  switch (status) {
    case 'confirmed':
      return 'confirmed'
    case 'rejected':
      return 'rejected'
    case 'cancelled':
      return 'cancelled'
    case 'checked_in':
      return 'checked-in'
    case 'completed':
      return 'completed'
    case 'no_show':
      return 'no-show'
    case 'reschedule_requested':
      return 'reschedule-requested'
    case 'rescheduled':
      return 'rescheduled'
    default:
      return 'updated'
  }
}

function notifyStatus(appointment: Appointment, _fromStatus: AppointmentStatus, toStatus: AppointmentStatus, actor: AppointmentActor): void {
  const doctor = getDoctor(appointment.doctorId)
  const recipients: string[] = []
  if (appointment.patientId !== actor.id) recipients.push(appointment.patientId)
  if (toStatus === 'cancelled' || toStatus === 'reschedule_requested') {
    recipients.push(doctor?.userId ?? '')
  }
  const kind = KIND_BY_STATUS[toStatus] ?? 'booking_submitted'
  for (const userId of recipients.filter(Boolean)) {
    const isPatient = userId === appointment.patientId
    const message = isPatient
      ? `${appointment.bookingReference} for ${appointment.doctorName} on ${appointment.appointmentDate} at ${appointment.startTime} is now "${toStatus}".`
      : `${appointment.patientName}'s appointment ${appointment.bookingReference} is now "${toStatus}".`
    notify({
      userId,
      facilityId: appointment.facilityId,
      kind,
      title: appointmentTitle(toStatus),
      message,
      appointmentId: appointment.id,
      bookingReference: appointment.bookingReference,
    })
  }
}

const KIND_BY_STATUS: Partial<Record<AppointmentStatus, AppointmentNotificationKind>> = {
  confirmed: 'booking_confirmed',
  rejected: 'booking_rejected',
  rescheduled: 'rescheduled',
  cancelled: 'cancelled',
  checked_in: 'checked_in',
  completed: 'completed',
  no_show: 'booking_rejected',
}

type AppointmentNotificationKind = 'booking_submitted' | 'booking_confirmed' | 'booking_rejected' | 'reschedule_requested' | 'rescheduled' | 'cancelled' | 'checked_in' | 'completed' | 'reminder'

function appointmentTitle(status: AppointmentStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Appointment confirmed'
    case 'rejected':
      return 'Appointment request rejected'
    case 'cancelled':
      return 'Appointment cancelled'
    case 'checked_in':
      return 'Checked in'
    case 'completed':
      return 'Appointment completed'
    case 'rescheduled':
      return 'Appointment rescheduled'
    case 'reschedule_requested':
      return 'Reschedule requested'
    case 'no_show':
      return 'No-show recorded'
    default:
      return 'Appointment updated'
  }
}

/** Patient-initiated reschedule request (still needs staff approval). */
export function requestReschedule(id: string, input: RescheduleRequestInput, actor: AppointmentActor): Appointment {
  const appointment = appointments.get(id)
  if (!appointment) throw new AppointmentError(404, 'Appointment not found.')
  if (appointment.patientId !== actor.id && actor.role !== 'doctor') {
    throw new AppointmentError(403, 'Only the patient or their doctor can request a reschedule.')
  }
  const date = assertValidDate(input.requestedDate)
  const startTime = assertValidTime(input.requestedStartTime)
  if (date < todayDate()) throw new AppointmentError(400, 'Cannot reschedule to a past date.')
  const next: Appointment = {
    ...appointment,
    status: 'reschedule_requested',
    rescheduleRequest: {
      requestedDate: date,
      requestedStartTime: startTime,
      reason: input.reason?.trim().slice(0, 300) || undefined,
      requestedAt: now(),
      requestedBy: actor.name,
    },
    updatedAt: now(),
  }
  appointments.set(id, next)
  persist(next)
  audit({
    appointmentId: next.id,
    bookingReference: next.bookingReference,
    facilityId: next.facilityId,
    previousStatus: appointment.status,
    newStatus: 'reschedule_requested',
    action: 'appointment.reschedule-requested',
    actor: actor.name,
    actorRole: actor.role,
    reason: input.reason,
  })
  notify({
    userId: next.patientId,
    facilityId: next.facilityId,
    kind: 'reschedule_requested',
    title: 'Reschedule requested',
    message: `A new slot was requested for ${next.bookingReference}.`,
    appointmentId: next.id,
    bookingReference: next.bookingReference,
  })
  const doctor = getDoctor(next.doctorId)
  if (doctor) {
    notify({
      userId: doctor.userId,
      facilityId: next.facilityId,
      kind: 'reschedule_requested',
      title: 'Reschedule request',
      message: `${appointment.patientName} requested ${date} at ${startTime} for ${next.bookingReference}.`,
      appointmentId: next.id,
      bookingReference: next.bookingReference,
    })
  }
  return next
}

/** Doctor/approval response to a reschedule request. */
export function respondToReschedule(id: string, approve: boolean, opts: { requestedDate?: string; requestedStartTime?: string; reason?: string }, actor: AppointmentActor): Appointment {
  const appointment = appointments.get(id)
  if (!appointment) throw new AppointmentError(404, 'Appointment not found.')
  if (appointment.status !== 'reschedule_requested') throw new AppointmentError(409, 'There is no pending reschedule request to review.')
  if (approve) {
    return transitionAppointment(id, 'rescheduled', actor, { requestedDate: opts.requestedDate, requestedStartTime: opts.requestedStartTime, reason: opts.reason })
  }
  const next: Appointment = { ...appointment, status: 'confirmed', rescheduleRequest: null, updatedAt: now() }
  appointments.set(id, next)
  persist(next)
  audit({
    appointmentId: next.id,
    bookingReference: next.bookingReference,
    facilityId: next.facilityId,
    previousStatus: 'reschedule_requested',
    newStatus: 'confirmed',
    action: 'appointment.reschedule-rejected',
    actor: actor.name,
    actorRole: actor.role,
    reason: opts.reason ?? 'Reschedule not approved.',
  })
  notify({
    userId: next.patientId,
    facilityId: next.facilityId,
    kind: 'booking_confirmed',
    title: 'Original slot kept',
    message: `The clinic kept ${next.bookingReference} on ${next.appointmentDate} at ${next.startTime}.`,
    appointmentId: next.id,
    bookingReference: next.bookingReference,
  })
  return next
}

/* ------------------------------------------------------------------ */
/*  Analytics                                                          */
/* ------------------------------------------------------------------ */

export function appointmentAnalytics(facilityId: string): AppointmentAnalytics {
  const rows = listAppointmentsForFacility(facilityId)
  const totals = {
    bookings: rows.length,
    confirmed: rows.filter((a) => a.status === 'confirmed' || a.status === 'rescheduled' || a.status === 'checked_in').length,
    pending: rows.filter((a) => a.status === 'pending' || a.status === 'reschedule_requested').length,
    cancelled: rows.filter((a) => a.status === 'cancelled').length,
    completed: rows.filter((a) => a.status === 'completed').length,
    checkedIn: rows.filter((a) => a.status === 'checked_in').length,
    noShow: rows.filter((a) => a.status === 'no_show').length,
    cancellationRate: rows.length === 0 ? 0 : Math.round((rows.filter((a) => a.status === 'cancelled').length / rows.length) * 1000) / 10,
  }
  const byDepartmentMap = new Map<string, { departmentId: string; departmentName: string; count: number }>()
  const byDoctorMap = new Map<string, { doctorId: string; doctorName: string; count: number; completed: number }>()
  const byFacilityMap = new Map<string, { facilityId: string; facilityName: string; count: number }>()
  const dailyMap = new Map<string, number>()
  for (const a of rows) {
    byDepartmentMap.set(a.departmentId, {
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      count: (byDepartmentMap.get(a.departmentId)?.count ?? 0) + 1,
    })
    byDoctorMap.set(a.doctorId, {
      doctorId: a.doctorId,
      doctorName: a.doctorName,
      count: (byDoctorMap.get(a.doctorId)?.count ?? 0) + 1,
      completed: (byDoctorMap.get(a.doctorId)?.completed ?? 0) + (a.status === 'completed' ? 1 : 0),
    })
    byFacilityMap.set(a.facilityId, {
      facilityId: a.facilityId,
      facilityName: a.facilityId,
      count: (byFacilityMap.get(a.facilityId)?.count ?? 0) + 1,
    })
    dailyMap.set(a.appointmentDate, (dailyMap.get(a.appointmentDate) ?? 0) + 1)
  }
  return {
    totals,
    byDepartment: [...byDepartmentMap.values()].sort((a, b) => b.count - a.count),
    byDoctor: [...byDoctorMap.values()].sort((a, b) => b.count - a.count),
    byFacility: [...byFacilityMap.values()],
    daily: [...dailyMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/* ------------------------------------------------------------------ */
/*  Boot + hydration + seeds                                           */
/* ------------------------------------------------------------------ */

/**
 * Seed-only creation that bypasses the "no past dates" rule so the demo
 * dataset can include completed/cancelled/historical appointments. Slots on
 * future dates still validate and claim the concurrency registry.
 */
export function seedDemoBooking(input: {
  patientId: string
  patientName: string
  doctorId: string
  appointmentDate: string
  startTime: string
  visitReason: string
  status: AppointmentStatus
  bookingMode?: BookingMode
  priority?: AppointmentPriority
}): Appointment {
  const doctor = getDoctor(input.doctorId)
  if (!doctor) throw new AppointmentError(404, 'Doctor not found.')
  const date = assertValidDate(input.appointmentDate)
  const startTime = assertValidTime(input.startTime)
  const duration = durationFor(doctor.id, date, startTime)
  const slotKey = buildSlotKey(doctor.id, date, startTime)
  const futureDate = date >= todayDate()
  const terminal = ['cancelled', 'rejected', 'no_show', 'completed'].includes(input.status)
  if (futureDate && !terminal) {
    if (!isSlotKeyFree(slotKey)) throw new AppointmentError(409, 'Slot conflict while seeding sample data.')
    registerActiveSlot(slotKey, `seed-${date}-${startTime}`)
  }
  const bookingMode = input.bookingMode ?? 'direct'
  const stamp = now()
  const appointment: Appointment = {
    id: `apt-${randomUUID().slice(0, 8)}`,
    bookingReference: uniqueBookingReference(),
    facilityId: doctor.facilityId,
    patientId: input.patientId,
    patientName: input.patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    departmentId: doctor.departmentId,
    departmentName: getDepartment(doctor.departmentId)?.name ?? 'General',
    appointmentDate: date,
    startTime,
    endTime: fromMinutes(toMinutes(startTime) + duration),
    durationMinutes: duration,
    visitReason: input.visitReason,
    consultationType: doctor.consultationType,
    bookingMode,
    status: input.status,
    priority: input.priority ?? 'routine',
    slotKey,
    active: futureDate && !terminal,
    createdBy: 'Seed',
    createdByRole: 'system-admin',
    createdAt: stamp,
    updatedAt: stamp,
  }
  appointments.set(appointment.id, appointment)
  persist(appointment)
  audit({
    appointmentId: appointment.id,
    bookingReference: appointment.bookingReference,
    facilityId: appointment.facilityId,
    newStatus: input.status,
    action: 'appointment.seeded',
    actor: 'Seed',
    actorRole: 'system-admin',
    reason: 'Synthetic demo data.',
  })
  return appointment
}

export function clearAppointments(): void {
  appointments.clear()
  appointmentAudits.clear()
}

export async function hydrateAppointments(): Promise<void> {
  const rows = await listPersistedAppointments()
  appointments.clear()
  for (const appointment of rows) {
    appointments.set(appointment.id, appointment)
    if (appointment.active && appointment.slotKey) registerActiveSlot(appointment.slotKey, appointment.id)
  }
  const auditRows = await listPersistedAppointmentAudits()
  appointmentAudits.clear()
  for (const entry of auditRows) appointmentAudits.set(entry.id, entry)
}

export function deleteAppointment(id: string, facilityId: string, actor: AppointmentActor): void {
  const appointment = appointments.get(id)
  if (!appointment) throw new AppointmentError(404, 'Appointment not found.')
  if (appointment.facilityId !== facilityId) throw new AppointmentError(404, 'Appointment not found.')
  releaseActiveSlot(appointment.slotKey)
  appointments.delete(id)
  if (persistenceEnabled()) enqueue('appointment:' + id, () => deletePersisted(id))
  addAudit({
    facilityId,
    sessionId: 'appointments',
    actor: actor.name,
    role: actor.role as UserRole,
    action: 'appointment.deleted',
    detail: `Appointment ${appointment.bookingReference} deleted.`,
    category: 'system',
  })
}