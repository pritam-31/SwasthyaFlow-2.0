import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cx } from '../ui'
import type { ConfidenceSignal } from '../../types/confidence.types'
import type { ConfidenceSectionLabels } from '../../services/safetyPolicy'

const SIGNAL_DIRECTION_META: Record<ConfidenceSignal['direction'], { classes: string }> = {
  up: { classes: 'bg-emerald-50 text-emerald-700' },
  down: { classes: 'bg-amber-50 text-amber-700' },
  neutral: { classes: 'bg-ink-100 text-ink-500' },
}

/** Signed contribution, always two decimals (e.g. `+0.05`). */
export function formatConfidenceContribution(contribution: number): string {
  return `${contribution >= 0 ? '+' : ''}${contribution.toFixed(2)}`
}

/**
 * The contributing signals behind a confidence value. Each row names the signal,
 * whether it raised / lowered / left the value, the signed contribution and a
 * non-diagnostic, PII-free detail string.
 */
export function ConfidenceSignalList({
  signals,
  labels,
}: {
  signals: ConfidenceSignal[]
  labels: ConfidenceSectionLabels
}) {
  if (signals.length === 0) return null
  return (
    <ul className="mt-3 space-y-2">
      {signals.map((signal, index) => {
        const meta = SIGNAL_DIRECTION_META[signal.direction]
        return (
          <li key={`${signal.key}-${index}`} className="flex items-start gap-2.5">
            <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md', meta.classes)}>
              {signal.direction === 'up' ? (
                <ArrowUp size={12} />
              ) : signal.direction === 'down' ? (
                <ArrowDown size={12} />
              ) : (
                <Minus size={12} />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-ink-700">
                {signal.label}{' '}
                <span className="font-normal text-ink-400">
                  {labels[signal.direction]} {formatConfidenceContribution(signal.contribution)}
                </span>
              </p>
              <p className="text-[11px] leading-snug text-ink-500">{signal.detail}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default ConfidenceSignalList
