import { Router } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { isSystemAdmin } from '../services/authStore'
import { addAudit } from '../services/auditStore'
import { getSession } from '../services/sessionStore'
import {
  assignCase,
  buildQueue,
  clearPriorityOverride,
  getPriorityForSession,
  listAssignableStaff,
  recomputeQueue,
  setPriorityOverride,
  summarizeQueue,
  unassignCase,
} from '../services/queueService'
import { listOverridesForSession } from '../services/priorityOverrideService'
import { getSlaConfig, setSlaConfig } from '../services/slaService'
import type {
  PatientSession,
  PriorityBand,
  PriorityDirection,
  PriorityFilterOptions,
  PriorityOverrideInput,
  PrioritySortField,
  PrioritySortOptions,
  UserRole,
} from '../types'
import { PRIORITY_BANDS, PRIORITY_OVERRIDE_KINDS } from '../types/priority.types'

/**
 * Review-queue API (P1-11).
 *
 * Transparent, non-diagnostic priority for every case in the caller's facility.
 * Reads are available to all staff; overrides are role-gated (a nurse may only
 * mark a case reviewed; only a doctor may override the score/band materially).
 * Every mutation writes an audit entry. Cross-facility access returns 404.
 */

export const queueRouter = Router()

const STAFF_ROLES: UserRole[] = ['nurse', 'doctor', 'facility-admin']
const SORT_FIELDS: PrioritySortField[] = ['priority', 'wait', 'sla', 'band', 'created', 'updated']

function canOverrideScore(role: UserRole): boolean {
  return isSystemAdmin(role) || role === 'doctor'
}

function canManagePriority(role: UserRole): boolean {
  return isSystemAdmin(role) || role === 'doctor' || role === 'facility-admin'
}

function canEditSla(role: UserRole): boolean {
  return isSystemAdmin(role) || role === 'facility-admin'
}

/** Resolves a session that must live in the caller's facility (else 404). */
function scopedSession(sessionId: string, facilityId: string): PatientSession {
  const session = getSession(sessionId)
  if (!session || session.facilityId !== facilityId) throw new HttpError(404, 'Session not found.')
  return session
}

function parseFilter(query: Record<string, unknown>): PriorityFilterOptions {
  const filter: PriorityFilterOptions = {}
  if (typeof query.band === 'string' && query.band.trim()) {
    const bands = query.band
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    for (const value of bands) {
      if (!(PRIORITY_BANDS as string[]).includes(value)) throw new HttpError(400, `Unknown band filter: ${value}.`)
    }
    filter.band = [...new Set(bands)] as PriorityBand[]
  }
  if (query.slaBreached === 'true') filter.slaBreached = true
  if (query.slaBreached === 'false') filter.slaBreached = false
  if (query.hasOverride === 'true') filter.hasOverride = true
  if (query.hasOverride === 'false') filter.hasOverride = false
  if (typeof query.assignedTo === 'string' && query.assignedTo.trim()) filter.assignedTo = query.assignedTo.trim()
  return filter
}

function parseSort(query: Record<string, unknown>): PrioritySortOptions {
  const field = typeof query.sort === 'string' ? query.sort : 'priority'
  if (!(SORT_FIELDS as string[]).includes(field)) throw new HttpError(400, `sort must be one of: ${SORT_FIELDS.join(', ')}.`)
  const direction: PriorityDirection = query.direction === 'asc' ? 'asc' : 'desc'
  return { field: field as PrioritySortField, direction }
}

function overrideGuard(role: UserRole, kind: string): void {
  if (!(PRIORITY_OVERRIDE_KINDS as string[]).includes(kind)) {
    throw new HttpError(400, `kind must be one of: ${PRIORITY_OVERRIDE_KINDS.join(', ')}.`)
  }
  if (kind === 'score' && !canOverrideScore(role)) {
    throw new HttpError(403, 'Only a doctor may override the priority score.')
  }
  if ((kind === 'band' || kind === 'pin' || kind === 'deprioritise') && !canManagePriority(role)) {
    throw new HttpError(403, 'Only a doctor or facility administrator may change this override.')
  }
  if (kind === 'reviewed' && !STAFF_ROLES.includes(role) && !isSystemAdmin(role)) {
    throw new HttpError(403, 'Only clinical staff may mark a case reviewed.')
  }
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

queueRouter.get('/queue', requireRole(...STAFF_ROLES), (req, res) => {
  const facilityId = facilityIdOf(req)
  const entries = buildQueue(facilityId, parseFilter(req.query), parseSort(req.query))
  res.json({ entries, summary: summarizeQueue(facilityId) })
})

queueRouter.get('/queue/summary', requireRole(...STAFF_ROLES), (req, res) => {
  res.json({ summary: summarizeQueue(facilityIdOf(req)) })
})

queueRouter.get('/queue/sla-breaches', requireRole(...STAFF_ROLES), (req, res) => {
  const facilityId = facilityIdOf(req)
  const entries = buildQueue(facilityId, { slaBreached: true })
  res.json({ entries })
})

queueRouter.get('/queue/assignees', requireRole(...STAFF_ROLES), (req, res) => {
  res.json({ assignees: listAssignableStaff(facilityIdOf(req)) })
})

queueRouter.get('/queue/sla-config', requireRole(...STAFF_ROLES), (req, res) => {
  res.json({ config: getSlaConfig(facilityIdOf(req)) })
})

queueRouter.patch('/queue/sla-config', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  if (!canEditSla(user.role)) throw new HttpError(403, 'Only a facility administrator may edit SLA thresholds.')
  const facilityId = facilityIdOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const input: Record<string, number> = {}
  for (const band of PRIORITY_BANDS) {
    const value = body[band]
    if (value !== undefined) {
      if (typeof value !== 'number') throw new HttpError(400, `sla.${band} must be a number of minutes.`)
      input[band] = value
    }
  }
  const config = setSlaConfig(facilityId, input, { id: user.id, name: user.displayName, role: user.role })
  addAudit({
    sessionId: 'queue',
    facilityId,
    actor: user.displayName,
    role: user.role,
    action: 'sla.config-updated',
    detail: `SLA thresholds updated: ${PRIORITY_BANDS.map((band) => `${band}=${config[band]}m`).join(', ')}.`,
    category: 'system',
  })
  res.json({ config })
})

