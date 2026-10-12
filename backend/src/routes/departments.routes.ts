import { Router } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { createDepartment, deleteDepartment, getDepartment, listDepartmentsForFacility, updateDepartment } from '../services/departmentService'

export const departmentsRouter = Router()

function requireDepartment(req: import('express').Request, id: string) {
  const department = getDepartment(id)
  if (!department || department.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Department not found.')
  return department
}

departmentsRouter.get('/', requireAuth, (_req, res) => {
  res.json({ departments: listDepartmentsForFacility(facilityIdOf(_req)) })
})

departmentsRouter.get('/:id', requireAuth, (req, res) => {
  res.json({ department: requireDepartment(req, req.params.id) })
})

departmentsRouter.post('/', requireAuth, requireRole('admin', 'facility-admin', 'system-admin'), (req, res) => {
  const actor = authUser(req)
  const body = req.body ?? {}
  const department = createDepartment(
    { name: body.name, description: body.description, facilityId: body.facilityId },
    facilityIdOf(req),
    actor.displayName,
  )
  res.status(201).json({ department })
})

departmentsRouter.patch('/:id', requireAuth, requireRole('admin', 'facility-admin', 'system-admin'), (req, res) => {
  const actor = authUser(req)
  const department = requireDepartment(req, req.params.id)
  const body = req.body ?? {}
  const updated = updateDepartment(
    department.id,
    { name: body.name, description: body.description, active: body.active },
    actor.displayName,
  )
  res.json({ department: updated })
})

departmentsRouter.delete('/:id', requireAuth, requireRole('admin', 'facility-admin', 'system-admin'), (req, res) => {
  const actor = authUser(req)
  const department = requireDepartment(req, req.params.id)
  deleteDepartment(department.id, facilityIdOf(req), actor.displayName)
  res.status(204).end()
})