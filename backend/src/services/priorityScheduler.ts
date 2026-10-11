import { listSessions } from './sessionStore'
import { buildQueue } from './queueService'
import { emitQueueEvent } from './priorityEvents'
import { addAudit } from './auditStore'

/**
 * Periodic priority recompute (P1-11).
 *
 * Every interval the queue is rescored for each facility: subscribers get a
 * summary update and an `sla.breached` audit entry is written the first time a
 * case crosses a band's SLA (deduped per session + band). The timer is unref'd so
 * it never keeps a process alive.
 */

const DEFAULT_INTERVAL_MS = 60_000
const MIN_INTERVAL_MS = 15_000

const breachedKeys = new Set<string>()

function facilityIds(): string[] {
  const ids = new Set<string>()
  for (const session of listSessions()) ids.add(session.facilityId)
  return [...ids]
}

export function runPriorityRecompute(): { facilities: number; breached: number } {
  const ids = facilityIds()
  let breached = 0
  for (const facilityId of ids) {
    const entries = buildQueue(facilityId)
    for (const entry of entries) {
      if (!entry.slaBreached) continue
      const key = `${entry.sessionId}:${entry.band}`
      if (breachedKeys.has(key)) continue
      breachedKeys.add(key)
      breached += 1
      addAudit({
        sessionId: entry.sessionId,
        facilityId: entry.facilityId,
        actor: 'Priority scheduler',
        role: 'nurse',
        action: 'sla.breached',
        detail: `Case exceeded the ${entry.band} SLA of ${entry.slaMinutes} minute(s) (waited ${entry.waitMinutes} minute(s)).`,
        category: 'system',
      })
    }
    emitQueueEvent({ type: 'summary:updated', facilityId, at: new Date().toISOString() })
  }
  return { facilities: ids.length, breached }
}

/** Test / reset helper. */
export function resetSlaBreachDedupe(): void {
  breachedKeys.clear()
}

function resolveInterval(): number {
  const raw = process.env.PRIORITY_RECOMPUTE_INTERVAL_MS
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) {
    console.warn(`[priority] Ignoring PRIORITY_RECOMPUTE_INTERVAL_MS="${raw}" — expected >= ${MIN_INTERVAL_MS} ms.`)
    return DEFAULT_INTERVAL_MS
  }
  return parsed
}

let timer: ReturnType<typeof setInterval> | null = null

export function startPriorityScheduler(): number {
  if (timer) return resolveInterval()
  const intervalMs = resolveInterval()
  timer = setInterval(() => {
    try {
      runPriorityRecompute()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[priority] scheduled recompute failed: ${message}`)
    }
  }, intervalMs)
  timer.unref?.()
  console.log(`[priority] scheduled recompute every ${Math.round(intervalMs / 1000)}s`)
  return intervalMs
}

export function stopPriorityScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export function isPrioritySchedulerRunning(): boolean {
  return timer !== null
}
