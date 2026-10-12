import { Request, Router } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import {
  createAvailabilityWindow,
  createDoctor,
  deleteAvailabilityWindow,
  deleteDoctor,
  getDoctor,
  getDoctorByUserId,
  listAvailability,
  listDoctors,
  nextAvailableAppointment,
  openSlotsForDate,
  updateAvailabilityWindow,
  updateDoctor,
  windowsForDate,
} from '../services/doctorService'

export const doctorsRouter = Router()

function requireDoctorInScope(req: Request, id: string) {
  const doctor = getDoctor(id)
  if (!doctor || doctor.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Doctor not found.')
  return doctor
}

function isDoctorSelf(req: Request, doctorId: string): boolean {
  const profile = getDoctorByUserId(authUser(req).id)
  return profile?.id === doctorId
}

function isSelfOrAdmin(req: Request, doctorId: string): boolean {
  const user = authUser(req)
  return user.role === 'admin' || user.role === 'facility-admin' || isDoctorSelf(req, doctorId)
}

/** Directory. Patients see active doctors; staff/admins see all. */
doctorsRouter.get('/', requireAuth, (_req, res) => {
  const user = authUser(_req)
  const doctors = listDoctors(facilityIdOf(_req)).filter((d) => (user.role === 'patient' ? d.active : true))
  res.json({ doctors })
})

doctorsRouter.get('/me', requireAuth, (req, res) => {
  const profile = getDoctorByUserId(authUser(req).id)
  if (!profile || profile.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'No doctor profile found for the current user.')
  res.json({ doctor: profile })
})

doctorsRouter.get('/:id', requireAuth, (req, res) => {
  res.json({ doctor: requireDoctorInScope(req, req.params.id) })
})

doctorsRouter.post('/', requireAuth, requireRole('admin', 'facility-admin', 'system-admin'), (req, res) => {
  const actor = authUser(req)
  const body = req.body ?? {}
  const doctor = createDoctor(
    {
      name: body.name,
      specialization: body.specialization,
      departmentId: body.departmentId,
      qualifications: body.qualifications,
      experienceYears: body.experienceYears,
      consultationType: body.consultationType,
      userId: body.userId,
    },
    facilityIdOf(req),
    actor.displayName,
  )
  res.status(201).json({ doctor })
})

doctorsRouter.patch('/:id', requireAuth, requireRole('admin', 'facility-admin', 'system-admin'), (req, res) => {
  const actor = authUser(req)
  const doctor = requireDoctorInScope(req, req.params.id)
  const body = req.body ?? {}
  const updated = updateDoctor(
    doctor.id,
    {
      name: body.name,
      specialization: body.specialization,
      departmentId: body.departmentId,
      qualifications: body.qualifications,
      experienceYears: body.experienceYears,
      consultationType: body.consultationType,
      active: body.active,
    },
    actor.displayName,
  )
  res.json({ doctor: updated })
})

doctorsRouter.delete('/:id', requireAuth, requireRole('admin', 'facility-admin', 'system-admin'), (req, res) => {
  const actor = authUser(req)
  const doctor = requireDoctorInScope(req, req.params.id)
  deleteDoctor(doctor.id, facilityIdOf(req), actor.displayName)
  res.status(204).end()
})

/* ------------------------------------------------------------------ */
/*  Availability & slots                                               */
/* ------------------------------------------------------------------ */

doctorsRouter.get('/:id/availability', requireAuth, (req, res) => {
  const doctor = requireDoctorInScope(req, req.params.id)
  res.json({ availability: listAvailability(doctor.id) })
})

doctorsRouter.post('/:id/availability', requireAuth, requireRole('admin', 'facility-admin', 'doctor'), (req, res) => {
  const actor = authUser(req)
  const doctor = requireDoctorInScope(req, req.params.id)
  if (!isSelfOrAdmin(req, doctor.id)) throw new HttpError(403, 'Only the doctor or a facility admin may edit their schedule.')
  const body = req.body ?? {}
  const window = createAvailabilityWindow(
    {
      kind: body.kind,
      dayOfWeek: body.dayOfWeek,
      date: body.date,
      leave: body.leave,
      startTime: body.startTime,
      endTime: body.endTime,
      durationMinutes: body.durationMinutes,
      breakStart: body.breakStart,
      breakEnd: body.breakEnd,
      maxAppointmentsPerDay: body.maxAppointmentsPerDay,
      active: body.active,
    },
    doctor.id,
    facilityIdOf(req),
    actor.displayName,
  )
  res.status(201).json({ window })
})

doctorsRouter.patch('/availability/:windowId', requireAuth, requireRole('admin', 'facility-admin', 'doctor'), (req, res) => {
  const actor = authUser(req)
  const window = [...listDoctors(facilityIdOf(req))].map((d) => listAvailability(d.id)).flat().find((w) => w.id === req.params.windowId)
  if (!window) throw new HttpError(404, 'Availability window not found.')
  if (!isSelfOrAdmin(req, window.doctorId)) throw new HttpError(403, 'Only the doctor or a facility admin may edit this window.')
  const body = req.body ?? {}
  const updated = updateAvailabilityWindow(
    window.id,
    {
      startTime: body.startTime,
      endTime: body.endTime,
      durationMinutes: body.durationMinutes,
      maxAppointmentsPerDay: body.maxAppointmentsPerDay,
      active: body.active,
      leave: body.leave,
    },
    actor.displayName,
  )
  res.json({ window: updated })
})

doctorsRouter.delete('/availability/:windowId', requireAuth, requireRole('admin', 'facility-admin', 'doctor'), (req, res) => {
  const actor = authUser(req)
  const window = [...listDoctors(facilityIdOf(req))].map((d) => listAvailability(d.id)).flat().find((w) => w.id === req.params.windowId)
  if (!window) throw new HttpError(404, 'Availability window not found.')
  if (!isSelfOrAdmin(req, window.doctorId)) throw new HttpError(403, 'Only the doctor or a facility admin may delete this window.')
  deleteAvailabilityWindow(window.id, actor.displayName)
  res.status(204).end()
})

/** Open slots for a doctor on a specific date. */
doctorsRouter.get('/:id/slots', requireAuth, (req, res) => {
  const doctor = requireDoctorInScope(req, req.params.id)
  const date = String(req.query.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'A date in YYYY-MM-DD format is required.')
  res.json({ doctorId: doctor.id, date, slots: openSlotsForDate(doctor.id, date), windows: windowsForDate(doctor.id, date) })
})

/** First date with an open slot for a doctor. */
doctorsRouter.get('/:id/next-available', requireAuth, (req, res) => {
  const doctor = requireDoctorInScope(req, req.params.id)
  const fromDate = String(req.query.from ?? new Date().toISOString().slice(0, 10))
  res.json({ doctorId: doctor.id, availability: nextAvailableAppointment(doctor.id, fromDate) })
})