queueRouter.post('/queue/recompute', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  if (!canManagePriority(user.role) && !isSystemAdmin(user.role)) {
    throw new HttpError(403, 'Only a doctor or facility administrator may recompute the queue.')
  }
  const facilityId = facilityIdOf(req)
  const summary = recomputeQueue(facilityId)
  addAudit({
    sessionId: 'queue',
    facilityId,
    actor: user.displayName,
    role: user.role,
    action: 'priority.recomputed',
    detail: `Queue recomputed for ${summary.total} case(s).`,
    category: 'system',
  })
  res.json({ summary })
})

queueRouter.get('/queue/:sessionId/overrides', requireRole(...STAFF_ROLES), (req, res) => {
  scopedSession(req.params.sessionId, facilityIdOf(req))
  res.json({ overrides: listOverridesForSession(req.params.sessionId) })
})

queueRouter.get('/queue/:sessionId', requireRole(...STAFF_ROLES), (req, res) => {
  const facilityId = facilityIdOf(req)
  const session = scopedSession(req.params.sessionId, facilityId)
  const entry = getPriorityForSession(session.id)
  if (!entry) throw new HttpError(404, 'Session not found.')
  const user = authUser(req)
  addAudit({
    sessionId: session.id,
    facilityId,
    actor: user.displayName,
    role: user.role,
    action: 'priority.viewed',
    detail: `Priority viewed (score ${entry.score}, band ${entry.band}).`,
    category: 'view',
  })
  res.json({ entry, overrides: listOverridesForSession(session.id) })
})

/* ------------------------------------------------------------------ */
/*  Overrides                                                          */
/* ------------------------------------------------------------------ */

queueRouter.post('/queue/:sessionId/override', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const session = scopedSession(req.params.sessionId, facilityId)
  const body = (req.body ?? {}) as Partial<PriorityOverrideInput> & { value?: unknown }
  const kind = typeof body.kind === 'string' ? body.kind : ''
  overrideGuard(user.role, kind)
  const input: PriorityOverrideInput = {
    kind: kind as PriorityOverrideInput['kind'],
    reason: typeof body.reason === 'string' ? body.reason : '',
    ...(body.value !== undefined ? { value: body.value as number | PriorityBand } : {}),
  }
  const entry = setPriorityOverride(session, input, { id: user.id, name: user.displayName, role: user.role })
  res.status(201).json({ entry })
})

queueRouter.delete('/queue/:sessionId/override/:kind', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const session = scopedSession(req.params.sessionId, facilityId)
  overrideGuard(user.role, req.params.kind)
  clearPriorityOverride(session, req.params.kind as PriorityOverrideInput['kind'], {
    id: user.id,
    name: user.displayName,
    role: user.role,
  })
  res.status(204).end()
})

/* ------------------------------------------------------------------ */
/*  Assignment                                                         */
/* ------------------------------------------------------------------ */

queueRouter.post('/queue/:sessionId/assign', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const session = scopedSession(req.params.sessionId, facilityId)
  const assigneeId = typeof req.body?.assigneeId === 'string' ? req.body.assigneeId.trim() : ''
  if (!assigneeId) throw new HttpError(400, 'assigneeId is required.')
  const entry = assignCase(session, assigneeId, { id: user.id, name: user.displayName, role: user.role })
  res.json({ entry })
})

queueRouter.post('/queue/:sessionId/unassign', requireRole(...STAFF_ROLES), (req, res) => {
  const user = authUser(req)
  const facilityId = facilityIdOf(req)
  const session = scopedSession(req.params.sessionId, facilityId)
  const entry = unassignCase(session, { id: user.id, name: user.displayName, role: user.role })
  res.json({ entry })
})
