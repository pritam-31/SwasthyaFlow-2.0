import { Router } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { isSystemAdmin, createUser, getUser, listUsersForFacility, setUserRole, deleteUser, switchActiveFacility } from '../services/authStore'
import { addAudit, listAudit } from '../services/auditStore'
import {
  archiveFacility,
  createFacility,
  deleteFacility,
  getFacility,
  listFacilities,
  setFacilityStatus,
  updateFacility,
} from '../services/facilityService'
import { listSessionsForFacility } from '../services/sessionStore'
import type { UserRole } from '../types'
import { FACILITY_TYPES, type Facility, type FacilityStats, type FacilityType } from '../types/facility.types'

export const facilitiesRouter = Router()

function tokenFrom(req: { header(name: string): string | undefined }): string {
  const header = req.header('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function requireNonEmpty(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${key} is required.`)
  return value.trim()
}

function requireFacility(id: string): Facility {
  const facility = getFacility(id)
  if (!facility) throw new HttpError(404, 'Facility not found.')
  return facility
}

/** Cross-facility access resolves to 404 (never 403) so tenants cannot probe. */
function assertVisible(facilityId: string, req: Parameters<typeof authUser>[0]): Facility {
  const user = authUser(req)
  const facility = requireFacility(facilityId)
  if (!isSystemAdmin(user.role) && facility.id !== user.facilityId) {
    throw new HttpError(404, 'Facility not found.')
  }
  return facility
}

/** GET /api/facilities — the facilities the caller may see. */
facilitiesRouter.get('/', requireAuth, (req, res) => {
  const user = authUser(req)
  const all = listFacilities()
  if (isSystemAdmin(user.role)) {
    res.json({ facilities: all })
    return
  }
  res.json({ facilities: all.filter((facility) => facility.id === user.facilityId) })
})

facilitiesRouter.post('/', requireAuth, requireRole('system-admin'), (req, res) => {
  const actor = authUser(req)
  const body = req.body ?? {}
  const type = (typeof body.type === 'string' ? body.type : '') as FacilityType
  if (!FACILITY_TYPES.includes(type)) throw new HttpError(400, `type must be one of: ${FACILITY_TYPES.join(', ')}.`)
  const facility = createFacility(
    {
      name: requireNonEmpty(body.name, 'name'),
      type,
      region: typeof body.region === 'string' ? body.region : undefined,
      district: typeof body.district === 'string' ? body.district : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      contactRef: typeof body.contactRef === 'string' ? body.contactRef : undefined,
    },
    actor.displayName,
  )
  res.status(201).json({ facility })
})

/** Switches the facility in scope for the caller's system-admin session. */
facilitiesRouter.post('/switch', requireAuth, requireRole('system-admin'), (req, res) => {
  const actor = authUser(req)
  const facilityId = requireNonEmpty(req.body?.facilityId, 'facilityId')
  const facility = requireFacility(facilityId)
  switchActiveFacility(tokenFrom(req), facility.id)
  addAudit({
    facilityId: facility.id,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'facility.switched',
    detail: `Switched active facility to "${facility.name}".`,
    category: 'system',
  })
  res.json({ facility })
})

facilitiesRouter.get('/:id/stats', requireAuth, (req, res) => {
  const facility = assertVisible(req.params.id, req)
  const sessions = listSessionsForFacility(facility.id)
  const reports = sessions.reduce((total, session) => total + session.reports.length, 0)
  const visuals = sessions.reduce((total, session) => total + session.visuals.length, 0)
  const stats: FacilityStats = {
    users: listUsersForFacility(facility.id).length,
    sessions: sessions.length,
    reports,
    visuals,
    auditEntries: listAudit().filter((entry) => entry.facilityId === facility.id).length,
  }
  res.json({ stats })
})

facilitiesRouter.get('/:id/users', requireAuth, requireRole('facility-admin'), (req, res) => {
  const facility = assertVisible(req.params.id, req)
  res.json({ users: listUsersForFacility(facility.id) })
})

facilitiesRouter.post('/:id/users', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const facility = assertVisible(req.params.id, req)
  const body = req.body ?? {}
  const role = (typeof body.role === 'string' ? body.role : '') as UserRole
  if (!['nurse', 'doctor', 'patient', 'facility-admin'].includes(role)) {
    throw new HttpError(400, 'role must be one of: nurse, doctor, patient, facility-admin.')
  }
  const user = createUser({
    username: requireNonEmpty(body.username, 'username'),
    displayName: requireNonEmpty(body.displayName, 'displayName'),
    password: requireNonEmpty(body.password, 'password'),
    role,
    facilityId: facility.id,
  })
  addAudit({
    facilityId: facility.id,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'facility.user-created',
    detail: `Created "${user.username}" (${user.role}) in "${facility.name}".`,
    category: 'auth',
  })
  res.status(201).json({ user })
})

