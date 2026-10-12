/**
 * Presentational tables for extracted lab values and vitals.
 *
 * Values are extraction *suggestions*: the flag badge reflects the comparison
 * against the reference range printed in the source report, and the confidence
 * is a text-match confidence — never a clinical one.
 */

import type { GridColDef } from '@mui/x-data-grid-pro'
import { Activity, Beaker } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import type { ExtractedLabValue, ExtractedVital, ValueFlag } from '../../types/report.types'
import { Badge, cx, EmptyState } from '../ui'

const FLAG_META: Record<ValueFlag, { label: string; classes: string }> = {
  high: { label: 'High vs printed range', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
  low: { label: 'Low vs printed range', classes: 'bg-amber-50 text-amber-700 ring-amber-200' },
  normal: { label: 'Within printed range', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  unknown: { label: 'No reference range', classes: 'bg-ink-100 text-ink-500 ring-ink-200' },
}

function confidenceClasses(c: number): string {
  if (c >= 0.9) return 'text-emerald-700'
  if (c >= 0.7) return 'text-brand-700'
  if (c >= 0.5) return 'text-amber-700'
  return 'text-rose-700'
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <span className={cx('font-mono text-[11px] font-bold', confidenceClasses(value))} title="Text-match confidence — never a clinical confidence">
      {pct}%
    </span>
  )
}

type ExtractedValueRow = ExtractedLabValue | ExtractedVital

const valueColumns: GridColDef<ExtractedValueRow>[] = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    minWidth: 140,
    renderCell: (p) => (
      <div>
        <p className="text-[12px] font-bold text-ink-800">{p.row.name}</p>
        {'referenceRange' in p.row && p.row.referenceRange && (
          <p className="text-[11px] text-ink-400">range {p.row.referenceRange}</p>
        )}
      </div>
    ),
  },
  {
    field: 'value',
    headerName: 'Value',
    width: 110,
    align: 'right',
    headerAlign: 'right',
    renderCell: (p) => (
      <span className="whitespace-nowrap">
        <span className="text-[13px] font-bold text-ink-900">{p.row.value}</span>
        <span className="ml-1.5 text-[11px] text-ink-400">{p.row.unit}</span>
      </span>
    ),
  },
  {
    field: 'flag',
    headerName: 'Flag',
    width: 180,
    renderCell: (p) => <Badge className={FLAG_META[p.row.flag].classes}>{FLAG_META[p.row.flag].label}</Badge>,
  },
  {
    field: 'confidence',
    headerName: 'Confidence',
    width: 110,
    align: 'right',
    headerAlign: 'right',
    renderCell: (p) => <Confidence value={p.row.confidence} />,
  },
]

export default function ExtractedValuesTable({
  labValues,
  vitals,
  emptyHint = 'No values were extracted from these reports.',
}: {
  labValues: ExtractedLabValue[]
  vitals: ExtractedVital[]
  emptyHint?: string
}) {
  const hasLab = labValues.length > 0
  const hasVitals = vitals.length > 0

  if (!hasLab && !hasVitals) {
    return (
      <EmptyState
        icon={<Beaker size={20} />}
        title="No extracted values"
        hint={emptyHint}
      />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasLab && (
        <section className="rounded-xl border border-ink-200 bg-white">
          <header className="flex items-center gap-1.5 border-b border-ink-100 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">
            <Beaker size={12} className="text-brand-600" /> Lab values ({labValues.length})
          </header>
          <AppDataGrid<ExtractedValueRow>
            rows={labValues}
            columns={valueColumns}
            ariaLabel={`Lab values (${labValues.length})`}
            getRowId={(v) => v.id}
            hideToolbar
            hideFooter
            autoHeight
            defaultDensity="compact"
          />
        </section>
      )}

      {hasVitals && (
        <section className="rounded-xl border border-ink-200 bg-white">
          <header className="flex items-center gap-1.5 border-b border-ink-100 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">
            <Activity size={12} className="text-violet-600" /> Vitals ({vitals.length})
          </header>
          <AppDataGrid<ExtractedValueRow>
            rows={vitals}
            columns={valueColumns}
            ariaLabel={`Vitals (${vitals.length})`}
            getRowId={(v) => v.id}
            hideToolbar
            hideFooter
            autoHeight
            defaultDensity="compact"
          />
        </section>
      )}
    </div>
  )
}