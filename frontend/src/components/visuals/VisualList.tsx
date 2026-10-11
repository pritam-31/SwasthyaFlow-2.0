/**
 * Session photo list — the reviewer workspace for a single session.
 *
 * Lists every stored (redacted) photo with expandable previews and, for
 * doctor / admin, verify / reject / delete actions. Every action is audited.
 */

import { Camera, CheckCircle2, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTriage } from '../../context/TriageContext'
import { VISUAL_TYPE_LABELS } from '../../services/safetyPolicy'
import type { VisualRecord } from '../../types/visual.types'
import { Badge, Button, Card, cx, EmptyState, Modal } from '../ui'
import VisualPreview from './VisualPreview'

export default function VisualList({ visuals }: { visuals: VisualRecord[] }) {
  const { permissions, verifyVisual, rejectVisual, deleteSessionVisual } = useTriage()
  const [openId, setOpenId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<VisualRecord | null>(null)
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState<VisualRecord | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const canReview = permissions.canReviewVisuals

  if (visuals.length === 0) {
    return (
      <Card title="Clinical photos" subtitle="Redacted photos attached to this session.">
        <EmptyState
          icon={<Camera size={20} />}
          title="No photos on this session"
          hint="Upload a JPG, PNG, HEIC or WEBP photo — the backend strips EXIF, black-boxes faces and identifiers, and writes descriptive rows for human verification."
        />
      </Card>
    )
  }

  const pending = visuals.filter((v) => v.status === 'pending-review').length

  return (
    <Card
      title="Clinical photos"
      subtitle={`${visuals.length} photo(s)${pending > 0 ? ` · ${pending} awaiting verification` : ''} — descriptions are non-diagnostic suggestions for a human.`}
      action={
        <Badge className="bg-ink-100 text-ink-600 ring-ink-200">
          {visuals.reduce((n, v) => n + v.piiSummary.regionCount, 0)} PII region(s) redacted
        </Badge>
      }
    >
      {notice && (
        <p role="status" className="mb-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
          {notice}
        </p>
      )}

      <div className="space-y-2.5">
        {visuals.map((v) => (
          <div key={v.id} className="space-y-1.5">
            <div
              className={cx(
                'flex flex-wrap items-center gap-2 rounded-xl border p-1 pr-2 transition',
                openId === v.id ? 'border-brand-300 bg-brand-50/40' : 'border-ink-200 bg-white hover:border-ink-300',
              )}
            >
              <button
                type="button"
                onClick={() => setOpenId((id) => (id === v.id ? null : v.id))}
                className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left"
                aria-expanded={openId === v.id}
              >
                <span className="block truncate text-xs font-bold text-ink-800">{v.fileName}</span>
                <span className="block text-[11px] text-ink-400">
                  {VISUAL_TYPE_LABELS[v.visualType] ?? 'Photo'} ·{' '}
                  {v.status === 'pending-review'
                    ? 'Pending verification'
                    : v.status === 'verified'
                      ? `Verified · ${v.reviewedBy ?? 'peer'}`
                      : `Rejected · ${v.rejectionReason?.slice(0, 60) ?? 'no reason'}`}
                </span>
              </button>

              <span className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2 py-1 text-[10px] text-ink-500">
                {v.piiSummary.regionCount} redaction(s) · {v.extraction.concerns.length} flag(s)
              </span>

              {canReview && (
                <>
                  <Button
                    size="sm"
                    variant="success"
                    disabled={v.status !== 'pending-review'}
                    title={v.status === 'pending-review' ? 'Verify the descriptions' : 'Already reviewed'}
                    onClick={async () => {
                      const ok = await verifyVisual(v.sessionId, v.id)
                      setNotice(ok ? `"${v.fileName}" verified.` : 'Your role cannot verify photos.')
                    }}
                  >
                    <CheckCircle2 size={13} /> Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={v.status === 'rejected'}
                    aria-label={`Reject ${v.fileName}`}
                    onClick={() => {
                      setRejecting(v)
                      setReason(v.rejectionReason ?? '')
                    }}
                  >
                    <XCircle size={13} /> Reject
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${v.fileName}`} onClick={() => setDeleting(v)}>
                    <Trash2 size={13} /> Delete
                  </Button>
                </>
              )}
            </div>

            {openId === v.id && <VisualPreview visual={v} />}
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2.5 text-[10px] leading-relaxed text-ink-400">
        Only the redacted JPEG is stored — the original is deleted on intake. Verification and rejection are logged for
        the audit trail.
      </p>

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject this photo">
        <div className="space-y-3">
          <p className="text-xs text-ink-600">
            Rejecting <strong className="text-ink-800">{rejecting?.fileName}</strong> — give a reason between 3 and 500
            characters. The photo stays on the session for a human to re-check.
          </p>
          <label htmlFor="visual-reject-reason" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
            Reason
          </label>
          <textarea
            id="visual-reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Blurry photo — the area cannot be assessed; ask the patient to retake it."
            className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={reason.trim().length < 3 || reason.trim().length > 500}
              onClick={async () => {
                if (!rejecting) return
                const ok = await rejectVisual(rejecting.sessionId, rejecting.id, reason.trim())
                setRejecting(null)
                setNotice(ok ? `"${rejecting.fileName}" rejected.` : 'Your role cannot reject photos, or the reason was invalid.')
              }}
            >
              <XCircle size={13} /> Reject photo
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete this photo">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-600">
            Delete <strong className="text-ink-800">{deleting?.fileName}</strong> from this session? The stored redacted
            image is purged and the action is logged.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!deleting) return
                const ok = await deleteSessionVisual(deleting.sessionId, deleting.id)
                setDeleting(null)
                setNotice(ok ? `"${deleting.fileName}" deleted.` : 'Your role cannot delete photos.')
              }}
            >
              <Trash2 size={13} /> Delete photo
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
