import { Pin, ArrowDown, CheckCircle2, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge, cx } from '../ui'
import { PRIORITY_BAND_LABELS, PRIORITY_BAND_STYLES } from '../../types/priority.types'
import type { PriorityBand, PriorityBreakdown, PriorityScore } from '../../types/priority.types'
import { PRIORITY_SECTION_LABELS } from '../../services/safetyPolicy'

export function PriorityBadge({ band, score }: { band: PriorityBand; score?: number }) {
  const style = PRIORITY_BAND_STYLES[band]
  return (
    <Badge className={style.pill}>
      <span className={cx('h-1.5 w-1.5 rounded-full', style.dot)} />
      {PRIORITY_BAND_LABELS[band]}
      {typeof score === 'number' && <span className="font-mono tabular-nums">{score}</span>}
    </Badge>
  )
}

/** Wait time against the facility SLA target for the case's band. */
export function SlaBadge({ entry, labelLang = 'en' }: { entry: PriorityScore; labelLang?: 'en' | 'hi' | 'or' }) {
  const labels = PRIORITY_SECTION_LABELS[labelLang]
  if (entry.slaBreached) {
    return (
      <Badge className="bg-rose-50 text-rose-700 ring-rose-200" icon={<AlertTriangle size={11} />}>
        {labels.slaBreached}
      </Badge>
    )
  }
  return (
    <span className="text-[11px] text-ink-500">
      {entry.waitMinutes} / {entry.slaMinutes} {labels.minutes}
    </span>
  )
}

/** Pin / deprioritise / reviewed / override markers for a queue row. */
export function PriorityMarks({ entry, labelLang = 'en' }: { entry: PriorityScore; labelLang?: 'en' | 'hi' | 'or' }) {
  const labels = PRIORITY_SECTION_LABELS[labelLang]
  const marks: Array<{ key: string; node: ReactNode }> = []
  if (entry.pinned) {
    marks.push({
      key: 'pin',
      node: (
        <Badge className="bg-violet-50 text-violet-700 ring-violet-200" icon={<Pin size={10} />}>
          {labels.pinned}
        </Badge>
      ),
    })
  }
  if (entry.deprioritised) {
    marks.push({
      key: 'deprio',
      node: (
        <Badge className="bg-ink-100 text-ink-600 ring-ink-200" icon={<ArrowDown size={10} />}>
          {labels.deprioritised}
        </Badge>
      ),
    })
  }
  if (entry.override) {
    marks.push({
      key: 'override',
      node: (
        <Badge className="bg-violet-50 text-violet-700 ring-violet-200" icon={<SlidersHorizontal size={10} />}>
          {labels.override}
        </Badge>
      ),
    })
  }
  if (entry.reviewed) {
    marks.push({
      key: 'reviewed',
      node: (
        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200" icon={<CheckCircle2 size={10} />}>
          {labels.reviewed}
        </Badge>
      ),
    })
  }
  if (marks.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {marks.map((m) => (
        <span key={m.key}>{m.node}</span>
      ))}
    </div>
  )
}

/** Transparent, per-component explanation of the score. */
export function PriorityBreakdownList({
  breakdown,
  labelLang = 'en',
}: {
  breakdown: PriorityBreakdown
  labelLang?: 'en' | 'hi' | 'or'
}) {
  const labels = PRIORITY_SECTION_LABELS[labelLang]
  const max = Math.max(1, ...breakdown.components.map((c) => c.maxPoints))
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{labels.breakdown}</p>
      <ul className="space-y-2">
        {breakdown.components.map((component) => {
          const width = Math.min(100, Math.round((Math.abs(component.points) / max) * 100))
          const negative = component.points < 0
          return (
            <li key={component.key} className="rounded-lg border border-ink-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-700">{component.label}</span>
                <span
                  className={cx(
                    'font-mono text-xs font-bold tabular-nums',
                    negative ? 'text-rose-600' : component.points === 0 ? 'text-ink-400' : 'text-brand-700',
                  )}
                >
                  {component.points > 0 ? `+${component.points}` : component.points}
                  <span className="ml-1 font-normal text-ink-400">/ {component.maxPoints}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-100">
                <span
                  className={cx('block h-full rounded-full', negative ? 'bg-rose-400' : 'bg-brand-400')}
                  style={{ width: `${width}%` }}
                />
              </div>
              {component.reasons.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {component.reasons.map((reason, i) => (
                    <li key={i} className="text-[11px] leading-snug text-ink-500">
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-ink-400">
        {breakdown.totalRaw !== breakdown.totalClamped
          ? `${breakdown.totalRaw} → ${breakdown.totalClamped}`
          : `${breakdown.totalClamped}`}
      </p>
    </div>
  )
}
