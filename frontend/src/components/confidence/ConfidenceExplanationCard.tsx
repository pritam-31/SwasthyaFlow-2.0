import { formatAuditTime } from '../../lib/format'
import { ProgressBar as Bar } from '../ui'
import ConfidenceBadge, { CONFIDENCE_BAND_META } from './ConfidenceBadge'
import ConfidenceSignalList from './ConfidenceSignalList'
import type { ConfidenceScore } from '../../types/confidence.types'
import type { ConfidenceSectionLabels } from '../../services/safetyPolicy'

/**
 * Renders one ConfidenceScore: the band, the one-sentence summary, the computed
 * timestamp and the contributing signals. The summary and details are rendered
 * verbatim from the backend (non-diagnostic + PII-free by construction).
 */
export function ConfidenceExplanationCard({
  score,
  labels,
  className,
}: {
  score: ConfidenceScore
  labels: ConfidenceSectionLabels
  className?: string
}) {
  const { explanation } = score
  const meta = CONFIDENCE_BAND_META[score.band]
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ConfidenceBadge band={score.band} value={score.value} label={labels.bands[score.band]} />
        <span className="text-[10.5px] text-ink-400">
          {labels.computedAt}: {formatAuditTime(explanation.computedAt)}
        </span>
      </div>
      <div className="mt-2">
        <Bar value={score.value * 100} tone={meta.bar} />
      </div>
      <p className="mt-2.5 text-[12px] text-ink-700">{explanation.summary}</p>
      <p className="mt-1 text-[10.5px] leading-snug text-ink-400">{labels.nonDiagnostic}</p>
      <ConfidenceSignalList signals={explanation.signals} labels={labels} />
    </div>
  )
}

export default ConfidenceExplanationCard
