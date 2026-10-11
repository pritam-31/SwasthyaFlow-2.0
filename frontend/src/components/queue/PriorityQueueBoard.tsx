import type { GridColDef } from '@mui/x-data-grid-pro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Pin,
  RefreshCw,
  RotateCw,
  SlidersHorizontal,
  TrendingDown,
} from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
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

  const columns: GridColDef<PriorityScore>[] = [
    {
      field: 'patient',
      headerName: 'Patient',
      flex: 1,
      minWidth: 200,
      valueGetter: (_value, row) => row.sessionId,
      renderCell: (p) => (
        <div>
          <button
            type="button"
            onClick={() => onSelectSession?.(p.row.sessionId)}
            className="text-left font-bold text-ink-800 hover:text-brand-700"
          >
            {p.row.sessionId.slice(0, 10)}
          </button>
          <div className="mt-1">
            <PriorityMarks entry={p.row} labelLang={labelLang} />
          </div>
        </div>
      ),
    },
    {
      field: 'score',
      headerName: labels.score,
      width: 180,
      valueGetter: (_value, row) => row.score,
      renderCell: (p) => (
        <div>
          <PriorityBadge band={p.row.band} score={p.row.score} />
          {p.row.override?.kind === 'score' && p.row.computedBand !== p.row.band && (
            <p className="mt-1 text-[10px] text-ink-400">
              {labels.computedBand}: {PRIORITY_BAND_LABELS[p.row.computedBand]}
            </p>
          )}
        </div>
      ),
    },
    {
      field: 'sla',
      headerName: labels.waiting,
      width: 160,
      renderCell: (p) => <SlaBadge entry={p.row} labelLang={labelLang} />,
    },
    {
      field: 'assignedTo',
      headerName: labels.assignment,
      width: 220,
      valueGetter: (_value, row) => (row.assignedTo ? (staffName.get(row.assignedTo) ?? row.assignedTo) : ''),
      renderCell: (p) =>
        permissions.canAssignCase ? (
          <select
            value={p.row.assignedTo ?? ''}
            onChange={(e) => {
              const value = e.target.value
              run(
                () =>
                  (value ? assignCase(p.row.sessionId, value) : unassignCase(p.row.sessionId)).then((r) => r.entry),
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
            {p.row.assignedTo ? (staffName.get(p.row.assignedTo) ?? labels.assignedTo) : labels.unassigned}
          </span>
        ),
    },
    {
      field: 'override',
      headerName: labels.override,
      flex: 1,
      minWidth: 260,
      sortable: false,
      filterable: false,
      renderCell: (p) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {permissions.canOverridePriority && (
            <Button size="sm" variant="secondary" onClick={() => setOverrideTarget(p.row)}>
              <SlidersHorizontal size={12} /> {labels.override}
            </Button>
          )}
          {canManage && (
            <>
              <Button size="sm" variant="ghost" title={labels.pin} onClick={() => applySimpleOverride(p.row, 'pin')}>
                <Pin size={12} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={labels.deprioritise}
                onClick={() => applySimpleOverride(p.row, 'deprioritise')}
              >
                <TrendingDown size={12} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={labels.markReviewed}
                onClick={() => applySimpleOverride(p.row, 'reviewed')}
              >
                <CheckCircle2 size={12} />
              </Button>
            </>
          )}
          {!canOverride && !canManage && <span className="text-[11px] text-ink-400">{labels.staffOnly}</span>}
        </div>
      ),
    },
  ]

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
        {entries.length === 0 && !loading ? (
          <EmptyState icon={<SlidersHorizontal size={20} />} title={labels.title} hint={error ?? labels.subtitle} />
        ) : (
          <AppDataGrid<PriorityScore>
            rows={entries}
            columns={columns}
            ariaLabel={labels.title}
            loading={loading}
            getRowId={(entry) => entry.sessionId}
            getRowClassName={(entry) => (entry.sessionId === selectedSessionId ? 'bg-brand-50/60' : '')}
            hideToolbar
            hideFooter
            defaultDensity="compact"
          />
        )}

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
