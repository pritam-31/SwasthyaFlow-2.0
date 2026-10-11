import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Badge, Button, cx, EmptyState } from '../ui'
import { formatAuditTime } from '../../lib/format'
import ConfidenceBadge from './ConfidenceBadge'
import ConfidenceExplanationCard from './ConfidenceExplanationCard'
import LowConfidenceReviewDialog from './LowConfidenceReviewDialog'
import { useTriage } from '../../context/TriageContext'
import type { LowConfidenceItem, LowConfidenceReviewAction, LowConfidenceVerdict, SessionConfidence } from '../../types/confidence.types'
import type { ConfidenceSectionLabels } from '../../services/safetyPolicy'

const VERDICT_BADGE: Record<LowConfidenceVerdict, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'needs-attention': 'bg-amber-50 text-amber-700 ring-amber-200',
  dismissed: 'bg-rose-50 text-rose-700 ring-rose-200',
}

/**
 * The list of a case's under-threshold outputs with a per-item human review
 * action. A recorded verdict is shown next to the item; it never changes the
 * underlying AI value.
 */
export function LowConfidencePanel({
  sessionId,
  confidence,
  labels,
}: {
  sessionId: string
  confidence: SessionConfidence
  labels: ConfidenceSectionLabels
}) {
  const { permissions, reviewLowConfidenceItem, confidenceReviewActions } = useTriage()
  const [reviewing, setReviewing] = useState<LowConfidenceItem | null>(null)
  const actions = confidenceReviewActions[sessionId] ?? []

  const latestFor = (item: LowConfidenceItem): LowConfidenceReviewAction | undefined =>
    actions.find((a) => a.itemType === item.itemType && a.itemId === item.itemId)

  const submit = async (verdict: LowConfidenceVerdict, reason: string): Promise<boolean> => {
    if (!reviewing) return false
    return reviewLowConfidenceItem({
      sessionId,
      itemType: reviewing.itemType,
      itemId: reviewing.itemId,
      verdict,
      reason,
    })
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <ClipboardCheck size={15} className="text-brand-600" />
        <div>
          <p className="text-[12.5px] font-bold text-ink-800">{labels.lowTitle}</p>
          <p className="text-[11px] text-ink-400">{labels.lowSubtitle}</p>
        </div>
      </div>

      {confidence.items.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={18} />} title={labels.noLowItems} />
      ) : (
        <ul className="space-y-2">
          {confidence.items.map((item) => {
            const recorded = latestFor(item)
            return (
              <li key={`${item.itemType}:${item.itemId}`} className="rounded-xl border border-ink-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink-700">
                    {labels.itemTypes[item.itemType]} · <span className="font-normal text-ink-500">{item.itemLabel}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ConfidenceBadge band={item.band} value={item.value} label={labels.bands[item.band]} />
                    {recorded && (
                      <Badge className={cx(VERDICT_BADGE[recorded.verdict])}>{labels.verdicts[recorded.verdict]}</Badge>
                    )}
                  </span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-brand-700">
                    {labels.summary}
                  </summary>
                  <ConfidenceExplanationCard
                    className="mt-2 rounded-lg bg-ink-50/60 p-2.5"
                    score={{ value: item.value, band: item.band, explanation: item.explanation }}
                    labels={labels}
                  />
                </details>
                {permissions.canReviewConfidence && (
                  <div className="mt-2 flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => setReviewing(item)}>
                      {labels.reviewItem}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{labels.history}</p>
        {actions.length === 0 ? (
          <p className="text-[11px] text-ink-400">{labels.noHistory}</p>
        ) : (
          <ul className="space-y-1.5">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-50/70 px-2.5 py-1.5 text-[11px] text-ink-600">
                <Badge className={cx(VERDICT_BADGE[a.verdict])}>{labels.verdicts[a.verdict]}</Badge>
                <span className="font-semibold text-ink-700">
                  {labels.itemTypes[a.itemType]} · {a.itemId}
                </span>
                <span className="text-ink-400">
                  {labels.actor}: {a.actorRole} · {formatAuditTime(a.createdAt)}
                </span>
                {a.reason && <span className="w-full text-ink-500">“{a.reason}”</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <LowConfidenceReviewDialog
        open={reviewing !== null}
        item={reviewing}
        labels={labels}
        onClose={() => setReviewing(null)}
        onSubmit={submit}
      />
    </div>
  )
}

export default LowConfidencePanel
