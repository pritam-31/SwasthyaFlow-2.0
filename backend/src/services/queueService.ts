import { getSession, listSessionsForFacility, updateSession } from './sessionStore'
import { NON_DIAGNOSTIC_DISCLAIMER } from './nonDiagnostic'
import { addAudit } from './auditStore'
import { emitQueueEvent } from './priorityEvents'
import { bandForScore, clampScore, computePriority } from './priorityScoringService'
import { clearOverride, findActiveOverride, setOverride } from './priorityOverrideService'
import { getSlaConfig, slaMinutesFor } from './slaService'
import { HttpError } from '../middleware/errorHandler'
import { getUser, listUsers } from './authStore'
import type {
  PatientSession,
  PriorityBand,
  PriorityScore,
  PrioritySortOptions,
  PriorityFilterOptions,
  QueueSummary,
  UserRole,
} from '../types'
import { PRIORITY_BANDS } from '../types/priority.types'

/**
 * Review-queue assembly (P1-11).
 *
 * The queue is a live projection: it recomputes each case's transparent score,
 * applies any human overrides, resolves the SLA threshold for the effective band
 * and applies sorting/filtering. Pinned cases float to the top and deprioritised
 * cases sink to the bottom. Nothing here diagnoses or prescribes.
 */

export function scoreSession(session: PatientSession, now: Date = new Date()): PriorityScore {
  const base = computePriority(session, now)
  const scoreOverride = findActiveOverride(session.id, 'score')
  const bandOverride = findActiveOverride(session.id, 'band')
  const pinned = Boolean(findActiveOverride(session.id, 'pin'))
  const deprioritised = Boolean(findActiveOverride(session.id, 'deprioritise'))
  const reviewed = Boolean(findActiveOverride(session.id, 'reviewed'))

  const effectiveScore = scoreOverride && typeof scoreOverride.value === 'number' ? clampScore(scoreOverride.value) : base.score
  const computedBand = base.band
  const band: PriorityBand = bandOverride && typeof bandOverride.value === 'string' ? bandOverride.value : bandForScore(effectiveScore)

  const config = getSlaConfig(session.facilityId)
  const slaMinutes = slaMinutesFor(config, band)

  return {
    sessionId: session.id,
    facilityId: session.facilityId,
    score: effectiveScore,
    band,
    computedBand,
    breakdown: base.breakdown,
    computedAt: new Date().toISOString(),
    waitMinutes: base.waitMinutes,
    slaMinutes,
    slaBreached: base.waitMinutes >= slaMinutes,
    override: scoreOverride ?? bandOverride ?? null,
    assignedTo: session.assignedTo ?? null,
    assignedToName: session.assignedToName ?? null,
    pinned,
    deprioritised,
    reviewed,
    language: base.language,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  }
}

function applyFilters(entries: PriorityScore[], filter?: PriorityFilterOptions): PriorityScore[] {
  if (!filter) return entries
  return entries.filter((entry) => {
    if (filter.band && filter.band.length > 0 && !filter.band.includes(entry.band)) return false
    if (filter.slaBreached !== undefined && entry.slaBreached !== filter.slaBreached) return false
    if (filter.hasOverride !== undefined && Boolean(entry.override) !== filter.hasOverride) return false
    if (filter.assignedTo !== undefined && (entry.assignedTo ?? '') !== filter.assignedTo) return false
    if (filter.language !== undefined && entry.language !== filter.language) return false
    return true
  })
}

function bandIndex(band: PriorityBand): number {
  const index = PRIORITY_BANDS.indexOf(band)
  return index === -1 ? PRIORITY_BANDS.length : index
}

function compareEntries(a: PriorityScore, b: PriorityScore, sort: PrioritySortOptions): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  if (a.deprioritised !== b.deprioritised) return a.deprioritised ? 1 : -1

  const direction = sort.direction === 'asc' ? 1 : -1
  switch (sort.field) {
    case 'priority':
      if (a.score !== b.score) return (a.score - b.score) * direction
      return (a.waitMinutes - b.waitMinutes) * -1
    case 'wait':
      return (a.waitMinutes - b.waitMinutes) * direction
    case 'sla':
      if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1
      return (a.waitMinutes - b.waitMinutes) * -1
    case 'band':
      return (bandIndex(a.band) - bandIndex(b.band)) * direction
    case 'created':
      return (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * direction
    case 'updated':
      return (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0) * direction
    default:
      return 0
  }
}

