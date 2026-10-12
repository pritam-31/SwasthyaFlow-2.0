import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { appointmentAnalytics, getAppointment, listAppointmentsForFacility } from '../services/appointmentService'
import type { AppointmentStatus } from '../types/appointment.types'

export const adminAppointmentsRouter = Router()

const VALID_STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'reschedule_requested',
  'rescheduled',
  'checked_in',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
]

/** Filterable facility-wide view for admins/auditors. */
adminAppointmentsRouter.get('/', requireAuth, requireRole('facility-admin', 'system-admin'), (req, res) => {
  const facilityId = facilityIdOf(req)
  const { status, doctorId, departmentId, dateFrom, dateTo, q } = req.query as Record<string, string | undefined>
  let rows = listAppointmentsForFacility(facilityId)
  if (status && VALID_STATUSES.includes(status as AppointmentStatus)) rows = rows.filter((a) => a.status === status)
  if (doctorId) rows = rows.filter((a) => a.doctorId === doctorId)
  if (departmentId) rows = rows.filter((a) => a.departmentId === departmentId)
  if (dateFrom) rows = rows.filter((a) => a.appointmentDate >= dateFrom)
  if (dateTo) rows = rows.filter((a) => a.appointmentDate <= dateTo)
  if (q) {
    const needle = q.trim().toLowerCase()
    rows = rows.filter((a) => {
      const haystack = `${a.bookingReference} ${a.patientName} ${a.doctorName} ${a.departmentName}`.toLowerCase()
      return haystack.includes(needle)
    })
  }
  res.json({ appointments: rows })
})

adminAppointmentsRouter.get('/analytics', requireAuth, requireRole('facility-admin', 'system-admin'), (req, res) => {
  const facilityId = facilityIdOf(req)
  const from = req.query.from ? String(req.query.from) : undefined
  let analytics = appointmentAnalytics(facilityId)
  if (from) analytics = { ...analytics, daily: analytics.daily.filter((d) => d.date >= from) }
  res.json({ analytics })
})

adminAppointmentsRouter.get('/:id', requireAuth, requireRole('facility-admin', 'system-admin'), (req, res) => {
  const appointment = getAppointment(req.params.id)
  if (!appointment || appointment.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Appointment not found.')
  res.json({ appointment })
})