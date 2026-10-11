import { randomUUID } from 'node:crypto'
import { SecurityEventModel } from '../db/models/SecurityEventModel'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { appendSecurityEvent as persistSecurityEvent } from '../repositories/securityRepository'
import { pseudonymise } from '../config/secrets'
import { anonymiseErrorMessage } from './unifiedAnonymizer'
import type { SecurityEvent, SecurityEventType } from '../types/security.types'

/**
 * Security event store (P1-12).
 *
 * Every auth/security event is written here with identifiers pseudonymised:
 * IP addresses, user agents and usernames are hashed before they reach storage,
 * except an IP that is needed for abuse investigation (then it is intentionally
 * stored raw for triage, and only for the specific event types that support it).
 * Passwords, tokens, cookies and 2FA secrets are never recorded, in any form.
 */

const MAX_EVENTS = 2000
const inMemoryEvents: SecurityEvent[] = []

const RAW_IP_EVENT_TYPES = new Set<SecurityEventType>([
  'security.ip-blocked',
  'security.ip-unblocked',
  'security.ip-not-allowed',
])

const RAW_UA_EVENT_TYPES = new Set<SecurityEventType>(['security.suspicious-ua'])

export interface SecurityEventInput {
  type: SecurityEventType
  actorId?: string
  actorRole?: SecurityEvent['actorRole']
  facilityId?: string
  ip?: string
  userAgent?: string
  detail: string
  requestId?: string
}

/** Hashes an IP unless the event type legitimately needs the raw value. */
function anonymiseIp(ip: string | undefined, type: SecurityEventType): string | undefined {
  if (!ip) return undefined
  if (RAW_IP_EVENT_TYPES.has(type)) return ip
  return pseudonymise(ip, 'ip')
}

/** Hashes a user agent unless the event type legitimately needs it. */
function anonymiseUserAgent(userAgent: string | undefined, type: SecurityEventType): string | undefined {
  if (!userAgent) return undefined
  if (RAW_UA_EVENT_TYPES.has(type)) return userAgent
  return pseudonymise(userAgent, 'ua')
}

export async function record(input: SecurityEventInput): Promise<SecurityEvent> {
  const event: SecurityEvent = {
    id: `sev-${randomUUID()}`,
    type: input.type,
    actorId: input.actorId,
    actorRole: input.actorRole,
    facilityId: input.facilityId,
    ip: anonymiseIp(input.ip, input.type),
    userAgent: anonymiseUserAgent(input.userAgent, input.type),
    detail: anonymiseErrorMessage(input.detail),
    requestId: input.requestId,
    createdAt: new Date().toISOString(),
  }

  if (!persistenceEnabled()) {
    inMemoryEvents.unshift(event)
    if (inMemoryEvents.length > MAX_EVENTS) inMemoryEvents.length = MAX_EVENTS
    return event
  }
  const snapshot = { ...event }
  enqueue('security-event', () => persistSecurityEvent(snapshot as SecurityEvent))
  return event
}

export interface SecurityEventFilter {
  type?: string
  actorId?: string
  since?: string
  facilityId?: string
}

export async function list(filter: SecurityEventFilter = {}): Promise<SecurityEvent[]> {
  if (persistenceEnabled()) {
    const query: Record<string, unknown> = {}
    if (filter.type) query.type = filter.type
    if (filter.actorId) query.actorId = filter.actorId
    if (filter.facilityId) query.facilityId = filter.facilityId
    if (filter.since) query.createdAt = { $gte: new Date(filter.since) }
    const rows = await SecurityEventModel.find(query).sort({ createdAt: -1 }).limit(2000).lean().exec()
    return rows.map((row) => ({
      id: row.eventId,
      type: row.type as SecurityEvent['type'],
      actorId: row.actorId ?? undefined,
      actorRole: (row.actorRole as SecurityEvent['actorRole']) ?? undefined,
      facilityId: row.facilityId ?? undefined,
      ip: row.ip ?? undefined,
      userAgent: row.userAgent ?? undefined,
      detail: row.detail,
      requestId: row.requestId ?? undefined,
      createdAt: new Date(row.createdAt).toISOString(),
    }))
  }
  return inMemoryEvents.filter(
    (event) =>
      (!filter.type || event.type === filter.type) &&
      (!filter.actorId || event.actorId === filter.actorId) &&
      (!filter.facilityId || event.facilityId === filter.facilityId) &&
      (!filter.since || event.createdAt >= filter.since),
  )
}

/** Test-only reset. */
export function clearSecurityEventsMemory(): void {
  inMemoryEvents.length = 0
}

/** Loads the persisted trail into memory on boot (persistent mode only). */
export async function hydrateSecurityEvents(): Promise<void> {
  if (!persistenceEnabled()) return
  const rows = await SecurityEventModel.find().sort({ createdAt: -1 }).limit(MAX_EVENTS).lean().exec()
  inMemoryEvents.length = 0
  inMemoryEvents.push(
    ...rows.map((row) => ({
      id: row.eventId,
      type: row.type as SecurityEvent['type'],
      actorId: row.actorId ?? undefined,
      actorRole: (row.actorRole as SecurityEvent['actorRole']) ?? undefined,
      facilityId: row.facilityId ?? undefined,
      ip: row.ip ?? undefined,
      userAgent: row.userAgent ?? undefined,
      detail: row.detail,
      requestId: row.requestId ?? undefined,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  )
}