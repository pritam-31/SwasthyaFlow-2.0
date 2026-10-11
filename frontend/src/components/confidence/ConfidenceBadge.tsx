import { cx } from '../ui'
import type { ConfidenceBand } from '../../types/confidence.types'

/** Shared colour language for every confidence band (P2-14). */
export type ConfidenceBandMeta = {
  classes: string
  dot: string
  bar: 'emerald' | 'sky' | 'amber' | 'rose'
}

export const CONFIDENCE_BAND_META: Record<ConfidenceBand, ConfidenceBandMeta> = {
  high: { classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', bar: 'emerald' },
  medium: { classes: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', bar: 'sky' },
  low: { classes: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', bar: 'amber' },
  'very-low': { classes: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', bar: 'rose' },
}

/** English fallback labels; callers should pass the localised `label` instead. */
const DEFAULT_BAND_LABEL: Record<ConfidenceBand, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  'very-low': 'Very low',
}

/** Display a 0..1 confidence as a whole percentage. */
export function formatConfidencePct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * A band chip that carries the confidence colour. Optionally shows the numeric
 * value. The band is a workflow label about extraction reliability — never a
 * diagnosis.
 */
export function ConfidenceBadge({
  band,
  value,
  label,
  className,
}: {
  band: ConfidenceBand
  value?: number
  label?: string
  className?: string
}) {
  const meta = CONFIDENCE_BAND_META[band]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
        meta.classes,
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
      {label ?? DEFAULT_BAND_LABEL[band]}
      {typeof value === 'number' && <span className="tabular-nums opacity-70">· {formatConfidencePct(value)}</span>}
    </span>
  )
}

export default ConfidenceBadge
