import { randomUUID } from 'node:crypto'
import { anonymiseLog } from './unifiedAnonymizer'

/**
 * In-memory application log ring (P0-6, `application-logs` rule).
 *
 * Operational lines only. Every message is passed through the anonymiser
 * (P0-7) so no patient text can ever reach a log line, even by mistake.
 */

export type AppLogLevel = 'info' | 'warn' | 'error'

export interface AppLogEntry {
  id: string
  at: string
  level: AppLogLevel
  source: string
  message: string
}

const MAX_LINES = 500
const lines: AppLogEntry[] = []

export function pushAppLog(input: { level?: AppLogLevel; source: string; message: string }): AppLogEntry {
  const entry: AppLogEntry = {
    id: `log-${randomUUID()}`,
    at: new Date().toISOString(),
    level: input.level ?? 'info',
    source: input.source,
    message: anonymiseLog(input.message),
  }
  lines.unshift(entry)
  if (lines.length > MAX_LINES) lines.length = MAX_LINES
  return entry
}

/** Newest first. */
export function listAppLog(): AppLogEntry[] {
  return [...lines]
}

export function countAppLog(): number {
  return lines.length
}

export function deleteAppLogBefore(iso: string): number {
  const cutoff = Date.parse(iso)
  if (!Number.isFinite(cutoff)) return 0
  const before = lines.length
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (Date.parse(lines[i].at) < cutoff) lines.splice(i, 1)
  }
  return before - lines.length
}

/** Removes a single line by id — the per-target retention handler. */
export function deleteAppLogLine(id: string): boolean {
  const index = lines.findIndex((line) => line.id === id)
  if (index === -1) return false
  lines.splice(index, 1)
  return true
}

export function clearAppLog(): void {
  lines.length = 0
}
