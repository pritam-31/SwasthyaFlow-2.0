import { useState } from 'react'
import { Button, Modal, cx } from '../ui'
import { PRIORITY_BANDS, PRIORITY_BAND_LABELS } from '../../types/priority.types'
import type { PriorityBand, PriorityOverrideKind, PriorityScore } from '../../types/priority.types'
import { PRIORITY_SECTION_LABELS } from '../../services/safetyPolicy'
import { clearPriorityOverride, setPriorityOverride } from '../../services/queueApi'

interface Props {
  open: boolean
  onClose: () => void
  entry: PriorityScore
  /** Doctor/admin only — nurses and facility-admins cannot change the score. */
  canOverrideScore: boolean
  canClear: boolean
  labelLang?: 'en' | 'hi' | 'or'
  onSaved: (entry: PriorityScore) => void
  onCleared: (kind: PriorityOverrideKind) => void
}

/**
 * Human priority override (P1-11). A mandatory, human-written reason is
 * anonymised by the backend before it is stored. Overriding changes ordering
 * only — it never diagnoses or prescribes anything.
 */
export function PriorityOverrideDialog({
  open,
  onClose,
  entry,
  canOverrideScore,
  canClear,
  labelLang = 'en',
  onSaved,
  onCleared,
}: Props) {
  const labels = PRIORITY_SECTION_LABELS[labelLang]
  const [kind, setKind] = useState<'score' | 'band'>('score')
  const [reason, setReason] = useState('')
  const [scoreInput, setScoreInput] = useState(String(entry.score))
  const [bandInput, setBandInput] = useState<PriorityBand>(entry.band)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = reason.trim()
  const scoreValid = /^\d+$/.test(scoreInput.trim()) && Number(scoreInput) >= 0 && Number(scoreInput) <= 100
  const canSubmit =
    canOverrideScore && trimmed.length >= 3 && trimmed.length <= 500 && (kind === 'band' || scoreValid) && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const value = kind === 'score' ? Number(scoreInput) : bandInput
      const res = await setPriorityOverride(entry.sessionId, { kind, value, reason: trimmed })
      onSaved(res.entry)
      setReason('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the override.')
    } finally {
      setSubmitting(false)
    }
  }

  const clear = async () => {
    const active = entry.override
    if (!active) return
    setSubmitting(true)
    setError(null)
    try {
      await clearPriorityOverride(entry.sessionId, active.kind)
      onCleared(active.kind)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the override.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={labels.override}>
      <div className="space-y-4">
        {!canOverrideScore ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{labels.cannotOverride}</p>
        ) : (
          <>
            <div className="inline-flex rounded-xl bg-ink-100 p-0.5 text-xs font-semibold">
              {(['score', 'band'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  aria-pressed={kind === option}
                  className={cx(
                    'rounded-lg px-3 py-1.5 transition',
                    kind === option ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500 hover:text-ink-700',
                  )}
                >
                  {option === 'score' ? labels.overrideScore : labels.overrideBand}
                </button>
              ))}
            </div>

            {kind === 'score' ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
                  {labels.overrideScore}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  className="inp"
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
                  {labels.overrideBand}
                </span>
                <select value={bandInput} onChange={(e) => setBandInput(e.target.value as PriorityBand)} className="inp">
                  {PRIORITY_BANDS.map((band) => (
                    <option key={band} value={band}>
                      {PRIORITY_BAND_LABELS[band]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
                {labels.overrideReason}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={labels.overrideReason}
                className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
              />
              <span className="mt-1 block text-[10px] text-ink-400">{trimmed.length} / 500</span>
            </label>
          </>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={!canSubmit}>
            {labels.submit}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {labels.cancel}
          </Button>
          {entry.override && canClear && (
            <Button variant="danger" className="ml-auto" onClick={clear} disabled={submitting}>
              {labels.clearOverride}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
