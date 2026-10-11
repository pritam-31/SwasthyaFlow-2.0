import { useEffect, useState } from 'react'
import { AlertTriangle, Eraser, ShieldCheck } from 'lucide-react'
import { Badge, Button, Modal } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_REASON_LABELS, CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { fetchWithdrawalPreview, withdrawConsent } from '../../services/consentApi'
import { OfflineUnavailableError } from '../../services/offlineApi'
import { CONSENT_WITHDRAWAL_REASON_CODES } from '../../types/consent.types'
import type {
  ConsentWithdrawalPreview,
  ConsentWithdrawalReasonCode,
  ConsentWithdrawalResult,
} from '../../types/consent.types'

export function ConsentWithdrawDialog({
  open,
  sessionId,
  onClose,
  onDone,
}: {
  open: boolean
  sessionId: string
  onClose: () => void
  onDone: (result: ConsentWithdrawalResult) => void
}) {
  const { language } = useTriage()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]
  const reasonLabels = CONSENT_REASON_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  const [preview, setPreview] = useState<ConsentWithdrawalPreview | null>(null)
  const [reasonCode, setReasonCode] = useState<ConsentWithdrawalReasonCode>('privacy-concern')
  const [reasonText, setReasonText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPreview(null)
    setError(null)
    fetchWithdrawalPreview(sessionId)
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof OfflineUnavailableError ? e.message : 'Could not load the impact preview.')
      })
    return () => {
      cancelled = true
    }
  }, [open, sessionId])

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await withdrawConsent(sessionId, {
        reasonCode,
        ...(reasonText.trim() ? { reasonText: reasonText.trim() } : {}),
      })
      onDone(result)
      onClose()
    } catch (e) {
      setError(e instanceof OfflineUnavailableError ? e.message : e instanceof Error ? e.message : 'Withdrawal failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={labels.withdraw} wide>
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-ink-500">{labels.impactIntro}</p>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        {preview ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                <Eraser size={14} /> {labels.impactWipe}
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-rose-800">
                {preview.categories
                  .filter((c) => c.willBeDeleted > 0)
                  .map((c) => (
                    <li key={c.category} className="flex items-center justify-between gap-2">
                      <span>{c.label}</span>
                      <Badge className="bg-white text-rose-700 ring-rose-200">{c.willBeDeleted}</Badge>
                    </li>
                  ))}
                {preview.categories.every((c) => c.willBeDeleted === 0) && (
                  <li className="text-rose-700">—</li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <ShieldCheck size={14} /> {labels.impactRetain}
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-emerald-800">
                {preview.categories
                  .filter((c) => c.retained > 0)
                  .map((c) => (
                    <li key={c.category}>
                      <span>{c.label}</span>
                      <span className="ml-1 text-emerald-600">— {c.whyRetained}</span>
                    </li>
                  ))}
                {preview.categories.every((c) => c.retained === 0) && <li className="text-emerald-700">—</li>}
              </ul>
            </div>
          </div>
        ) : (
          !error && <p className="text-xs text-ink-400">Loading impact preview…</p>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-700">{labels.reasonHeading}</label>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as ConsentWithdrawalReasonCode)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:border-brand-400"
          >
            {CONSENT_WITHDRAWAL_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {reasonLabels[code]}
              </option>
            ))}
          </select>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value.slice(0, 500))}
            placeholder={labels.reasonPlaceholder}
            rows={2}
            className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:border-brand-400"
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{labels.canWithdraw}</span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {labels.cancel}
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy || !preview}>
            <Eraser size={14} />
            {busy ? labels.withdrawing : labels.confirmWithdraw}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