export function buildQueue(facilityId: string, filter?: PriorityFilterOptions, sort?: PrioritySortOptions, now: Date = new Date()): PriorityScore[] {
  const sessions = listSessionsForFacility(facilityId)
  const effectiveSort: PrioritySortOptions = sort ?? { field: 'priority', direction: 'desc' }
  const entries = sessions.map((session) => scoreSession(session, now))
  return applyFilters(entries, filter).sort((a, b) => compareEntries(a, b, effectiveSort))
}

export function summarizeQueue(facilityId: string, now: Date = new Date()): QueueSummary {
  const entries = listSessionsForFacility(facilityId).map((session) => scoreSession(session, now))
  const byBand = PRIORITY_BANDS.reduce(
    (acc, band) => {
      acc[band] = 0
      return acc
    },
    {} as Record<PriorityBand, number>,
  )
  let slaBreaches = 0
  let pinned = 0
  let overridden = 0
  let unassigned = 0
  for (const entry of entries) {
    byBand[entry.band] += 1
    if (entry.slaBreached) slaBreaches += 1
    if (entry.pinned) pinned += 1
    if (entry.override) overridden += 1
    if (!entry.assignedTo) unassigned += 1
  }
  return { total: entries.length, byBand, slaBreaches, pinned, overridden, unassigned }
}

export function getPriorityForSession(sessionId: string, now: Date = new Date()): PriorityScore | undefined {
  const session = getSession(sessionId)
  if (!session) return undefined
  return scoreSession(session, now)
}

/** Assigns a case to a staff member in the same facility. Records an audit entry. */
export function assignCase(
  session: PatientSession,
  assigneeId: string,
  actor: { id: string; name: string; role: UserRole },
): PriorityScore {
  const assignee = getUser(assigneeId)
  if (!assignee) throw new HttpError(404, 'Assignee not found.')
  if (assignee.facilityId !== session.facilityId) throw new HttpError(404, 'Assignee not found.')
  if (assignee.role === 'patient') throw new HttpError(400, 'A case cannot be assigned to a patient account.')

  updateSession(session.id, { assignedTo: assignee.id, assignedToName: assignee.displayName })
  addAudit({
    sessionId: session.id,
    facilityId: session.facilityId,
    actor: actor.name,
    role: actor.role,
    action: 'priority.assigned',
    detail: `Case assigned to ${assignee.displayName}.`,
    category: 'edit',
  })
  emitQueueEvent({ type: 'priority:updated', facilityId: session.facilityId, sessionId: session.id, at: new Date().toISOString() })
  const updated = getSession(session.id)
  return scoreSession(updated ?? session)
}

/** Clears the assignment on a case. Records an audit entry. */
export function unassignCase(
  session: PatientSession,
  actor: { id: string; name: string; role: UserRole },
): PriorityScore {
  updateSession(session.id, { assignedTo: undefined, assignedToName: undefined })
  addAudit({
    sessionId: session.id,
    facilityId: session.facilityId,
    actor: actor.name,
    role: actor.role,
    action: 'priority.unassigned',
    detail: 'Case unassigned.',
    category: 'edit',
  })
  emitQueueEvent({ type: 'priority:updated', facilityId: session.facilityId, sessionId: session.id, at: new Date().toISOString() })
  const updated = getSession(session.id)
  return scoreSession(updated ?? session)
}

/** Recomputes the whole facility queue and notifies subscribers. */
export function recomputeQueue(facilityId: string): QueueSummary {
  const summary = summarizeQueue(facilityId)
  emitQueueEvent({ type: 'summary:updated', facilityId, at: new Date().toISOString() })
  return summary
}

export function setPriorityOverride(
  session: PatientSession,
  input: Parameters<typeof setOverride>[1],
  actor: { id: string; name: string; role: UserRole },
): PriorityScore {
  setOverride(
    {
      sessionId: session.id,
      facilityId: session.facilityId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
    },
    input,
  )
  const updated = getSession(session.id)
  return scoreSession(updated ?? session)
}

export function clearPriorityOverride(
  session: PatientSession,
  kind: Parameters<typeof clearOverride>[1],
  actor: { id: string; name: string; role: UserRole },
): PriorityScore {
  clearOverride(
    {
      sessionId: session.id,
      facilityId: session.facilityId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
    },
    kind,
  )
  const updated = getSession(session.id)
  return scoreSession(updated ?? session)
}

/** Staff that can be assigned work in a facility (excludes patient accounts). */
export function listAssignableStaff(facilityId: string): Array<{ id: string; displayName: string; role: UserRole }> {
  return listUsers()
    .filter((user) => user.facilityId === facilityId && user.role !== 'patient')
    .map((user) => ({ id: user.id, displayName: user.displayName, role: user.role }))
}
