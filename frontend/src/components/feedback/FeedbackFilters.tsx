import { Button } from '../ui'
import type { ReactNode } from 'react'
import {
  FEEDBACK_REASON_CODES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  FEEDBACK_TARGET_TYPES,
  FEEDBACK_VERDICTS,
  type FeedbackFilter,
} from '../../types/feedback.types'
import type { FeedbackSectionLabels } from '../../services/safetyPolicy'

/**
 * A single row of feedback filters. Every select maps to a backend filter key;
 * clearing a select removes that key from the filter object.
 */
export function FeedbackFilters({
  labels,
  value,
  onChange,
  onReset,
}: {
  labels: FeedbackSectionLabels
  value: FeedbackFilter
  onChange: (filter: FeedbackFilter) => void
  onReset: () => void
}) {
  const set = (key: keyof FeedbackFilter) => (raw: string) => {
    const next: FeedbackFilter = { ...value }
    if (raw) {
      ;(next as Record<string, string>)[key] = raw
    } else {
      delete next[key]
    }
    onChange(next)
  }

  const selectClass =
    'rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-ink-600 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select label={labels.targetType} className={selectClass} value={value.targetType ?? ''} onChange={set('targetType')}>
        <option value="">{labels.all}</option>
        {FEEDBACK_TARGET_TYPES.map((t) => (
          <option key={t} value={t}>
            {labels.targetTypes[t]}
          </option>
        ))}
      </Select>

      <Select label={labels.verdict} className={selectClass} value={value.verdict ?? ''} onChange={set('verdict')}>
        <option value="">{labels.all}</option>
        {FEEDBACK_VERDICTS.map((v) => (
          <option key={v} value={v}>
            {labels.verdicts[v]}
          </option>
        ))}
      </Select>

      <Select label={labels.reasonCode} className={selectClass} value={value.reasonCode ?? ''} onChange={set('reasonCode')}>
        <option value="">{labels.all}</option>
        {FEEDBACK_REASON_CODES.map((r) => (
          <option key={r} value={r}>
            {labels.reasonCodes[r]}
          </option>
        ))}
      </Select>

      <Select label={labels.severity} className={selectClass} value={value.severity ?? ''} onChange={set('severity')}>
        <option value="">{labels.all}</option>
        {FEEDBACK_SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {labels.severities[s]}
          </option>
        ))}
      </Select>

      <Select label={labels.status} className={selectClass} value={value.status ?? ''} onChange={set('status')}>
        <option value="">{labels.all}</option>
        {FEEDBACK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === 'active' ? labels.active : s === 'edited' ? labels.edited : labels.deletedCount}
          </option>
        ))}
      </Select>

      <Button variant="ghost" size="sm" onClick={onReset}>
        {labels.reset}
      </Button>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  className,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        {children}
      </select>
    </label>
  )
}

export default FeedbackFilters
