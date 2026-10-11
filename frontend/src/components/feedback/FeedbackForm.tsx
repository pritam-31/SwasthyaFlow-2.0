import { useEffect, useState } from 'react'
import { Button, Modal } from '../ui'
import {
  FEEDBACK_REASON_CODES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_TARGET_TYPES,
  FEEDBACK_VERDICTS,
  type Feedback,
  type FeedbackCreateInput,
  type FeedbackReasonCode,
  type FeedbackSeverity,
  type FeedbackTargetType,
  type FeedbackUpdateInput,
  type FeedbackVerdict,
} from '../../types/feedback.types'
import { ALL_LAYER_IDS, LAYER_LABEL, type LayerId } from '../../types/modelcard.types'
import type { FeedbackSectionLabels } from '../../services/safetyPolicy'

export interface FeedbackTargetPreset {
  targetType: FeedbackTargetType
  targetId: string
  targetLabel?: string
  layerId?: LayerId | null
}

/**
 * Create or edit one clinician feedback verdict. Free-text fields are
 * anonymised and de-diagnosed by the backend before storage. Feedback is
 * workflow-quality evidence only — it never changes a rule, threshold or score.
 */
export function FeedbackForm({
  open,
  labels,
  sessionId,
  preset,
  editing,
  onSubmit,
  onUpdate,
  onClose,
}: {
  open: boolean
  labels: FeedbackSectionLabels
  /** The case in scope; null for facility-level (`rule`) feedback. */
  sessionId: string | null
  preset?: FeedbackTargetPreset
  /** When set, the form edits this record instead of creating a new one. */
  editing: Feedback | null
  onSubmit: (input: FeedbackCreateInput) => Promise<boolean>
  onUpdate: (id: string, patch: FeedbackUpdateInput) => Promise<boolean>
  onClose: () => void
}) {
  const [targetType, setTargetType] = useState<FeedbackTargetType>('triage-note')
  const [targetId, setTargetId] = useState('')
  const [targetLabel, setTargetLabel] = useState('')
  const [layerId, setLayerId] = useState<LayerId | ''>('')
  const [verdict, setVerdict] = useState<FeedbackVerdict>('useful')
  const [reasonCode, setReasonCode] = useState<FeedbackReasonCode>('correct')
  const [severity, setSeverity] = useState<FeedbackSeverity>('medium')
  const [reasonText, setReasonText] = useState('')
  const [suggestedFix, setSuggestedFix] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    if (editing) {
      setTargetType(editing.targetType)
      setTargetId(editing.targetId)
      setTargetLabel(editing.targetLabel)
      setLayerId(editing.layerId ?? '')
      setVerdict(editing.verdict)
      setReasonCode(editing.reasonCode)
      setSeverity(editing.severity)
      setReasonText(editing.reasonText ?? '')
      setSuggestedFix(editing.suggestedFix ?? '')
    } else {
      setTargetType(preset?.targetType ?? 'triage-note')
      setTargetId(preset?.targetId ?? sessionId ?? '')
      setTargetLabel(preset?.targetLabel ?? '')
      setLayerId(preset?.layerId ?? '')
      setVerdict('useful')
      setReasonCode('correct')
      setSeverity('medium')
      setReasonText('')
      setSuggestedFix('')
    }
  }, [open, editing, preset, sessionId])

  const canSubmit = targetId.trim().length > 0

  const submit = async () => {
    if (!canSubmit) {
      setError(labels.loadFailed)
      return
    }
    setSubmitting(true)
    setError(null)
    const ok = editing
      ? await onUpdate(editing.id, {
          verdict,
          reasonCode,
          severity,
          reasonText: reasonText.trim() || null,
          suggestedFix: suggestedFix.trim() || null,
          targetLabel: targetLabel.trim() || undefined,
        })
      : await onSubmit({
          sessionId,
          targetType,
          targetId: targetId.trim(),
          targetLabel: targetLabel.trim() || undefined,
          layerId: layerId || null,
          verdict,
          reasonCode,
          severity,
          reasonText: reasonText.trim() || null,
          suggestedFix: suggestedFix.trim() || null,
        })
    setSubmitting(false)
    if (ok) onClose()
    else setError(labels.loadFailed)
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? labels.editTitle : labels.addFeedback}>
      <div className="space-y-4">
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-[11px] font-medium text-brand-800">{labels.nonDiagnostic}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.targetType}
            </label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as FeedbackTargetType)}
              disabled={editing !== null}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
            >
              {FEEDBACK_TARGET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {labels.targetTypes[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.layer}
            </label>
            <select
              value={layerId}
              onChange={(e) => setLayerId(e.target.value as LayerId | '')}
              disabled={editing !== null}
              title={labels.layerOptional}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
            >
              <option value="">—</option>
              {ALL_LAYER_IDS.map((l) => (
                <option key={l} value={l}>
                  {LAYER_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.target} ID
            </label>
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={editing !== null}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.targetLabel}
            </label>
            <input
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value)}
              placeholder={labels.targetLabelHint}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.verdict}
            </label>
            <select
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as FeedbackVerdict)}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {FEEDBACK_VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {labels.verdicts[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              {labels.reasonCode}
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as FeedbackReasonCode)}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {FEEDBACK_REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {labels.reasonCodes[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {labels.severity}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={
                  'rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ' +
                  (severity === s
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50')
                }
              >
                {labels.severities[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {labels.reasonText}
          </label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={labels.reasonTextHint}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {labels.suggestedFix}
          </label>
          <textarea
            value={suggestedFix}
            onChange={(e) => setSuggestedFix(e.target.value.slice(0, 500))}
            rows={2}
            placeholder={labels.suggestedFixHint}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button variant="primary" size="sm" disabled={submitting || !canSubmit} onClick={() => void submit()}>
            {submitting ? labels.saving : editing ? labels.save : labels.submit}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default FeedbackForm
