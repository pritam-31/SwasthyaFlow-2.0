import { Request, Router } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import {
  bookAppointment,
  getAppointment,
  listAppointmentAudits,
  listAppointmentsByDoctor,
  listAppointmentsByPatient,
  listAppointmentsForFacility,
  requestReschedule,
  respondToReschedule,
  transitionAppointment,
  deleteAppointment as serviceDeleteAppointment,
} from '../services/appointmentService'
import { getDoctorByUserId } from '../services/doctorService'
import type { Appointment, AppointmentStatus } from '../types/appointment.types'

export const appointmentsRouter = Router()

const STAFF = ['admin', 'facility-admin', 'system-admin']

function requireAppointmentInScope(req: Request, id: string) {
  const appointment = getAppointment(id)
  if (!appointment || appointment.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Appointment not found.')
  return appointment
}

function actorFrom(req: Request) {
  const user = authUser(req)
  return { id: user.id, name: user.displayName, role: user.role }
}

/** Patient → own appointments; doctor → their roster; staff → facility. */
appointmentsRouter.get('/', requireAuth, (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const { status } = req.query
  let rows: Appointment[]
  if (user.role === 'patient') {
    rows = listAppointmentsByPatient(user.id, facilityId)
  } else if (user.role === 'doctor') {
    const profile = getDoctorByUserId(user.id)
    rows = profile ? listAppointmentsByDoctor(profile.id, facilityId) : []
  } else {
    rows = listAppointmentsForFacility(facilityId)
  }
  if (typeof status === 'string' && status) rows = rows.filter((a) => a.status === status)
  res.json({ appointments: rows })
})

appointmentsRouter.get('/my', requireAuth, (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const doctorProfile = user.role === 'doctor' ? getDoctorByUserId(user.id) : undefined
  const rows = user.role === 'doctor' && doctorProfile
    ? listAppointmentsByDoctor(doctorProfile.id, facilityId)
    : listAppointmentsByPatient(user.id, facilityId)
  res.json({ appointments: rows })
})

/** Create a booking. Patients book for themselves; staff can book for a session (triage integration). */
appointmentsRouter.post('/', requireAuth, (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const body = req.body ?? {}
  let patientId = String(body.patientId ?? '')
  let patientName = String(body.patientName ?? '').trim()
  if (user.role === 'patient') {
    patientId = user.id
    patientName = user.displayName
  }
  if (body.sessionId && !STAFF.includes(user.role) && user.role !== 'nurse' && user.role !== 'doctor') {
    throw new HttpError(403, 'Only clinical staff can create triage-linked bookings.')
  }
  const appointment = bookAppointment(
    {
      patientId,
      patientName,
      doctorId: String(body.doctorId ?? ''),
      departmentId: body.departmentId ? String(body.departmentId) : undefined,
      appointmentDate: String(body.appointmentDate ?? ''),
      startTime: String(body.startTime ?? ''),
      visitReason: String(body.visitReason ?? ''),
      consultationType: body.consultationType,
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      bookingMode: body.bookingMode ?? 'direct',
      priority: body.priority,
    },
    actorFrom(req),
    facilityId,
  )
  res.status(201).json({ appointment })
})

appointmentsRouter.get('/:id', requireAuth, (req, res) => {
  const user = authUser(req)
  const appointment = requireAppointmentInScope(req, req.params.id)
  if (user.role === 'patient' && appointment.patientId !== user.id) throw new HttpError(404, 'Appointment not found.')
  if (user.role === 'doctor') {
    const profile = getDoctorByUserId(user.id)
    if (profile && appointment.doctorId !== profile.id) throw new HttpError(404, 'Appointment not found.')
  }
  res.json({ appointment })
})

/** Staff workflow transitions: confirm / reject / check-in / complete / no-show. */
appointmentsRouter.patch('/:id/status', requireAuth, requireRole('doctor', 'nurse', 'facility-admin', 'system-admin'), (req, res) => {
  const appointment = requireAppointmentInScope(req, req.params.id)
  const toStatus = String(req.body?.status ?? '') as AppointmentStatus
  const allowed: AppointmentStatus[] = ['confirmed', 'rejected', 'checked_in', 'completed', 'no_show', 'cancelled']
  if (!allowed.includes(toStatus)) throw new HttpError(400, 'Invalid target status.')
  const updated = transitionAppointment(appointment.id, toStatus, actorFrom(req), { reason: req.body?.reason ? String(req.body.reason) : undefined })
  res.json({ appointment: updated })
})

appointmentsRouter.post('/:id/cancel', requireAuth, (req, res) => {
  const user = authUser(req)
  const appointment = requireAppointmentInScope(req, req.params.id)
  const isOwner = appointment.patientId === user.id
  const isDoctor = user.role === 'doctor' && getDoctorByUserId(user.id)?.id === appointment.doctorId
  if (!isOwner && !isDoctor && !STAFF.includes(user.role) && user.role !== 'nurse') throw new HttpError(403, 'Not allowed to cancel this appointment.')
  const reason = String(req.body?.reason ?? '').trim()
  if (!reason) throw new HttpError(400, 'A cancellation reason is required.')
  const updated = transitionAppointment(appointment.id, 'cancelled', actorFrom(req), { reason })
  res.json({ appointment: updated })
})

/** Patient- or doctor-initiated reschedule request (needs clinic approval). */
appointmentsRouter.post('/:id/reschedule', requireAuth, (req, res) => {
  const user = authUser(req)
  const appointment = requireAppointmentInScope(req, req.params.id)
  const isOwner = appointment.patientId === user.id
  const isDoctor = user.role === 'doctor' && getDoctorByUserId(user.id)?.id === appointment.doctorId
  if (!isOwner && !isDoctor && !STAFF.includes(user.role) && user.role !== 'nurse') throw new HttpError(403, 'Not allowed to reschedule this appointment.')
  const body = req.body ?? {}
  const updated = requestReschedule(
    appointment.id,
    {
      requestedDate: String(body.requestedDate ?? ''),
      requestedStartTime: String(body.requestedStartTime ?? ''),
      reason: body.reason ? String(body.reason) : undefined,
    },
    actorFrom(req),
  )
  res.json({ appointment: updated })
})

/** Doctor/nurse approval or rejection of a pending reschedule request. */
appointmentsRouter.post('/:id/reschedule/decision', requireAuth, requireRole('doctor', 'nurse', 'facility-admin', 'system-admin'), (req, res) => {
  const appointment = requireAppointmentInScope(req, req.params.id)
  const body = req.body ?? {}
  const approved = Boolean(body.approved)
  const updated = respondToReschedule(appointment.id, approved, {
    requestedDate: body.requestedDate ? String(body.requestedDate) : appointment.rescheduleRequest?.requestedDate,
    requestedStartTime: body.requestedStartTime ? String(body.requestedStartTime) : appointment.rescheduleRequest?.requestedStartTime,
    reason: body.reason ? String(body.reason) : undefined,
  }, actorFrom(req))
  res.json({ appointment: updated })
})

appointmentsRouter.post('/:id/check-in', requireAuth, requireRole('nurse', 'facility-admin', 'doctor'), (req, res) => {
  const appointment = requireAppointmentInScope(req, req.params.id)
  const updated = transitionAppointment(appointment.id, 'checked_in', actorFrom(req))
  res.json({ appointment: updated })
})

appointmentsRouter.post('/:id/complete', requireAuth, requireRole('doctor', 'facility-admin', 'system-admin'), (req, res) => {
  const appointment = requireAppointmentInScope(req, req.params.id)
  const updated = transitionAppointment(appointment.id, 'completed', actorFrom(req))
  res.json({ appointment: updated })
})

appointmentsRouter.get('/:id/audit', requireAuth, (req, res) => {
  const user = authUser(req)
  const appointment = requireAppointmentInScope(req, req.params.id)
  if (user.role === 'patient' && appointment.patientId !== user.id) throw new HttpError(404, 'Appointment not found.')
  res.json({ audit: listAppointmentAudits(appointment.id), appointment })
})

appointmentsRouter.delete('/:id', requireAuth, requireRole('facility-admin', 'system-admin'), (req, res) => {
  const appointment = requireAppointmentInScope(req, req.params.id)
  serviceDeleteAppointment(appointment.id, facilityIdOf(req), actorFrom(req))
  res.status(204).end()
})