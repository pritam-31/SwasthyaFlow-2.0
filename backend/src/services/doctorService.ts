import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { deleteDoctor as deletePersistedDoctor, listPersistedDoctors, upsertDoctor } from '../repositories/doctorRepository'
import {
  deleteAvailabilityWindow as deletePersistedWindow,
  listPersistedAvailability,
  upsertAvailabilityWindow,
} from '../repositories/doctorAvailabilityRepository'
import { CONSULTATION_TYPES, type AvailabilityWindow, type AvailabilityWindowInput, type Department, type DoctorProfile, type DoctorCreateInput, type ConsultationType } from '../types/appointment.types'
import { addAudit } from './auditStore'
import { getDepartment } from './departmentService'

export class DoctorError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const doctors = new Map<string, DoctorProfile>()
const availability = new Map<string, AvailabilityWindow>()

function persistDoctor(doctor: DoctorProfile): void {
  if (!persistenceEnabled()) return
  enqueue('doctor:' + doctor.id, () => upsertDoctor({ ...doctor }))
}

function persistWindow(window: AvailabilityWindow): void {
  if (!persistenceEnabled()) return
  enqueue('doctor-availability:' + window.id, () => upsertAvailabilityWindow({ ...window }))
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
/*  Time helpers (24h "HH:MM" -> minutes since midnight)               */
/* ------------------------------------------------------------------ */

export function toMinutes(time: string): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim())
  if (!match) throw new DoctorError(400, `Invalid time "${time}" — expected HH:MM (24-hour).`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

/** Maps a YYYY-MM-DD date to its ISO day-of-week number (0 = Monday). */
export function dayOfWeekFor(date: string): number {
  const jsDay = new Date(`${date}T00:00:00`).getDay()
  return (jsDay + 6) % 7
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

export function getDoctor(id: string): DoctorProfile | undefined {
  return doctors.get(id)
}

export function getDoctorByUserId(userId: string): DoctorProfile | undefined {
  return [...doctors.values()].find((d) => d.userId === userId)
}

export function listDoctors(facilityId?: string): DoctorProfile[] {
  const all = [...doctors.values()].sort((a, b) => a.name.localeCompare(b.name))
  return facilityId ? all.filter((d) => d.facilityId === facilityId) : all
}

export function listDoctorsForFacility(facilityId: string): DoctorProfile[] {
  return listDoctors(facilityId).filter((d) => d.active)
}

export function getAvailabilityWindow(id: string): AvailabilityWindow | undefined {
  return availability.get(id)
}

export function listAvailability(doctorId: string): AvailabilityWindow[] {
  return [...availability.values()]
    .filter((w) => w.doctorId === doctorId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Active windows applicable on a given date (weekly + date-specific). */
export function windowsForDate(doctorId: string, date: string): AvailabilityWindow[] {
  const dow = dayOfWeekFor(date)
  const windows = listAvailability(doctorId).filter((w) => w.active)
  const dateSpecific = windows.filter((w) => w.kind === 'date' && w.date === date)
  if (dateSpecific.length > 0) return dateSpecific
  return windows.filter((w) => w.kind === 'weekly' && w.dayOfWeek === dow)
}

/* ------------------------------------------------------------------ */
/*  Writes: doctors                                                    */
/* ------------------------------------------------------------------ */

export function createDoctor(
  input: DoctorCreateInput,
  facilityId: string,
  actor: string,
  options?: { userId?: string },
): DoctorProfile {
  const name = normalizeText(input.name, 120)
  if (!name) throw new DoctorError(400, 'Doctor name is required.')
  const specialization = normalizeText(input.specialization, 120)
  if (!specialization) throw new DoctorError(400, 'Specialization is required.')
  if (!getDepartment(input.departmentId) || getDepartment(input.departmentId)?.facilityId !== facilityId) {
    throw new DoctorError(400, 'Department must belong to this facility.')
  }
  const consultationType = input.consultationType ?? 'general'
  if (!(CONSULTATION_TYPES as string[]).includes(consultationType)) throw new DoctorError(400, 'Invalid consultation type.')
  const stamp = now()
  const doctor: DoctorProfile = {
    id: `doc-${randomUUID().slice(0, 8)}`,
    userId: options?.userId ?? `usr-${randomUUID().slice(0, 8)}`,
    facilityId,
    departmentId: input.departmentId,
    name,
    specialization,
    qualifications: input.qualifications?.map((q) => q.trim()).filter(Boolean),
    experienceYears: input.experienceYears,
    consultationType,
    photoInitials: name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join(''),
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  }
  doctors.set(doctor.id, doctor)
  persistDoctor(doctor)
  addAudit({
    facilityId,
    sessionId: 'appointments',
    actor,
    role: 'system-admin',
    action: 'doctor.created',
    detail: `Doctor "${doctor.name}" (${doctor.specialization}) added to the directory.`,
    category: 'system',
  })
  return doctor
}

export function updateDoctor(
  id: string,
  patch: Partial<Pick<DoctorProfile, 'name' | 'specialization' | 'qualifications' | 'experienceYears' | 'consultationType' | 'departmentId' | 'active'>>,
  actor: string,
): DoctorProfile {
  const doctor = doctors.get(id)
  if (!doctor) throw new DoctorError(404, 'Doctor not found.')
  const next: DoctorProfile = { ...doctor, updatedAt: now() }
  if (patch.name !== undefined) {
    const name = normalizeText(patch.name, 120)
    if (!name) throw new DoctorError(400, 'Doctor name cannot be empty.')
    next.name = name
    next.photoInitials = name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join('')
  }
  if (patch.specialization !== undefined) {
    const specialization = normalizeText(patch.specialization, 120)
    if (!specialization) throw new DoctorError(400, 'Specialization cannot be empty.')
    next.specialization = specialization
  }
  if (patch.qualifications !== undefined) next.qualifications = patch.qualifications
  if (patch.experienceYears !== undefined) next.experienceYears = patch.experienceYears
  if (patch.consultationType !== undefined) {
    if (!(CONSULTATION_TYPES as string[]).includes(patch.consultationType)) throw new DoctorError(400, 'Invalid consultation type.')
    next.consultationType = patch.consultationType
  }
  if (patch.departmentId !== undefined) {
    if (!getDepartment(patch.departmentId) || getDepartment(patch.departmentId)?.facilityId !== doctor.facilityId) {
      throw new DoctorError(400, 'Department must belong to this facility.')
    }
    next.departmentId = patch.departmentId
  }
  if (patch.active !== undefined) next.active = Boolean(patch.active)
  doctors.set(id, next)
  persistDoctor(next)
  addAudit({
    facilityId: next.facilityId,
    sessionId: 'appointments',
    actor,
    role: 'system-admin',
    action: patch.active === false ? 'doctor.deactivated' : 'doctor.updated',
    detail: `Doctor "${next.name}" updated.`,
    category: 'system',
  })
  return next
}

export function deleteDoctor(id: string, facilityId: string, actor: string): void {
  const doctor = doctors.get(id)
  if (!doctor) throw new DoctorError(404, 'Doctor not found.')
  if (doctor.facilityId !== facilityId) throw new DoctorError(404, 'Doctor not found.')
  doctors.delete(id)
  if (persistenceEnabled()) enqueue('doctor:' + id, () => deletePersistedDoctor(id))
  addAudit({
    facilityId,
    sessionId: 'appointments',
    actor,
    role: 'system-admin',
    action: 'doctor.deleted',
    detail: `Doctor "${doctor.name}" removed from the directory.`,
    category: 'system',
  })
}

/* ------------------------------------------------------------------ */
/*  Writes: availability windows                                       */
/* ------------------------------------------------------------------ */

function normalizeWindowInput(input: AvailabilityWindowInput, doctorId: string, facilityId: string): AvailabilityWindow {
  const doctor = doctors.get(doctorId)
  if (!doctor) throw new DoctorError(404, 'Doctor not found.')
  if (doctor.facilityId !== facilityId) throw new DoctorError(404, 'Doctor not found.')
  if (input.kind !== 'weekly' && input.kind !== 'date') throw new DoctorError(400, 'kind must be weekly or date.')
  const start = toMinutes(input.startTime)
  const end = toMinutes(input.endTime)
  if (end <= start) throw new DoctorError(400, 'End time must be after start time.')
  const duration = input.durationMinutes ?? 15
  if (duration < 5 || duration > 240 || duration % 5 !== 0) throw new DoctorError(400, 'Duration must be between 5 and 240 minutes in 5-minute steps.')
  if (input.kind === 'weekly') {
    if (input.dayOfWeek === undefined || input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new DoctorError(400, 'dayOfWeek must be between 0 (Monday) and 6 (Sunday).')
  }
  if (input.kind === 'date') {
    if (!isValidDate(input.date)) throw new DoctorError(400, 'A valid date (YYYY-MM-DD) is required for a date window.')
  }
  if (input.breakStart !== undefined || input.breakEnd !== undefined) {
    if (!input.breakStart || !input.breakEnd || toMinutes(input.breakEnd) <= toMinutes(input.breakStart)) {
      throw new DoctorError(400, 'Break end time must be after break start time.')
    }
    if (toMinutes(input.breakStart) < start || toMinutes(input.breakEnd) > end) {
      throw new DoctorError(400, 'Break must fall inside the working window.')
    }
  }
  const stamp = now()
  return {
    id: `av-${randomUUID().slice(0, 8)}`,
    doctorId,
    facilityId,
    kind: input.kind,
    dayOfWeek: input.kind === 'weekly' ? input.dayOfWeek : undefined,
    date: input.kind === 'date' ? input.date : undefined,
    leave: input.kind === 'date' && input.leave ? true : undefined,
    startTime: fromMinutes(start),
    endTime: fromMinutes(end),
    durationMinutes: duration,
    breakStart: input.breakStart,
    breakEnd: input.breakEnd,
    maxAppointmentsPerDay: input.maxAppointmentsPerDay,
    active: input.active ?? true,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export function createAvailabilityWindow(input: AvailabilityWindowInput, doctorId: string, facilityId: string, actor: string): AvailabilityWindow {
  const window = normalizeWindowInput(input, doctorId, facilityId)
  availability.set(window.id, window)
  persistWindow(window)
  addAudit({
    facilityId,
    sessionId: 'appointments',
    actor,
    role: 'doctor',
    action: 'availability.created',
    detail: `Schedule window added for ${window.startTime}–${window.endTime} (${window.kind}).`,
    category: 'system',
  })
  return window
}

export function updateAvailabilityWindow(
  id: string,
  patch: { startTime?: string; endTime?: string; durationMinutes?: number; maxAppointmentsPerDay?: number; active?: boolean; leave?: boolean },
  actor: string,
): AvailabilityWindow {
  const existing = availability.get(id)
  if (!existing) throw new DoctorError(404, 'Availability window not found.')
  const next: AvailabilityWindow = { ...existing, updatedAt: now() }
  if (patch.active !== undefined) next.active = Boolean(patch.active)
  if (patch.leave !== undefined && next.kind === 'date') next.leave = patch.leave
  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    const start = patch.startTime !== undefined ? toMinutes(patch.startTime) : toMinutes(next.startTime)
    const end = patch.endTime !== undefined ? toMinutes(patch.endTime) : toMinutes(next.endTime)
    if (end <= start) throw new DoctorError(400, 'End time must be after start time.')
    next.startTime = fromMinutes(start)
    next.endTime = fromMinutes(end)
  }
  if (patch.durationMinutes !== undefined) {
    if (patch.durationMinutes < 5 || patch.durationMinutes > 240) throw new DoctorError(400, 'Duration must be between 5 and 240 minutes.')
    next.durationMinutes = patch.durationMinutes
  }
  if (patch.maxAppointmentsPerDay !== undefined) next.maxAppointmentsPerDay = patch.maxAppointmentsPerDay
  availability.set(id, next)
  persistWindow(next)
  addAudit({
    facilityId: next.facilityId,
    sessionId: 'appointments',
    actor,
    role: 'doctor',
    action: patch.active === false ? 'availability.deactivated' : 'availability.updated',
    detail: `Schedule window ${next.startTime}–${next.endTime} updated.`,
    category: 'system',
  })
  return next
}

export function deleteAvailabilityWindow(id: string, actor: string): void {
  const existing = availability.get(id)
  if (!existing) throw new DoctorError(404, 'Availability window not found.')
  availability.delete(id)
  if (persistenceEnabled()) enqueue('doctor-availability:' + id, () => deletePersistedWindow(id))
  addAudit({
    facilityId: existing.facilityId,
    sessionId: 'appointments',
    actor,
    role: 'doctor',
    action: 'availability.deleted',
    detail: `Schedule window removed.`,
    category: 'system',
  })
}

/* ------------------------------------------------------------------ */
/*  Slot generation                                                    */
/* ------------------------------------------------------------------ */

export interface OpenSlot {
  time: string
  endTime: string
  durationMinutes: number
}

export interface DayAvailability {
  doctorId: string
  date: string
  dayLabel: string
  slots: OpenSlot[]
}

/** Returns chronologically ordered open slots for a doctor on a date. */
export function openSlotsForDate(doctorId: string, date: string): OpenSlot[] {
  const windows = windowsForDate(doctorId, date)
  const generated = new Map<string, OpenSlot>()
  for (const window of windows) {
    if (window.leave) continue
    const start = toMinutes(window.startTime)
    const end = toMinutes(window.endTime)
    const duration = window.durationMinutes
    const breakStart = window.breakStart !== undefined ? toMinutes(window.breakStart) : -1
    const breakEnd = window.breakEnd !== undefined ? toMinutes(window.breakEnd) : -1
    for (let t = start; t + duration <= end; t += duration) {
      if (t >= breakStart && t < breakEnd) continue
      const time = fromMinutes(t)
      generated.set(time, { time, endTime: fromMinutes(t + duration), durationMinutes: duration })
    }
  }
  let slots = [...generated.values()].sort((a, b) => a.time.localeCompare(b.time))
  slots = slots.filter((s) => !hasActiveBooking(doctorId, date, s.time))
  if (date === todayDate()) {
    const nowMinutes = now().slice(11, 16) // HH:MM UTC — synthetic demo clocks are uniform
    /* istanbul ignore next */
    slots = slots.filter((s) => s.time >= nowMinutes)
  }
  const cap = effectiveDailyCap(doctorId, date)
  if (cap !== undefined && slots.length > cap) slots = slots.slice(0, cap)
  return slots
}

function hasActiveBooking(doctorId: string, date: string, startTime: string): boolean {
  const slotKey = `${doctorId}|${date}|${startTime}`
  return activeBySlotKey.has(slotKey)
}

function effectiveDailyCap(doctorId: string, date: string): number | undefined {
  const windows = windowsForDate(doctorId, date)
  const caps = windows.map((w) => w.maxAppointmentsPerDay).filter((c): c is number => c !== undefined)
  return caps.length > 0 ? Math.min(...caps) : undefined
}

export function availabilityForDate(doctorId: string, date: string): { date: string; isAvailable: boolean; slots: OpenSlot[] } {
  const windows = windowsForDate(doctorId, date)
  const isLeave = windows.some((w) => w.leave)
  const isAvailable = windows.length > 0 && !isLeave
  return { date, isAvailable: isAvailable && openSlotsForDate(doctorId, date).length > 0, slots: openSlotsForDate(doctorId, date) }
}

/** First date (within `horizonDays`) that has at least one open slot. */
export function nextAvailableAppointment(doctorId: string, fromDate: string, horizonDays = 30): { date: string; slot?: OpenSlot } | null {
  const doctor = doctors.get(doctorId)
  if (!doctor) return null
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addDays(fromDate, i)
    const slots = openSlotsForDate(doctorId, date)
    if (slots.length > 0) return { date, slot: slots[0] }
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Slot registry helpers used by the appointment service              */
/* ------------------------------------------------------------------ */

/** Active (non-terminal) bookings keyed by `slotKey` — the concurrency guard. */
const activeBySlotKey = new Map<string, { appointmentId: string }>()

export function registerActiveSlot(slotKey: string, appointmentId: string): void {
  activeBySlotKey.set(slotKey, { appointmentId })
}

export function releaseActiveSlot(slotKey: string): void {
  activeBySlotKey.delete(slotKey)
}

export function isSlotKeyFree(slotKey: string): boolean {
  return !activeBySlotKey.has(slotKey)
}

export function buildSlotKey(doctorId: string, date: string, startTime: string): string {
  return `${doctorId}|${date}|${startTime}`
}

export function resetSlotRegistry(): void {
  activeBySlotKey.clear()
}

/* ------------------------------------------------------------------ */
/*  Boot + hydration + seeds                                           */
/* ------------------------------------------------------------------ */

export function seedDoctorDirectory(departments: Department[], facilityId: string): DoctorProfile[] {
  const byName = new Map(departments.map((d) => [d.name.toLowerCase(), d]))
  const demo: Array<{
    department: string
    name: string
    specialization: string
    qualifications: string[]
    experienceYears: number
    consultationType: ConsultationType
  }> = [
    /* General Medicine — the demo "doctor" account (Dr. A. Mehta) is added by
       ensureDoctorForUser in bootstrap, so it is intentionally not listed here. */
    { department: 'General Medicine', name: 'Dr. Rohan Kulkarni', specialization: 'Internal Medicine', qualifications: ['MBBS', 'MD (Internal Medicine)'], experienceYears: 9, consultationType: 'general' },
    { department: 'General Medicine', name: 'Dr. Meera Iyer', specialization: 'Family Medicine', qualifications: ['MBBS', 'DNB (Family Medicine)'], experienceYears: 11, consultationType: 'general' },
    { department: 'General Medicine', name: 'Dr. Sandeep Rathore', specialization: 'Internal Medicine', qualifications: ['MBBS', 'MD (Internal Medicine)'], experienceYears: 7, consultationType: 'general' },
    { department: 'General Medicine', name: 'Dr. Kavita Nair', specialization: 'General Medicine', qualifications: ['MBBS', 'MD (General Medicine)'], experienceYears: 15, consultationType: 'general' },
    { department: 'General Medicine', name: 'Dr. Arjun Deshpande', specialization: 'Geriatric Medicine', qualifications: ['MBBS', 'MD (Geriatric Medicine)'], experienceYears: 13, consultationType: 'followup' },

    /* Pediatrics */
    { department: 'Pediatrics', name: 'Dr. Sunita Reddy', specialization: 'Pediatrics', qualifications: ['MBBS', 'MD (Pediatrics)'], experienceYears: 14, consultationType: 'general' },
    { department: 'Pediatrics', name: 'Dr. Vikram Joshi', specialization: 'Pediatrics', qualifications: ['MBBS', 'DCH', 'MD (Pediatrics)'], experienceYears: 10, consultationType: 'general' },
    { department: 'Pediatrics', name: 'Dr. Ananya Ghosh', specialization: 'Neonatology', qualifications: ['MBBS', 'MD (Pediatrics)'], experienceYears: 8, consultationType: 'checkup' },
    { department: 'Pediatrics', name: 'Dr. Ramesh Choudhary', specialization: 'Adolescent Medicine', qualifications: ['MBBS', 'DCH'], experienceYears: 9, consultationType: 'general' },
    { department: 'Pediatrics', name: 'Dr. Priya Menon', specialization: 'Pediatric Cardiology', qualifications: ['MBBS', 'DM (Pediatric Cardiology)'], experienceYears: 12, consultationType: 'urgent-review' },
    { department: 'Pediatrics', name: 'Dr. Tanvi Sachdeva', specialization: 'Pediatric Neurology', qualifications: ['MBBS', 'MD (Pediatrics)'], experienceYears: 11, consultationType: 'urgent-review' },

    /* Obstetrics & Gynaecology */
    { department: 'Obstetrics & Gynaecology', name: 'Dr. Shalini Kaur', specialization: 'Obstetrics & Gynaecology', qualifications: ['MBBS', 'MS (OBG)'], experienceYears: 16, consultationType: 'general' },
    { department: 'Obstetrics & Gynaecology', name: 'Dr. Neha Gupta', specialization: 'Obstetrics & Gynaecology', qualifications: ['MBBS', 'MS (OBG)'], experienceYears: 8, consultationType: 'general' },
    { department: 'Obstetrics & Gynaecology', name: 'Dr. Farhat Ali', specialization: 'Gynaecological Oncology', qualifications: ['MBBS', 'MS (OBG)', 'DM (Oncology)'], experienceYears: 13, consultationType: 'urgent-review' },
    { department: 'Obstetrics & Gynaecology', name: 'Dr. Divya Sharma', specialization: 'Maternal & Fetal Medicine', qualifications: ['MBBS', 'MS (OBG)'], experienceYears: 10, consultationType: 'checkup' },
    { department: 'Obstetrics & Gynaecology', name: 'Dr. Lakshmi Narayanan', specialization: 'Reproductive Medicine', qualifications: ['MBBS', 'MS (OBG)'], experienceYears: 11, consultationType: 'general' },
    { department: 'Obstetrics & Gynaecology', name: 'Dr. Ritu Bhalla', specialization: 'Obstetrics & Gynaecology', qualifications: ['MBBS', 'MS (OBG)'], experienceYears: 14, consultationType: 'followup' },

    /* Orthopaedics */
    { department: 'Orthopaedics', name: 'Dr. Rajesh Pillai', specialization: 'Orthopaedics', qualifications: ['MBBS', 'MS (Ortho)'], experienceYears: 17, consultationType: 'general' },
    { department: 'Orthopaedics', name: 'Dr. Amit Saxena', specialization: 'Joint Replacement', qualifications: ['MBBS', 'MS (Ortho)', 'DNB (Ortho)'], experienceYears: 12, consultationType: 'procedure' },
    { department: 'Orthopaedics', name: 'Dr. Harish Patel', specialization: 'Sports Medicine', qualifications: ['MBBS', 'MS (Ortho)'], experienceYears: 9, consultationType: 'general' },
    { department: 'Orthopaedics', name: 'Dr. Nandini Rao', specialization: 'Pediatric Orthopaedics', qualifications: ['MBBS', 'MS (Ortho)'], experienceYears: 10, consultationType: 'general' },
    { department: 'Orthopaedics', name: 'Dr. Manish Gupta', specialization: 'Trauma & Spine', qualifications: ['MBBS', 'MS (Ortho)'], experienceYears: 14, consultationType: 'urgent-review' },
    { department: 'Orthopaedics', name: 'Dr. Vedant Kulkarni', specialization: 'Orthopaedics', qualifications: ['MBBS', 'MS (Ortho)'], experienceYears: 8, consultationType: 'checkup' },

    /* Dermatology */
    { department: 'Dermatology', name: 'Dr. Sneha Kapoor', specialization: 'Dermatology', qualifications: ['MBBS', 'MD (Dermatology)'], experienceYears: 10, consultationType: 'general' },
    { department: 'Dermatology', name: 'Dr. Aditya Bansal', specialization: 'Dermatology', qualifications: ['MBBS', 'MD (Dermatology)'], experienceYears: 8, consultationType: 'general' },
    { department: 'Dermatology', name: 'Dr. Zoya Khan', specialization: 'Cosmetology', qualifications: ['MBBS', 'MD (Dermatology)'], experienceYears: 9, consultationType: 'checkup' },
    { department: 'Dermatology', name: 'Dr. Imran Sheikh', specialization: 'Dermatosurgery', qualifications: ['MBBS', 'MD (Dermatology)'], experienceYears: 12, consultationType: 'procedure' },
    { department: 'Dermatology', name: 'Dr. Pallavi Singh', specialization: 'Pediatric Dermatology', qualifications: ['MBBS', 'MD (Dermatology)'], experienceYears: 11, consultationType: 'general' },
    { department: 'Dermatology', name: 'Dr. Ankur Dutta', specialization: 'Cosmetology', qualifications: ['MBBS', 'MD (Dermatology)'], experienceYears: 7, consultationType: 'checkup' },
  ]
  const created: DoctorProfile[] = []
  for (const row of demo) {
    const department = byName.get(row.department.toLowerCase())
    if (!department || department.facilityId !== facilityId) continue
    if ([...doctors.values()].some((d) => d.facilityId === facilityId && d.name === row.name)) continue
    const stamp = now()
    const doctor: DoctorProfile = {
      id: `doc-${randomUUID().slice(0, 8)}`,
      userId: `usr-${randomUUID().slice(0, 8)}`,
      facilityId,
      departmentId: department.id,
      name: row.name,
      specialization: row.specialization,
      qualifications: row.qualifications,
      experienceYears: row.experienceYears,
      consultationType: row.consultationType,
      photoInitials: row.name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join(''),
      active: true,
      createdAt: stamp,
      updatedAt: stamp,
    }
    doctors.set(doctor.id, doctor)
    persistDoctor(doctor)
    created.push(doctor)
  }
  return created
}

/**
 * Inserts one seeded doctor when the directory is empty for a facility.
 * The doctor user is the demo "doctor" login when its userId is that user.
 */
export function ensureDoctorForUser(userId: string | undefined, facilityId: string, opts: {
  departmentId: string
  name: string
  specialization: string
  qualifications: string[]
  experienceYears: number
  consultationType: ConsultationType
}): DoctorProfile {
  const existing = userId ? getDoctorByUserId(userId) : undefined
  if (existing) return existing
  const stamp = now()
  const doctor: DoctorProfile = {
    id: `doc-${randomUUID().slice(0, 8)}`,
    userId: userId ?? `usr-${randomUUID().slice(0, 8)}`,
    facilityId,
    departmentId: opts.departmentId,
    name: opts.name,
    specialization: opts.specialization,
    qualifications: opts.qualifications,
    experienceYears: opts.experienceYears,
    consultationType: opts.consultationType,
    photoInitials: opts.name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? '').slice(0, 2).join(''),
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  }
  doctors.set(doctor.id, doctor)
  persistDoctor(doctor)
  return doctor
}

/** Sample recurring availability for a doctor — synthetic, development only. */
export function seedAvailabilityForDoctor(doctorId: string, facilityId: string): AvailabilityWindow[] {
  const created: AvailabilityWindow[] = []
  const defaults = [
    { dayOfWeek: 0, startTime: '09:00', endTime: '12:00', durationMinutes: 15, breakStart: '10:30', breakEnd: '10:45', maxAppointmentsPerDay: 12 },
    { dayOfWeek: 0, startTime: '14:00', endTime: '17:00', durationMinutes: 15, maxAppointmentsPerDay: 12 },
    { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', durationMinutes: 15, maxAppointmentsPerDay: 16 },
    { dayOfWeek: 2, startTime: '10:00', endTime: '14:00', durationMinutes: 20, maxAppointmentsPerDay: 12 },
    { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', durationMinutes: 15, maxAppointmentsPerDay: 12 },
    { dayOfWeek: 4, startTime: '09:00', endTime: '13:00', durationMinutes: 15, maxAppointmentsPerDay: 16 },
  ]
  for (const item of defaults) {
    const stamp = now()
    const window: AvailabilityWindow = {
      id: `av-${randomUUID().slice(0, 8)}`,
      doctorId,
      facilityId,
      kind: 'weekly',
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      durationMinutes: item.durationMinutes,
      breakStart: item.breakStart,
      breakEnd: item.breakEnd,
      maxAppointmentsPerDay: item.maxAppointmentsPerDay,
      active: true,
      createdAt: stamp,
      updatedAt: stamp,
    }
    availability.set(window.id, window)
    persistWindow(window)
    created.push(window)
  }
  return created
}

export async function hydrateDoctors(): Promise<void> {
  const rows = await listPersistedDoctors()
  doctors.clear()
  for (const doctor of rows) doctors.set(doctor.id, doctor)
}

export async function hydrateAvailability(): Promise<void> {
  const rows = await listPersistedAvailability()
  availability.clear()
  for (const window of rows) availability.set(window.id, window)
}

export function clearDoctors(): void {
  doctors.clear()
  availability.clear()
  resetSlotRegistry()
}