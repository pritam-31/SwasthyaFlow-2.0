import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchQueue } from '../services/queueApi'
import type { PriorityFilterOptions, PriorityScore, PrioritySortOptions, QueueSummary } from '../types/priority.types'

const EMPTY_SUMMARY: QueueSummary = {
  total: 0,
  byBand: { critical: 0, high: 0, medium: 0, low: 0, routine: 0 },
  slaBreaches: 0,
  overridden: 0,
  pinned: 0,
  unassigned: 0,
}

const DEFAULT_SORT: PrioritySortOptions = { field: 'priority', direction: 'desc' }

export interface UseQueueResult {
  entries: PriorityScore[]
  summary: QueueSummary
  loading: boolean
  error: string | null
  filter: PriorityFilterOptions
  sort: PrioritySortOptions
  setFilter: (next: PriorityFilterOptions) => void
  setSort: (next: PrioritySortOptions) => void
  refresh: () => void
  /** Merge one updated score into the list (e.g. after an assignment). */
  upsert: (entry: PriorityScore) => void
  /** Replace the summary from a streamed update. */
  setSummary: (next: QueueSummary) => void
}

/**
 * Loads the facility review queue from the backend, which owns the scoring and
 * ordering. The hook never sorts or scores locally — it only mirrors the server
 * response, so the UI cannot drift from the transparent backend rules.
 */
export function useQueue(enabled: boolean): UseQueueResult {
  const [entries, setEntries] = useState<PriorityScore[]>([])
  const [summary, setSummary] = useState<QueueSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PriorityFilterOptions>({})
  const [sort, setSort] = useState<PrioritySortOptions>(DEFAULT_SORT)
  const [reloadKey, setReloadKey] = useState(0)
  const requestSeq = useRef(0)

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  const upsert = useCallback(
    (entry: PriorityScore) =>
      setEntries((prev) =>
        prev.some((e) => e.sessionId === entry.sessionId)
          ? prev.map((e) => (e.sessionId === entry.sessionId ? entry : e))
          : [...prev, entry],
      ),
    [],
  )

  useEffect(() => {
    if (!enabled) return
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    fetchQueue(filter, sort)
      .then(({ entries: next, summary: nextSummary }) => {
        if (seq !== requestSeq.current) return
        setEntries(next)
        setSummary(nextSummary)
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return
        setError(err instanceof Error ? err.message : 'Could not load the review queue.')
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
  }, [enabled, filter, sort, reloadKey])

  return { entries, summary, loading, error, filter, sort, setFilter, setSort, refresh, upsert, setSummary }
}
