import { pushAppLog } from './appLogStore'
import { runRetentionJob } from './retentionService'

/**
 * Background retention sweep (P0-6).
 *
 * Runs the retention job on an interval (default 6 h, `RETENTION_SWEEP_INTERVAL_MS`
 * to change) so expired data disappears without anyone clicking a button. The
 * timer is unref'd so it never keeps a test run or a shutdown alive.
 */

const DEFAULT_SWEEP_MS = 6 * 60 * 60 * 1000
const MIN_SWEEP_MS = 60 * 1000

let timer: NodeJS.Timeout | null = null

function resolveIntervalMs(): number {
  const raw = process.env.RETENTION_SWEEP_INTERVAL_MS
  if (raw === undefined || raw.trim() === '') return DEFAULT_SWEEP_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < MIN_SWEEP_MS) {
    console.warn(`[retention] Ignoring RETENTION_SWEEP_INTERVAL_MS="${raw}" — expected >= ${MIN_SWEEP_MS} ms.`)
    return DEFAULT_SWEEP_MS
  }
  return parsed
}

/** Starts the sweep (idempotent). Returns the interval in use. */
export function startRetentionScheduler(): number {
  if (timer) return resolveIntervalMs()
  const intervalMs = resolveIntervalMs()

  timer = setInterval(() => {
    try {
      runRetentionJob({ actor: { name: 'Retention scheduler', role: 'admin' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pushAppLog({ level: 'error', source: 'retention', message: `Scheduled retention sweep failed: ${message}` })
    }
  }, intervalMs)
  timer.unref?.()

  console.log(`[retention] scheduled sweep every ${Math.round(intervalMs / 60000)} min`)
  return intervalMs
}

export function stopRetentionScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export function isRetentionSchedulerRunning(): boolean {
  return timer !== null
}
