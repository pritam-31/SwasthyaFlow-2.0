/**
 * Presentational tables for extracted lab values and vitals.
 *
 * Values are extraction *suggestions*: the flag badge reflects the comparison
 * against the reference range printed in the source report, and the confidence
 * is a text-match confidence — never a clinical one.
 */

import { Activity, Beaker } from 'lucide-react'
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

function ValueRow({
  name,
  value,
  unit,
  flag,
  confidence,
  referenceRange,
}: {
  name: string
  value: number
  unit: string
  flag: ValueFlag
  confidence: number
  referenceRange?: string | null
}) {
  const flagMeta = FLAG_META[flag]
  return (
    <tr className="border-b border-ink-100 last:border-0">
      <td className="py-2.5 pr-3">
        <p className="text-[12px] font-bold text-ink-800">{name}</p>
        {referenceRange && <p className="text-[11px] text-ink-400">range {referenceRange}</p>}
      </td>
      <td className="whitespace-nowrap py-2.5 px-3 text-right">
        <span className="text-[13px] font-bold text-ink-900">{value}</span>
        <span className="ml-1.5 text-[11px] text-ink-400">{unit}</span>
      </td>
      <td className="whitespace-nowrap py-2.5 px-3 text-right">
        <Badge className={flagMeta.classes}>{flagMeta.label}</Badge>
      </td>
      <td className="whitespace-nowrap py-2.5 pl-3 text-right">
        <Confidence value={confidence} />
      </td>
    </tr>
  )
}

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
          <table className="w-full px-3 py-1 text-sm">
            <tbody>
              {labValues.map((v) => (
                <ValueRow
                  key={v.id}
                  name={v.name}
                  value={v.value}
                  unit={v.unit}
                  flag={v.flag}
                  confidence={v.confidence}
                  referenceRange={v.referenceRange}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {hasVitals && (
        <section className="rounded-xl border border-ink-200 bg-white">
          <header className="flex items-center gap-1.5 border-b border-ink-100 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">
            <Activity size={12} className="text-violet-600" /> Vitals ({vitals.length})
          </header>
          <table className="w-full px-3 py-1 text-sm">
            <tbody>
              {vitals.map((v) => (
                <ValueRow key={v.id} name={v.name} value={v.value} unit={v.unit} flag={v.flag} confidence={v.confidence} />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}