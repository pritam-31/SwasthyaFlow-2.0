import { useState, type FormEvent } from 'react'
import { Button, Modal } from '../ui'
import { FAILURE_MODE_SECTION_LABELS, MODEL_CARD_SECTION_LABELS } from '../../services/safetyPolicy'
import { useApp } from '../../store/AppStore'
import { createFailureMode, updateFailureMode } from '../../services/modelCardApi'
import {
  ALL_LAYER_IDS,
  FAILURE_IMPACTS,
  FAILURE_LIKELIHOODS,
  FAILURE_STATUSES,
  LAYER_LABEL,
  type FailureImpact,
  type FailureLikelihood,
  type FailureMode,
  type FailureStatus,
  type LayerId,
} from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

interface Draft {
  layerId: LayerId
  title: string
  description: string
  triggerExample: string
  impact: FailureImpact
  likelihood: FailureLikelihood
  status: FailureStatus
  mitigation: string
}

function emptyDraft(layerId: LayerId): Draft {
  return {
    layerId,
    title: '',
    description: '',
    triggerExample: '',
    impact: 'medium',
    likelihood: 'uncommon',
    status: 'open',
    mitigation: '',
  }
}

function fromFailure(fm: FailureMode): Draft {
  return {
    layerId: fm.layerId,
    title: fm.title,
    description: fm.description,
    triggerExample: fm.triggerExample,
    impact: fm.impact,
    likelihood: fm.likelihood,
    status: fm.status,
    mitigation: fm.mitigation,
  }
}

/** Create / edit a failure-mode catalogue entry (system-admin only server-side). */
export function FailureModeEditor({
  open,
  onClose,
  onSaved,
  initial,
  defaultLayerId,
  lang = 'en',
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial: FailureMode | null
  defaultLayerId: LayerId
  lang?: Lang
}) {
  const t = FAILURE_MODE_SECTION_LABELS[lang]
  const cardT = MODEL_CARD_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [draft, setDraft] = useState<Draft>(() => (initial ? fromFailure(initial) : emptyDraft(defaultLayerId)))
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const input = {
        layerId: draft.layerId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        triggerExample: draft.triggerExample.trim(),
        impact: draft.impact,
        likelihood: draft.likelihood,
        status: draft.status,
        mitigation: draft.mitigation.trim(),
      }
      if (initial) {
        await updateFailureMode(initial.failureId, input)
        pushToast('success', t.updated)
      } else {
        await createFailureMode(input)
        pushToast('success', t.created)
      }
      onSaved()
      onClose()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.save)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? t.edit : t.create} wide>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{cardT.layer}</span>
          <select value={draft.layerId} onChange={(e) => set('layerId', e.target.value as LayerId)} className="inp">
            {ALL_LAYER_IDS.map((id) => (
              <option key={id} value={id}>
                {LAYER_LABEL[id]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.title}</span>
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} className="inp" required />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{cardT.description}</span>
          <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} className="inp min-h-[72px]" required />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.trigger}</span>
          <textarea value={draft.triggerExample} onChange={(e) => set('triggerExample', e.target.value)} className="inp min-h-[64px]" required />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.impact}</span>
            <select value={draft.impact} onChange={(e) => set('impact', e.target.value as FailureImpact)} className="inp">
              {FAILURE_IMPACTS.map((v) => (
                <option key={v} value={v}>
                  {v === 'high' ? t.impactHigh : v === 'medium' ? t.impactMedium : t.impactLow}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.likelihood}</span>
            <select value={draft.likelihood} onChange={(e) => set('likelihood', e.target.value as FailureLikelihood)} className="inp">
              {FAILURE_LIKELIHOODS.map((v) => (
                <option key={v} value={v}>
                  {v === 'rare' ? t.likelihoodRare : v === 'uncommon' ? t.likelihoodUncommon : t.likelihoodCommon}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.status}</span>
            <select value={draft.status} onChange={(e) => set('status', e.target.value as FailureStatus)} className="inp">
              {FAILURE_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {v === 'open' ? t.statusOpen : v === 'mitigated' ? t.statusMitigated : t.statusAccepted}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.mitigation}</span>
          <textarea value={draft.mitigation} onChange={(e) => set('mitigation', e.target.value)} className="inp min-h-[72px]" required />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {t.save}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
