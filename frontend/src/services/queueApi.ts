/**
 * Review-queue API (P1-11). Every call goes through the shared `request` client,
 * which attaches the session token and the active `X-Facility-Id`. The backend
 * recomputes the score live, so this module never orders entries itself.
 */

import { request } from './api'
import type {
  AssignableStaff,
  PriorityFilterOptions,
  PriorityOverride,
  PriorityOverrideInput,
  PriorityScore,
  PrioritySortOptions,
  SlaConfig,
  SlaConfigUpdateInput,
} from '../types/priority.types'
import type { QueueSummary } from '../types/priority.types'

function queryString(filter?: PriorityFilterOptions, sort?: PrioritySortOptions): string {
  const params = new URLSearchParams()
  if (filter?.band?.length) params.set('band', filter.band.join(','))
  if (filter?.slaBreached !== undefined) params.set('slaBreached', String(filter.slaBreached))
  if (filter?.hasOverride !== undefined) params.set('hasOverride', String(filter.hasOverride))
  if (filter?.assignedTo) params.set('assignedTo', filter.assignedTo)
  if (sort) {
    params.set('sort', sort.field)
    params.set('direction', sort.direction)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function fetchQueue(
  filter?: PriorityFilterOptions,
  sort?: PrioritySortOptions,
): Promise<{ entries: PriorityScore[]; summary: QueueSummary }> {
  return request(`/queue${queryString(filter, sort)}`)
}

export function fetchQueueSummary(): Promise<{ summary: QueueSummary }> {
  return request('/queue/summary')
}

export function fetchSlaBreaches(): Promise<{ entries: PriorityScore[] }> {
  return request('/queue/sla-breaches')
}

export function fetchAssignees(): Promise<{ assignees: AssignableStaff[] }> {
  return request('/queue/assignees')
}

export function fetchSlaConfig(): Promise<{ config: SlaConfig }> {
  return request('/queue/sla-config')
}

export function updateSlaConfig(input: SlaConfigUpdateInput): Promise<{ config: SlaConfig }> {
  return request('/queue/sla-config', { method: 'PATCH', body: JSON.stringify(input) })
}

export function recomputeQueue(): Promise<{ summary: QueueSummary }> {
  return request('/queue/recompute', { method: 'POST', body: '{}' })
}

export function fetchPriorityForSession(
  sessionId: string,
): Promise<{ entry: PriorityScore; overrides: PriorityOverride[] }> {
  return request(`/queue/${encodeURIComponent(sessionId)}`)
}

export function fetchSessionOverrides(sessionId: string): Promise<{ overrides: PriorityOverride[] }> {
  return request(`/queue/${encodeURIComponent(sessionId)}/overrides`)
}

export function setPriorityOverride(sessionId: string, input: PriorityOverrideInput): Promise<{ entry: PriorityScore }> {
  return request(`/queue/${encodeURIComponent(sessionId)}/override`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function clearPriorityOverride(sessionId: string, kind: string): Promise<void> {
  return request(`/queue/${encodeURIComponent(sessionId)}/override/${encodeURIComponent(kind)}`, {
    method: 'DELETE',
  }).then(() => undefined)
}

export function assignCase(sessionId: string, assigneeId: string): Promise<{ entry: PriorityScore }> {
  return request(`/queue/${encodeURIComponent(sessionId)}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assigneeId }),
  })
}

export function unassignCase(sessionId: string): Promise<{ entry: PriorityScore }> {
  return request(`/queue/${encodeURIComponent(sessionId)}/unassign`, { method: 'POST', body: '{}' })
}

export type { PriorityScore, PriorityOverride, SlaConfig, QueueSummary, AssignableStaff }
