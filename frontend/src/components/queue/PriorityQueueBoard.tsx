import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Pin,
  RefreshCw,
  RotateCw,
  SlidersHorizontal,
  TrendingDown,
} from 'lucide-react'
import { Button, Card, EmptyState, cx } from '../ui'
import { useApp } from '../../store/AppStore'
import { useQueue } from '../../hooks/useQueue'
import { useQueueStream } from '../../hooks/useQueueStream'
import { useTriage } from '../../context/TriageContext'
import { PRIORITY_SECTION_LABELS } from '../../services/safetyPolicy'
import { PRIORITY_BAND_LABELS, PRIORITY_BANDS, PRIORITY_BAND_STYLES } from '../../types/priority.types'
import type {
  AssignableStaff,
  PriorityBand,
  PriorityScore,
  PrioritySortField,
} from '../../types/priority.types'
import { assignCase, fetchAssignees, recomputeQueue, setPriorityOverride, unassignCase } from '../../services/queueApi'
import { PriorityBadge, PriorityMarks, SlaBadge } from './PriorityBadge'
import { PriorityOverrideDialog } from './PriorityOverrideDialog'

const SORT_OPTIONS: Array<{ field: PrioritySortField; direction: 'asc' | 'desc'; label: string }> = [
  { field: 'priority', direction: 'desc', label: 'Priority' },
  { field: 'wait', direction: 'desc', label: 'Waiting time' },
  { field: 'sla', direction: 'desc', label: 'SLA target' },
  { field: 'updated', direction: 'desc', label: 'Recently updated' },
]

function reasonFor(kind: 'score' | 'band' | 'pin' | 'deprioritise' | 'reviewed'): string {
  switch (kind) {
    case 'pin':
      return 'Pinned to the top of the review queue by staff.'
    case 'deprioritise':
      return 'Moved to the bottom of the review queue by staff.'
    case 'reviewed':
      return 'Marked reviewed by staff; the computed score is unchanged.'
    default:
      return 'Priority adjusted by staff after clinical review.'
  }
}

export interface PriorityQueueBoardProps {
  enabled: boolean
  selectedSessionId?: string | null
  onSelectSession?: (id: string) => void
  labelLang?: 'en' | 'hi' | 'or'
}

/**
 * The transparent review queue (P1-11). The backend owns the score; this board
 * only mirrors it, explains it and lets staff pin, deprioritise, assign or
 * (if permitted) override it with a mandatory human reason.
 */
