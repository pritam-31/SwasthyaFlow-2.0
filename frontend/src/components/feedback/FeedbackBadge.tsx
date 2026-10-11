import { HelpCircle, MinusCircle, ThumbsDown, ThumbsUp } from 'lucide-react'
import { cx } from '../ui'
import type { FeedbackSeverity, FeedbackVerdict } from '../../types/feedback.types'
import type { FeedbackSectionLabels } from '../../services/safetyPolicy'

/** Verdict → ring/bg/text colour. */
export const VERDICT_BADGE: Record<FeedbackVerdict, string> = {
  useful: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'partially-useful': 'bg-amber-50 text-amber-700 ring-amber-200',
  'not-useful': 'bg-rose-50 text-rose-700 ring-rose-200',
  unclear: 'bg-ink-100 text-ink-600 ring-ink-200',
}

/** Severity → ring/bg/text colour. */
export const SEVERITY_BADGE: Record<FeedbackSeverity, string> = {
  low: 'bg-sky-50 text-sky-700 ring-sky-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const VERDICT_ICON: Record<FeedbackVerdict, typeof ThumbsUp> = {
  useful: ThumbsUp,
  'partially-useful': MinusCircle,
  'not-useful': ThumbsDown,
  unclear: HelpCircle,
}

/**
 * A workflow-quality verdict chip. Feedback is advisory only and never a
 * clinical judgement.
 */
export function FeedbackBadge({
  verdict,
  labels,
  className,
}: {
  verdict: FeedbackVerdict
  labels: FeedbackSectionLabels
  className?: string
}) {
  const Icon = VERDICT_ICON[verdict]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
        VERDICT_BADGE[verdict],
        className,
      )}
    >
      <Icon size={12} /> {labels.verdicts[verdict]}
    </span>
  )
}

/** A severity chip (low / medium / high). */
export function SeverityBadge({
  severity,
  labels,
  className,
}: {
  severity: FeedbackSeverity
  labels: FeedbackSectionLabels
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
        SEVERITY_BADGE[severity],
        className,
      )}
    >
      {labels.severities[severity]}
    </span>
  )
}

export default FeedbackBadge
