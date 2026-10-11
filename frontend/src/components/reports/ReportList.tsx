/**
 * Session report list — the reviewer workspace for a single session.
 *
 * Lists every stored report with expandable previews and (for doctor / admin)
 * verify / reject / delete actions. The merged cross-report table sits on top:
 * one row per measurement, latest report wins.
 */

import { CheckCircle2, FilePlus2, Layers, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTriage } from '../../context/TriageContext'
import { summarizeRedactions } from '../../lib/format'
import type { ExtractedReport, MergedReportView } from '../../types/report.types'
import { Badge, Button, Card, cx, EmptyState, Modal } from '../ui'
import ExtractedValuesTable from './ExtractedValuesTable'
import ReportPreview from './ReportPreview'

export default function ReportList({
  reports,
  merged,
}: {
  reports: ExtractedReport[]
  merged: MergedReportView | null
}) {
  const { permissions, verifyReport, rejectReport, deleteSessionReport } = useTriage()
  const [openId, setOpenId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<ExtractedReport | null>(null)
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState<ExtractedReport | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const canReview = permissions.canReviewReports

  if (reports.length === 0) {
    return (
      <Card title="Medical reports" subtitle="Uploaded PDFs and scans attached to this session.">
        <EmptyState
          icon={<FilePlus2 size={20} />}
          title="No reports on this session"
          hint="Upload a PDF, JPEG or PNG report — the backend reads it, strips identifiers and extracts values for human verification."
        />
      </Card>
    )
  }

  const pending = reports.filter((r) => r.status === 'pending-review').length

  return (
    <Card
      title="Medical reports"
      subtitle={`${reports.length} report(s)${pending > 0 ? ` · ${pending} awaiting verification` : ''} — extracted values are suggestions for a human.`}
      action={
        <Badge className="bg-ink-100 text-ink-600 ring-ink-200" icon={<Layers size={11} />}>
          {merged ? `${merged.labValues.length + merged.vitals.length} merged values` : 'no merged view'}
        </Badge>
      }
    >
      {notice && (
        <p role="status" className="mb-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
          {notice}
        </p>
      )}

      {merged && (merged.labValues.length > 0 || merged.vitals.length > 0) && (
        <section className="mb-4">
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
            Merged across reports · latest report wins
          </h4>
          <ExtractedValuesTable labValues={merged.labValues} vitals={merged.vitals} />
        </section>
      )}

      <div className="space-y-2.5">
        {reports.map((r) => (
          <div key={r.id} className="space-y-1.5">
            <div
              className={cx(
                'flex flex-wrap items-center gap-2 rounded-xl border p-1 pr-2 transition',
                openId === r.id ? 'border-brand-300 bg-brand-50/40' : 'border-ink-200 bg-white hover:border-ink-300',
              )}
            >
              <button
                type="button"
                onClick={() => setOpenId((id) => (id === r.id ? null : r.id))}
                className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left"
                aria-expanded={openId === r.id}
              >
                <span className="block truncate text-xs font-bold text-ink-800">{r.fileName}</span>
                <span className="block text-[11px] text-ink-400">
                  {r.status === 'pending-review'
                    ? 'Pending verification'
                    : r.status === 'verified'
                      ? `Verified · ${r.reviewedBy ?? 'peer'}`
                      : `Rejected · ${r.rejectionReason?.slice(0, 60) ?? 'no reason'}`}
                </span>
              </button>

              <span className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2 py-1 text-[10px] text-ink-500">
                {r.labValues.length + r.vitals.length} value(s) · {summarizeRedactions(r.anonymization).split(' · ')[0]}
              </span>

              {canReview && (
                <>
                  <Button
                    size="sm"
                    variant="success"
                    disabled={r.status !== 'pending-review'}
                    title={r.status === 'pending-review' ? 'Verify the extraction' : 'Already reviewed'}
                    onClick={async () => {
                      const ok = await verifyReport(r.sessionId, r.id)
                      setNotice(ok ? `"${r.fileName}" verified.` : 'Your role cannot verify reports.')
                    }}
                  >
                    <CheckCircle2 size={13} /> Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={r.status === 'rejected'}
                    aria-label={`Reject ${r.fileName}`}
                    onClick={() => {
                      setRejecting(r)
                      setReason(r.rejectionReason ?? '')
                    }}
                  >
                    <XCircle size={13} /> Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${r.fileName}`}
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 size={13} /> Delete
                  </Button>
                </>
              )}
            </div>

            {openId === r.id && <ReportPreview report={r} />}
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-ink-100 pt-2.5 text-[10px] leading-relaxed text-ink-400">
        Raw OCR text is never stored or shown — only anonymised, non-diagnostic text. Verification and rejection are
        logged for the audit trail.
      </p>

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject this extraction">
        <div className="space-y-3">
          <p className="text-xs text-ink-600">
            Rejecting <strong className="text-ink-800">{rejecting?.fileName}</strong> — give a reason between 3 and 500
            characters. The report stays on the session for a human to re-check.
          </p>
          <label htmlFor="reject-reason" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
            Reason
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. OCR read the wrong unit — values must be re-checked against the source document."
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
                const ok = await rejectReport(rejecting.sessionId, rejecting.id, reason.trim())
                setRejecting(null)
                setNotice(ok ? `"${rejecting.fileName}" rejected.` : 'Your role cannot reject reports, or the reason was invalid.')
              }}
            >
              <XCircle size={13} /> Reject extraction
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete this report">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-600">
            Delete <strong className="text-ink-800">{deleting?.fileName}</strong> from this session? Its extracted
            values are removed from the merged view and the action is logged.
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
                const ok = await deleteSessionReport(deleting.sessionId, deleting.id)
                setDeleting(null)
                setNotice(ok ? `"${deleting.fileName}" deleted.` : 'Your role cannot delete reports.')
              }}
            >
              <Trash2 size={13} /> Delete report
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}