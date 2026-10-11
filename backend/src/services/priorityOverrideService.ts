import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { appendOverride, deleteOverride, listOverrides } from '../repositories/priorityRepository'
import { HttpError } from '../middleware/errorHandler'
import { anonymiseText } from './unifiedAnonymizer'
import { addAudit } from './auditStore'
import { emitQueueEvent } from './priorityEvents'
import type { PriorityBand, PriorityOverride, PriorityOverrideInput, UserRole } from '../types'
import { PRIORITY_BANDS, PRIORITY_OVERRIDE_KINDS } from '../types/priority.types'

/**
 * Priority override store (P1-11).
 *
 * A human can override the score (0..100), the band, pin a case to the top,
 * deprioritise it, or mark it reviewed — always with a human-entered reason
 * (PII-stripped before storage). Only one override per kind is active at a time;
 * setting a new one replaces the previous active override of that kind. Nothing
 * here diagnoses or prescribes.
 */

const MIN_REASON = 3
const MAX_REASON = 500

const overrides = new Map<string, PriorityOverride[]>()

export interface OverrideContext {
  sessionId: string
  facilityId: string
  actorId: string
  actorName: string
  actorRole: UserRole
}

function isPriorityBand(value: unknown): value is PriorityBand {
  return typeof value === 'string' && (PRIORITY_BANDS as string[]).includes(value)
}

/** All active overrides (optionally scoped to one session). */
export function listActiveOverrides(sessionId?: string): PriorityOverride[] {
  const all: PriorityOverride[] = []
  for (const entries of overrides.values()) {
    for (const entry of entries) all.push(entry)
  }
  return sessionId ? all.filter((entry) => entry.sessionId === sessionId) : all
}

export function listOverridesForSession(sessionId: string): PriorityOverride[] {
  return [...(overrides.get(sessionId) ?? [])]
}

export function findActiveOverride(sessionId: string, kind: PriorityOverride['kind']): PriorityOverride | undefined {
  return (overrides.get(sessionId) ?? []).find((entry) => entry.kind === kind)
}

function validate(input: PriorityOverrideInput): { kind: PriorityOverride['kind']; value?: number | PriorityBand; reason: string } {
  if (!PRIORITY_OVERRIDE_KINDS.includes(input.kind)) {
    throw new HttpError(400, `kind must be one of: ${PRIORITY_OVERRIDE_KINDS.join(', ')}.`)
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    throw new HttpError(400, `reason must be ${MIN_REASON}-${MAX_REASON} characters.`)
  }
  if (input.kind === 'score') {
    if (typeof input.value !== 'number' || !Number.isInteger(input.value) || input.value < 0 || input.value > 100) {
      throw new HttpError(400, 'A score override needs an integer value between 0 and 100.')
    }
    return { kind: 'score', value: input.value, reason }
  }
  if (input.kind === 'band') {
    if (!isPriorityBand(input.value)) {
      throw new HttpError(400, `A band override needs one of: ${PRIORITY_BANDS.join(', ')}.`)
    }
    return { kind: 'band', value: input.value, reason }
  }
  return { kind: input.kind, reason }
}

/** Sets (or replaces) the active override of one kind, then records an audit entry. */
export function setOverride(context: OverrideContext, input: PriorityOverrideInput): PriorityOverride {
  const validated = validate(input)
  const safeReason = anonymiseText(validated.reason, 'audit-detail').text
  const entry: PriorityOverride = {
    id: `pov-${randomUUID()}`,
    sessionId: context.sessionId,
    facilityId: context.facilityId,
    kind: validated.kind,
    ...(validated.value !== undefined ? { value: validated.value } : {}),
    reason: safeReason,
    actorId: context.actorId,
    actorRole: context.actorRole,
    createdAt: new Date().toISOString(),
  }

  const existing = (overrides.get(context.sessionId) ?? []).filter((item) => item.kind !== validated.kind)
  existing.push(entry)
  overrides.set(context.sessionId, existing)

  if (persistenceEnabled()) enqueue('override:' + entry.id, () => appendOverride(entry))

  addAudit({
    sessionId: context.sessionId,
    facilityId: context.facilityId,
    actor: context.actorName,
    role: context.actorRole,
    action: 'priority.override-set',
    detail: `Priority ${validated.kind} override set${validated.value !== undefined ? ` to ${String(validated.value)}` : ''} — ${safeReason}`,
    category: 'decision',
  })
  emitQueueEvent({ type: 'priority:updated', facilityId: context.facilityId, sessionId: context.sessionId, at: entry.createdAt })

  return entry
}

/** Clears the active override of one kind. Returns whether one was removed. */
export function clearOverride(context: OverrideContext, kind: PriorityOverride['kind']): boolean {
  const current = overrides.get(context.sessionId) ?? []
  const entry = current.find((item) => item.kind === kind)
  if (!entry) return false
  overrides.set(
    context.sessionId,
    current.filter((item) => item.kind !== kind),
  )
  if (persistenceEnabled()) enqueue('override:' + entry.id, () => deleteOverride(entry.id))

  addAudit({
    sessionId: context.sessionId,
    facilityId: context.facilityId,
    actor: context.actorName,
    role: context.actorRole,
    action: 'priority.override-cleared',
    detail: `Priority ${kind} override cleared.`,
    category: 'decision',
  })
  emitQueueEvent({ type: 'priority:updated', facilityId: context.facilityId, sessionId: context.sessionId, at: new Date().toISOString() })
  return true
}

export function clearOverridesForSession(sessionId: string): void {
  const rows = overrides.get(sessionId) ?? []
  overrides.delete(sessionId)
  if (persistenceEnabled()) {
    for (const row of rows) enqueue('override:' + row.id, () => deleteOverride(row.id))
  }
}

/** Test / reset helper. */
export function clearPriorityOverrides(): void {
  overrides.clear()
}

/** Loads persisted overrides on boot (persistent mode only). */
export async function hydratePriorityOverrides(): Promise<void> {
  const rows = await listOverrides()
  overrides.clear()
  for (const row of rows) {
    const list = overrides.get(row.sessionId) ?? []
    list.push(row)
    overrides.set(row.sessionId, list)
  }
}