export function PriorityQueueBoard({
  enabled,
  selectedSessionId,
  onSelectSession,
  labelLang = 'en',
}: PriorityQueueBoardProps) {
  const labels = PRIORITY_SECTION_LABELS[labelLang]
  const { permissions } = useTriage()
  const { pushToast } = useApp()
  const { entries, summary, loading, error, filter, sort, setFilter, setSort, refresh, upsert } = useQueue(enabled)
  const [staff, setStaff] = useState<AssignableStaff[]>([])
  const [overrideTarget, setOverrideTarget] = useState<PriorityScore | null>(null)

  useQueueStream(enabled, refresh)

  useEffect(() => {
    if (!enabled || !permissions.canAssignCase) return
    fetchAssignees()
      .then((res) => setStaff(res.assignees))
      .catch(() => setStaff([]))
  }, [enabled, permissions.canAssignCase])

  const staffName = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of staff) map.set(s.id, s.displayName)
    return map
  }, [staff])

  const run = useCallback(
    async (action: () => Promise<PriorityScore>, successMessage: string) => {
      try {
        const entry = await action()
        upsert(entry)
        pushToast('success', successMessage)
      } catch (e) {
        pushToast('error', e instanceof Error ? e.message : 'The action could not be completed.')
      }
    },
    [pushToast, upsert],
  )

  const applySimpleOverride = (entry: PriorityScore, kind: 'pin' | 'deprioritise' | 'reviewed') =>
    run(
      () => setPriorityOverride(entry.sessionId, { kind, reason: reasonFor(kind) }).then((r) => r.entry),
      labels.saved,
    )

  const toggleBand = (band: PriorityBand) => {
    const current = filter.band ?? []
    const next = current.includes(band) ? current.filter((b) => b !== band) : [...current, band]
    setFilter({ ...filter, band: next.length > 0 ? next : undefined })
  }

  const canOverride = permissions.canOverridePriority || permissions.canPinCase || permissions.canDeprioritiseCase
  const canManage = permissions.canPinCase || permissions.canDeprioritiseCase || permissions.canMarkReviewed

  return (
    <div className="space-y-4">
      <Card
        pad={false}
        title={
          <>
            <SlidersHorizontal size={14} /> {labels.title}
          </>
        }
        subtitle={labels.subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {labels.refresh}
            </Button>
            {permissions.canRecomputeQueue && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  recomputeQueue()
                    .then(() => {
                      refresh()
                      pushToast('success', labels.recompute)
                    })
                    .catch((e) => pushToast('error', e instanceof Error ? e.message : labels.recompute))
                }
              >
                <RotateCw size={13} /> {labels.recompute}
              </Button>
            )}
          </div>
        }
      >
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/50 px-5 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{labels.summary}</span>
          {PRIORITY_BANDS.map((band) => {
            const active = (filter.band ?? []).includes(band)
            const style = PRIORITY_BAND_STYLES[band]
            return (
              <button
                key={band}
                type="button"
                onClick={() => toggleBand(band)}
                aria-pressed={active}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition',
                  active ? style.pill : 'bg-white text-ink-500 ring-ink-200 hover:text-ink-700',
                )}
              >
                <span className={cx('h-1.5 w-1.5 rounded-full', style.dot)} />
                {PRIORITY_BAND_LABELS[band]}
                <span className="font-mono tabular-nums">{summary.byBand[band] ?? 0}</span>
              </button>
            )
          })}
          <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-ink-600">
            <input
              type="checkbox"
              checked={filter.slaBreached === true}
              onChange={(e) => setFilter({ ...filter, slaBreached: e.target.checked ? true : undefined })}
            />
            {labels.slaBreached}
            <span className="font-mono tabular-nums text-rose-600">{summary.slaBreaches}</span>
          </label>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-500">
            {labels.unassigned}
            <span className="font-mono tabular-nums">{summary.unassigned}</span>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-ink-400">{labels.total}: {summary.total}</span>
            <select
              value={`${sort.field}:${sort.direction}`}
              onChange={(e) => {
                const [field, direction] = e.target.value.split(':')
                setSort({ field: field as typeof sort.field, direction: direction as 'asc' | 'desc' })
              }}
              className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-600"
              aria-label="Sort queue"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={`${option.field}-${option.direction}`} value={`${option.field}:${option.direction}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="px-5 py-2 text-xs text-rose-600">{error}</p>}

        {/* Rows */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-5 py-2.5 font-bold">Patient</th>
                <th className="px-3 py-2.5 font-bold">{labels.score}</th>
                <th className="px-3 py-2.5 font-bold">{labels.waiting}</th>
                <th className="px-3 py-2.5 font-bold">{labels.assignment}</th>
                <th className="px-3 py-2.5 font-bold">{labels.override}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {entries.map((entry) => {
                const active = entry.sessionId === selectedSessionId
                return (
                  <tr
                    key={entry.sessionId}
                    className={cx('align-top transition-colors', active ? 'bg-brand-50/60' : 'hover:bg-ink-50/60')}
                  >
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectSession?.(entry.sessionId)}
                        className="text-left font-bold text-ink-800 hover:text-brand-700"
                      >
                        {entry.sessionId.slice(0, 10)}
                      </button>
                      <div className="mt-1">
                        <PriorityMarks entry={entry} labelLang={labelLang} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <PriorityBadge band={entry.band} score={entry.score} />
                      {entry.override?.kind === 'score' && entry.computedBand !== entry.band && (
                        <p className="mt-1 text-[10px] text-ink-400">
                          {labels.computedBand}: {PRIORITY_BAND_LABELS[entry.computedBand]}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SlaBadge entry={entry} labelLang={labelLang} />
                    </td>
                    <td className="px-3 py-3">
                      {permissions.canAssignCase ? (
                        <select
                          value={entry.assignedTo ?? ''}
                          onChange={(e) => {
                            const value = e.target.value
                            run(
                              () =>
                                (value ? assignCase(entry.sessionId, value) : unassignCase(entry.sessionId)).then(
                                  (r) => r.entry,
                                ),
                              labels.saved,
                            )
                          }}
                          className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] text-ink-700"
                        >
                          <option value="">{labels.unassigned}</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.displayName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-ink-500">
                          {entry.assignedTo ? (staffName.get(entry.assignedTo) ?? labels.assignedTo) : labels.unassigned}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {permissions.canOverridePriority && (
                          <Button size="sm" variant="secondary" onClick={() => setOverrideTarget(entry)}>
                            <SlidersHorizontal size={12} /> {labels.override}
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={labels.pin}
                              onClick={() => applySimpleOverride(entry, 'pin')}
                            >
                              <Pin size={12} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={labels.deprioritise}
                              onClick={() => applySimpleOverride(entry, 'deprioritise')}
                            >
                              <TrendingDown size={12} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={labels.markReviewed}
                              onClick={() => applySimpleOverride(entry, 'reviewed')}
                            >
                              <CheckCircle2 size={12} />
                            </Button>
                          </>
                        )}
                        {!canOverride && !canManage && <span className="text-[11px] text-ink-400">{labels.staffOnly}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {entries.length === 0 && !loading && (
            <EmptyState
              icon={<SlidersHorizontal size={20} />}
              title={labels.title}
              hint={error ?? labels.subtitle}
            />
          )}
        </div>

        <div className="border-t border-ink-100 px-5 py-2.5 text-[11px] leading-relaxed text-ink-400">
          {labels.disclaimer}
        </div>
      </Card>

      {overrideTarget && (
        <PriorityOverrideDialog
          open={overrideTarget !== null}
          onClose={() => setOverrideTarget(null)}
          entry={overrideTarget}
          canOverrideScore={permissions.canOverridePriority}
          canClear={permissions.canClearPriorityOverride}
          labelLang={labelLang}
          onSaved={(entry) => upsert(entry)}
          onCleared={() => refresh()}
        />
      )}
    </div>
  )
}
