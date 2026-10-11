import { DAY_MS, getRetentionRule } from './retentionConfig'
import { getSessionRetentionTargets } from './retentionService'
import { listSessionsForFacility } from './sessionStore'
import type { RetentionCategory, RetentionSlaBucket, RetentionSlaView } from '../types'

/**
 * Retention SLA view (P2-17).
 *
 * Answers "are we deleting on time?". A due record that has waited longer than
 * the facility SLA (default 30 days) is a breach. The view is cached for 60s —
 * it walks every session in the facility, so the console does not pay that cost
 * on every poll.
 */

const DEFAULT_SLA_DAYS = 30
const MIN_SLA_DAYS = 1
const MAX_SLA_DAYS = 365
const CACHE_MS = 60_000

const slaDaysByFacility = new Map<string, number>()
const cache = new Map<string, { at: number; value: RetentionSlaView }>()

export function getRetentionSlaDays(facilityId: string): number {
  return slaDaysByFacility.get(facilityId) ?? DEFAULT_SLA_DAYS
}

export function setRetentionSlaDays(facilityId: string, days: number): number {
  if (!Number.isInteger(days) || days < MIN_SLA_DAYS || days > MAX_SLA_DAYS) {
    throw new Error(`SLA days must be an integer ${MIN_SLA_DAYS}..${MAX_SLA_DAYS}.`)
  }
  slaDaysByFacility.set(facilityId, days)
  cache.delete(facilityId)
  return days
}

export function clearRetentionSlaCache(): void {
  cache.clear()
  slaDaysByFacility.clear()
}

interface TargetRow {
  category: RetentionCategory
  expiresAt: string
}

/** Every session-scoped retention target across a facility. */
export function gatherFacilityTargets(facilityId: string): TargetRow[] {
  const rows: TargetRow[] = []
  for (const session of listSessionsForFacility(facilityId)) {
    for (const target of getSessionRetentionTargets(session.id)) {
      rows.push({ category: target.category, expiresAt: target.expiresAt })
    }
  }
  return rows
}

export function getRetentionSla(facilityId: string, now = Date.now()): RetentionSlaView {
  const cached = cache.get(facilityId)
  if (cached && now - cached.at < CACHE_MS) return cached.value
  const slaDays = getRetentionSlaDays(facilityId)
  const view = computeSla(facilityId, now, gatherFacilityTargets(facilityId), slaDays)
  cache.set(facilityId, { at: now, value: view })
  return view
}

function computeSla(facilityId: string, now: number, targets: TargetRow[], slaDays: number): RetentionSlaView {
  const byCategory = new Map<RetentionCategory, { due: number; oldestEligible: number | null; next: number | null }>()
  for (const target of targets) {
    const at = Date.parse(target.expiresAt)
    if (!Number.isFinite(at)) continue
    const bucket = byCategory.get(target.category) ?? { due: 0, oldestEligible: null, next: null }
    if (at <= now) {
      bucket.due += 1
      bucket.oldestEligible = bucket.oldestEligible === null ? at : Math.min(bucket.oldestEligible, at)
    } else {
      bucket.next = bucket.next === null ? at : Math.min(bucket.next, at)
    }
    byCategory.set(target.category, bucket)
  }

  const buckets: RetentionSlaBucket[] = []
  let totalDue = 0
  let breachedCategories = 0
  let nextRun: number | null = null

  for (const [category, bucket] of byCategory) {
    const label = getRetentionRule(category).label
    const oldestOverdueDays =
      bucket.due > 0 && bucket.oldestEligible !== null ? Math.max(0, Math.floor((now - bucket.oldestEligible) / DAY_MS)) : 0
    const breached = bucket.due > 0 && oldestOverdueDays > slaDays
    buckets.push({ category, label, due: bucket.due, oldestOverdueDays, breached })
    totalDue += bucket.due
    if (breached) breachedCategories += 1
    if (bucket.next !== null) nextRun = nextRun === null ? bucket.next : Math.min(nextRun, bucket.next)
  }

  buckets.sort((a, b) => {
    if (a.breached !== b.breached) return a.breached ? -1 : 1
    return b.due - a.due
  })

  return {
    facilityId,
    generatedAt: new Date(now).toISOString(),
    slaDays,
    buckets,
    totalDue,
    breachedCategories,
    nextRunAt: new Date(nextRun ?? now).toISOString(),
  }
}