facilitiesRouter.patch('/:id/users/:userId/role', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const facility = assertVisible(req.params.id, req)
  const target = getUser(req.params.userId)
  if (!target || target.facilityId !== facility.id) throw new HttpError(404, 'User not found.')
  const role = (typeof req.body?.role === 'string' ? req.body.role : '') as UserRole
  if (!['nurse', 'doctor', 'patient', 'facility-admin'].includes(role)) {
    throw new HttpError(400, 'role must be one of: nurse, doctor, patient, facility-admin.')
  }
  const user = setUserRole(target.id, role)
  addAudit({
    facilityId: facility.id,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'facility.user-role-changed',
    detail: `Changed role of "${user.username}" to ${user.role} in "${facility.name}".`,
    category: 'auth',
  })
  res.json({ user })
})

facilitiesRouter.delete('/:id/users/:userId', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const facility = assertVisible(req.params.id, req)
  const target = getUser(req.params.userId)
  if (!target || target.facilityId !== facility.id) throw new HttpError(404, 'User not found.')
  if (target.id === actor.id) throw new HttpError(400, 'You cannot delete your own account.')
  deleteUser(target.id)
  addAudit({
    facilityId: facility.id,
    sessionId: 'auth',
    actor: actor.displayName,
    role: actor.role,
    action: 'facility.user-deleted',
    detail: `Deleted "${target.username}" from "${facility.name}".`,
    category: 'auth',
  })
  res.json({ ok: true })
})

facilitiesRouter.get('/:id', requireAuth, (req, res) => {
  res.json({ facility: assertVisible(req.params.id, req) })
})

facilitiesRouter.patch('/:id', requireAuth, requireRole('facility-admin'), (req, res) => {
  const actor = authUser(req)
  const facility = assertVisible(req.params.id, req)
  const body = req.body ?? {}
  const updated = updateFacility(
    facility.id,
    {
      name: typeof body.name === 'string' ? body.name : undefined,
      type: typeof body.type === 'string' ? (body.type as FacilityType) : undefined,
      region: typeof body.region === 'string' ? body.region : undefined,
      district: typeof body.district === 'string' ? body.district : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      contactRef: typeof body.contactRef === 'string' ? body.contactRef : undefined,
    },
    actor.displayName,
  )
  res.json({ facility: updated })
})

facilitiesRouter.post('/:id/suspend', requireAuth, requireRole('system-admin'), (req, res) => {
  const actor = authUser(req)
  const facility = requireFacility(req.params.id)
  res.json({ facility: setFacilityStatus(facility.id, 'suspended', actor.displayName) })
})

facilitiesRouter.post('/:id/archive', requireAuth, requireRole('system-admin'), (req, res) => {
  const actor = authUser(req)
  const facility = requireFacility(req.params.id)
  res.json({ facility: archiveFacility(facility.id, actor.displayName) })
})

facilitiesRouter.delete('/:id', requireAuth, requireRole('system-admin'), (req, res) => {
  const actor = authUser(req)
  deleteFacility(req.params.id, actor.displayName)
  res.json({ ok: true })
})
