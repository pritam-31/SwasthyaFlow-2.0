import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Modal } from '../ui'

/**
 * Destructive-action confirmation with an optional reason. The reason is handed
 * to the backend where it is stored on the deletion proof (no patient payload).
 */
export default function DeleteConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  reasonLabel,
  reasonPlaceholder,
  busy,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  message: string
  confirmLabel: string
  reasonLabel?: string
  reasonPlaceholder?: string
  busy?: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-3 text-xs leading-relaxed text-rose-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>{message}</p>
        </div>
        {reasonLabel && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {reasonLabel}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {reasonLabel ? 'Cancel' : 'Close'}
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim())} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
