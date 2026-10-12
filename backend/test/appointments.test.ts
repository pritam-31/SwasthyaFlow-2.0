import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/app'
import { clearAudit } from '../src/services/auditStore'
import { seedUsers } from '../src/services/authStore'
import { clearFacilities, seedDefaultFacility } from '../src/services/facilityService'
import { clearSessions } from '../src/services/sessionStore'
import { seedAppointmentDemoData } from '../src/db/bootstrap'
import { addDays, clearDoctors, todayDate } from '../src/services/doctorService'
import { clearDepartments } from '../src/services/departmentService'
import { clearAppointments } from '../src/services/appointmentService'
import { clearNotifications } from '../src/services/notificationService'

interface HttpResult {
  status: number
  body: Record<string, unknown>
}

interface DoctorRow {
  id: string
  name: string
  departmentId: string
}

interface SlotRow {
  time: string
}

describe('appointment management API (HTTP)', () => {
  let server: Server
  let base = ''
  let admin = ''
  let nurse = ''
  let doctorTok = ''
  let patient = ''
  let doctorId = ''

  before(async () => {
    clearAudit()
    clearSessions()
    clearFacilities()
    clearDepartments()
    clearDoctors()
    clearAppointments()
    clearNotifications()
    seedUsers()
    seedDefaultFacility()
    seedAppointmentDemoData()
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    admin = await login('admin', 'Admin@123')
    nurse = await login('nurse', 'Nurse@123')
    doctorTok = await login('doctor', 'Doctor@123')
    patient = await login('patient', 'Patient@123')
    const doctors = await request('GET', '/api/doctors', undefined, admin)
    const rows = doctors.body.doctors as DoctorRow[]
    const mehta = rows.find((d) => d.name.includes('Mehta'))
    assert.ok(mehta, 'seeded doctor profile should exist for the demo doctor user')
    doctorId = mehta.id
  })

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function login(username: string, password: string): Promise<string> {
    const res = await request('POST', '/api/auth/login', { username, password })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return String(res.body.token)
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    headers: Record<string, string> = {},
  ): Promise<HttpResult> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
  }

  async function firstOpenSlot(from: string): Promise<{ date: string; time: string }> {
    const res = await request('GET', `/api/doctors/${doctorId}/next-available?from=${from}`, undefined, patient)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const availability = res.body.availability as { date: string; slot: SlotRow }
    assert.ok(availability?.date, 'expected an available date within the horizon')
    return { date: availability.date, time: availability.slot.time }
  }

  async function bookAsPatient(date: string, time: string, reason: string): Promise<string> {
    const created = await request('POST', '/api/appointments', { doctorId, appointmentDate: date, startTime: time, visitReason: reason, departmentId: undefined }, patient)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    return (created.body.appointment as { id: string }).id
  }

  it('seeds a department directory and doctor directory scoped to the facility', async () => {
    const departments = await request('GET', '/api/departments', undefined, patient)
    assert.equal(departments.status, 200)
    const rows = departments.body.departments as Array<{ name: string }>
    assert.ok(rows.length >= 5)
    assert.ok(rows.some((d) => d.name === 'General Medicine'))
  })

  it('lets a patient see open slots for a doctor with their schedule', async () => {
    const slot = await firstOpenSlot(todayDate())
    const slots = await request('GET', `/api/doctors/${doctorId}/slots?date=${slot.date}`, undefined, patient)
    assert.equal(slots.status, 200)
    const list = slots.body.slots as SlotRow[]
    assert.ok(list.length > 0)
    assert.ok(list.some((s) => s.time === slot.time))
  })

  it('books an appointment for the patient and locks the slot', async () => {
    const slot = await firstOpenSlot(addDays(todayDate(), 1))
    const created = await request(
      'POST',
      '/api/appointments',
      {
        doctorId,
        appointmentDate: slot.date,
        startTime: slot.time,
        visitReason: 'Persistent fatigue for two weeks.',
      },
      patient,
    )
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const appointment = created.body.appointment as { id: string; bookingReference: string; bookingMode: string }
    assert.ok(appointment.bookingReference.startsWith('SF-'))
    assert.equal(appointment.bookingMode, 'direct')

    // The same slot must now be rejected (concurrency guard).
    const dup = await request(
      'POST',
      '/api/appointments',
      {
        doctorId,
        appointmentDate: slot.date,
        startTime: slot.time,
        visitReason: 'Another patient wants the same slot.',
      },
      patient,
    )
    assert.equal(dup.status, 409, JSON.stringify(dup.body))
  })

  it('walks the appointment through the staff workflow: confirm → check-in → complete', async () => {
    const slot = await firstOpenSlot(addDays(todayDate(), 2))
    const id = await bookAsPatient(slot.date, slot.time, 'Follow-up needed.')

    // Patients must not be allowed to self-confirm.
    const forbidden = await request('PATCH', `/api/appointments/${id}/status`, { status: 'confirmed' }, patient)
    assert.equal(forbidden.status, 403)

    const confirmed = await request('PATCH', `/api/appointments/${id}/status`, { status: 'confirmed' }, nurse)
    assert.equal(confirmed.status, 200)
    assert.equal((confirmed.body.appointment as { status: string }).status, 'confirmed')

    const checkedIn = await request('POST', `/api/appointments/${id}/check-in`, undefined, nurse)
    assert.equal(checkedIn.status, 200)
    assert.equal((checkedIn.body.appointment as { status: string }).status, 'checked_in')

    const completed = await request('POST', `/api/appointments/${id}/complete`, undefined, doctorTok)
    assert.equal(completed.status, 200)
    assert.equal((completed.body.appointment as { status: string }).status, 'completed')
  })

  it('supports a patient reschedule request needing doctor approval', async () => {
    const slot = await firstOpenSlot(addDays(todayDate(), 1))
    const id = await bookAsPatient(slot.date, slot.time, 'Lab review.')

    const newSlot = await firstOpenSlot(addDays(slot.date, 1))
    const requested = await request(
      'POST',
      `/api/appointments/${id}/reschedule`,
      { requestedDate: newSlot.date, requestedStartTime: newSlot.time, reason: 'Clash with work schedule.' },
      patient,
    )
    assert.equal(requested.status, 200, JSON.stringify(requested.body))
    assert.equal((requested.body.appointment as { status: string }).status, 'reschedule_requested')

    const approved = await request(
      'POST',
      `/api/appointments/${id}/reschedule/decision`,
      { approved: true, requestedDate: newSlot.date, requestedStartTime: newSlot.time },
      doctorTok,
    )
    assert.equal(approved.status, 200, JSON.stringify(approved.body))
    const afterApproval = approved.body.appointment as { status: string; appointmentDate: string; startTime: string }
    assert.equal(afterApproval.status, 'rescheduled')
    assert.equal(afterApproval.appointmentDate, newSlot.date)
  })

  it('requires a reason to cancel and cancels on valid reason', async () => {
    const slot = await firstOpenSlot(addDays(todayDate(), 3))
    const id = await bookAsPatient(slot.date, slot.time, 'Another visit.')

    const noReason = await request('POST', `/api/appointments/${id}/cancel`, {}, patient)
    assert.equal(noReason.status, 400)

    const cancelled = await request('POST', `/api/appointments/${id}/cancel`, { reason: 'Patient no longer needs the visit.' }, patient)
    assert.equal(cancelled.status, 200)
    assert.equal((cancelled.body.appointment as { status: string }).status, 'cancelled')
  })

  it('produces notifications for the patient and tracks unread state', async () => {
    const feed = await request('GET', '/api/notifications', undefined, patient)
    assert.equal(feed.status, 200)
    const items = feed.body.notifications as Array<{ id: string; read: boolean }>
    assert.ok(items.length > 0)
    const unread = await request('GET', '/api/notifications/unread-count', undefined, patient)
    assert.ok((unread.body.unread as number) > 0)

    const target = items.find((n) => !n.read)
    if (target) {
      const marked = await request('PATCH', `/api/notifications/${target.id}/read`, undefined, patient)
      assert.equal(marked.status, 200)
      assert.equal((marked.body.notification as { read: boolean }).read, true)
    }
  })

  it('exposes admin analytics and a filterable facility view', async () => {
    const analytics = await request('GET', '/api/admin/appointments/analytics', undefined, admin)
    assert.equal(analytics.status, 200)
    const totals = (analytics.body.analytics as { totals: { bookings: number } }).totals
    assert.ok(totals.bookings >= 1)

    const roster = await request('GET', '/api/admin/appointments', undefined, admin)
    assert.equal(roster.status, 200)
    assert.ok((roster.body.appointments as unknown[]).length >= 1)
  })

  it('rejects ill-formed booking requests and validates inputs', async () => {
    const bad = await request('POST', '/api/appointments', { doctorId, appointmentDate: 'not-a-date', startTime: '25:99', visitReason: 'x' }, patient)
    assert.equal(bad.status, 400)
  })
})