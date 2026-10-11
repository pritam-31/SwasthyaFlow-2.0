import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Button, cx, Modal } from '../ui'
import ConfidenceBadge from './ConfidenceBadge'
import ConfidenceExplanationCard from './ConfidenceExplanationCard'
import { LOW_CONFIDENCE_VERDICTS, type LowConfidenceItem, type LowConfidenceVerdict } from '../../types/confidence.types'
import type { ConfidenceSectionLabels } from '../../services/safetyPolicy'

const VERDICT_ICON: Record<LowConfidenceVerdict, typeof CheckCircle2> = {
  accepted: CheckCircle2,
  'needs-attention': AlertTriangle,
  dismissed: XCircle,
}

const VERDICT_ACTIVE_CLASS: Record<LowConfidenceVerdict, string> = {
  accepted: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  'needs-attention': 'border-amber-300 bg-amber-50 text-amber-800',
  dismissed: 'border-rose-300 bg-rose-50 text-rose-800',
}

/** A verdict needs a written reason unless it simply accepts the value. */
function reasonRequired(verdict: LowConfidenceVerdict): boolean {
  return verdict === 'needs-attention' || verdict === 'dismissed'
}

/**
 * Human-in-the-loop review of one low-confidence item. The decision never
 * changes the AI value — it records a verdict (and, where required, a reason)
 * beside it. The reason is anonymised and de-diagnosed by the backend before it
 * is stored.
 */
export function LowConfidenceReviewDialog({
  open,
  item,
  labels,
  onClose,
  onSubmit,
}: {
  open: boolean
  item: LowConfidenceItem | null
  labels: ConfidenceSectionLabels
  onClose: () => void
  onSubmit: (verdict: LowConfidenceVerdict, reason: string) => Promise<boolean>
}) {
  const [verdict, setVerdict] = useState<LowConfidenceVerdict>('accepted')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setVerdict('accepted')
      setReason('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, item?.itemId])

  if (!item) return null

  const submit = async () => {
    if (reasonRequired(verdict) && !reason.trim()) {
      setError(labels.reasonRequired)
      return
    }
    setSubmitting(true)
    setError(null)
    const ok = await onSubmit(verdict, reason.trim())
    setSubmitting(false)
    if (ok) {
      setReason('')
      setVerdict('accepted')
      onClose()
    } else {
      setError(labels.loadFailed)
    }
  }

  return (
    <Modal open={open && item !== null} onClose={onClose} title={labels.reviewTitle}>
      {item && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-ink-700">
                {labels.itemTypes[item.itemType]} · <span className="text-ink-500">{item.itemLabel}</span>
              </span>
              <ConfidenceBadge band={item.band} value={item.value} label={labels.bands[item.band]} />
            </div>
          </div>

          <ConfidenceExplanationCard score={{ value: item.value, band: item.band, explanation: item.explanation }} labels={labels} />

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{labels.verdict}</p>
            <div className="flex flex-wrap gap-1.5">
              {LOW_CONFIDENCE_VERDICTS.map((v) => {
                const Icon = VERDICT_ICON[v]
                const active = verdict === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVerdict(v)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors',
                      active ? VERDICT_ACTIVE_CLASS[v] : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
                    )}
                  >
                    <Icon size={13} /> {labels.verdicts[v]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="confidence-review-reason" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.reason}
              {reasonRequired(verdict) && <span className="ml-1 text-rose-600">*</span>}
            </label>
            <textarea
              id="confidence-review-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={labels.reasonHint}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-[10.5px] text-ink-400">{labels.reasonHint}</p>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              {labels.cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={submitting || (reasonRequired(verdict) && !reason.trim())}
              onClick={() => void submit()}
            >
              {labels.submit}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default LowConfidenceReviewDialog
