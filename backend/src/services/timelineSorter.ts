import type { NormalizedTime, TimelineEvent } from '../types'

/**
 * Timeline ordering (P0-4).
 *
 * Sorting contract:
 *  - Absolute events sort by their written date.
 *  - Relative events sort by "X before intake": `daysFromIntake` counts whole
 *    days before the intake reference, so a bigger number means older.
 *  - Events with no readable time sort last (chronology is never invented).
 *
 * Near-duplicates (same time, same source, same verbatim text) collapse into
 * the first occurrence so repeated sentences do not clutter the view.
 */

export function sortTimeFor(normalized: NormalizedTime | null, referenceIso: string): number {
  if (!normalized) return Number.POSITIVE_INFINITY
  if (normalized.kind === 'absolute') {
    const ms = Date.parse(normalized.iso)
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
  }
  const referenceMs = Date.parse(referenceIso) || Date.now()
  const hours = normalized.hoursFromIntake ?? 0
  return referenceMs - normalized.daysFromIntake * 86_400_000 - hours * 3_600_000
}

type Sortable = Pick<TimelineEvent, 'normalizedTime' | 'timePrecision' | 'eventText' | 'source' | 'sourceRef'>

function sortKey(event: Sortable, referenceIso: string): number {
  let key = sortTimeFor(event.normalizedTime, referenceIso)
  // 'relative' precision ties (e.g. several "today" events) keep their source order.
  if (key === Number.POSITIVE_INFINITY) key = Number.MAX_SAFE_INTEGER
  return key
}

export function sortTimelineEvents<T extends Sortable>(events: T[], referenceIso: string): T[] {
  return [...events]
    .map((event, index) => ({ event, index, key: sortKey(event, referenceIso) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.event)
}

function timeKey(normalized: NormalizedTime | null): string {
  if (!normalized) return '?'
  return normalized.kind === 'absolute' ? `a:${normalized.iso}` : `r:${normalized.daysFromIntake}:${normalized.hoursFromIntake ?? 0}`
}

function signature(event: Sortable): string {
  return `${event.source}|${timeKey(event.normalizedTime)}|${event.eventText.replace(/\s+/g, ' ').trim().toLowerCase()}`
}

export function dedupeEvents<T extends Sortable>(events: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const event of events) {
    const sig = signature(event)
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(event)
  }
  return out
}

