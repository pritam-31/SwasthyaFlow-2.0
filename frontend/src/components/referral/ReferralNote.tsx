import { CheckCircle2, Printer, Send, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTriage } from '../../context/TriageContext'
import { NON_DIAGNOSTIC_DISCLAIMER_PDF } from '../../services/safetyPolicy'
import type { ReferralNote as ReferralNoteData } from '../../types/triage'
import { Button, cx, Modal } from '../ui'

const FACILITIES = [
  'Community Health Centre',
  'District Hospital (General Medicine)',
  'District Hospital (Specialist OPD)',
  'Medical College / Higher-Level Facility',
]

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c)

function rows(label: string, value: string): string {
  return `<tr><th>${esc(label)}</th><td>${esc(value).replace(/\n/g, '<br/>')}</td></tr>`
}

function buildPrintableHtml(note: ReferralNoteData, generatedAt: string): string {
  const body = [
    `<h1>Referral Note — ${esc(note.fromFacility)}</h1>`,
    `<p class="meta">Generated ${esc(generatedAt)} · Prepared by ${esc(note.preparedBy)} (${esc(note.preparedByRole)}) · Status: <strong>${esc(note.status)}</strong></p>`,
    '<table>',
    rows('Anonymized patient ID', note.patientId),
    rows('Referred to', note.toFacility),
    rows('Review priority (workflow label, not a diagnosis)', note.urgency),
    rows('Reason for referral', note.reasonForReferral),
    rows('Organised summary', note.summary),
    rows('Information still missing', note.missingInformation.join('; ') || 'None recorded'),
    rows('Open questions for the receiving clinician', note.openQuestions.join('\n') || 'None recorded'),
    rows('Approved by', note.approvedBy ?? 'Awaiting doctor approval'),
    '</table>',
    `<p class="disclaimer">${esc(NON_DIAGNOSTIC_DISCLAIMER_PDF)}</p>`,
  ].join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Referral ${esc(note.patientId)}</title>
<style>
  body{font-family:Inter,Arial,sans-serif;color:#141c2b;margin:32px;line-height:1.5}
  h1{font-size:18px;margin:0 0 4px}
  .meta{font-size:11px;color:#64748a;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #e1e7ee;padding:8px 10px;vertical-align:top;text-align:left}
  th{width:34%;background:#f7f9fb;font-weight:700}
  .disclaimer{margin-top:18px;font-size:10px;color:#b45309;border:1px solid #fcd34d;background:#fffbeb;padding:10px}
</style></head><body>${body}</body></html>`
}

function openPrintWindow(html: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  win.setTimeout(() => win.print(), 350)
  return true
}

/**
 * Referral note generator + printable PDF-style sheet.
 * A referral is always a human-authored draft: the system only assembles the
 * information a receiving clinician needs.
 */
export function ReferralGenerator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeSession, escalateSession, approveReferral, permissions, role } = useTriage()
  const [facility, setFacility] = useState(FACILITIES[0])
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  if (!activeSession) return null
  const note = activeSession.referral

  const generate = async () => {
    const ok = await escalateSession(activeSession.id, facility, reason)
    setNotice(ok ? null : 'Your current role cannot create a referral note.')
  }

  const print = () => {
    if (!note) return
    const ok = openPrintWindow(buildPrintableHtml(note, new Date().toLocaleString('en-IN')))
    setNotice(ok ? null : 'Pop-ups are blocked — allow pop-ups to print the referral note.')
  }

  return (
    <Modal open={open} onClose={onClose} title="Referral to a higher-level facility" wide>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-500">
          The system assembles the organised note, urgency signals and open questions. It never decides the
          destination and never sends anything on its own — a qualified healthcare worker owns this step.
        </p>

        {!note ? (
          <div className="space-y-3 rounded-xl border border-ink-200 p-4">
            <div>
              <label htmlFor="ref-facility" className="mb-1.5 block text-xs font-bold text-ink-700">
                Referred to
              </label>
              <select
                id="ref-facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="inp min-h-[40px]"
              >
                {FACILITIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ref-reason" className="mb-1.5 block text-xs font-bold text-ink-700">
                Reason for referral (written by the reviewer)
              </label>
              <textarea
                id="ref-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what the receiving clinician should assess — observations only, no diagnosis."
                className="w-full rounded-xl border border-ink-200 bg-white p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
              />
            </div>
            <Button className="w-full" onClick={generate} disabled={!permissions.canDraftReferral}>
              <Send size={15} /> Generate referral note (draft)
            </Button>
            {!permissions.canDraftReferral && (
              <p className="text-[11px] font-semibold text-amber-700">
                The {role} role has read-only access to referrals.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <article className="rounded-xl border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)]">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 pb-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-700">
                    Referral note · {note.status === 'approved' ? 'Approved' : 'Draft'}
                  </p>
                  <h3 className="text-base font-extrabold tracking-tight text-ink-900">{note.fromFacility}</h3>
                  <p className="text-xs text-ink-500">→ {note.toFacility}</p>
                </div>
                <div className="text-right text-[11px] text-ink-500">
                  <p className="font-mono font-bold text-ink-800">{note.patientId}</p>
                  <p>{new Date(note.generatedAt).toLocaleString('en-IN')}</p>
                </div>
              </header>

              <dl className="mt-3 space-y-2.5 text-xs">
                <ReferralRow label="Review priority" value={`${note.urgency} (workflow label, not a diagnosis)`} />
                <ReferralRow label="Reason for referral" value={note.reasonForReferral} />
                <ReferralRow label="Organised summary" value={note.summary} />
                <ReferralRow label="Information still missing" value={note.missingInformation.join(' · ') || 'None recorded'} />
                <ReferralRow label="Open questions" value={note.openQuestions.map((q) => `• ${q}`).join('\n') || 'None recorded'} />
                <ReferralRow label="Prepared by" value={`${note.preparedBy} · ${note.preparedByRole}`} />
                <ReferralRow label="Approved by" value={note.approvedBy ?? 'Awaiting doctor approval'} />
              </dl>

              <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                {NON_DIAGNOSTIC_DISCLAIMER_PDF}
              </p>
            </article>

            {notice && (
              <p role="alert" className="text-xs font-semibold text-rose-600">
                {notice}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={print}>
                <Printer size={15} /> Print / save as PDF
              </Button>
              {note.status === 'draft' && (
                <Button
                  variant="success"
                  disabled={!permissions.canApproveReferral}
                  title={permissions.canApproveReferral ? 'Approve for hand-off' : 'Doctor approval required'}
                  onClick={async () => {
                    const ok = await approveReferral(activeSession.id)
                    setNotice(ok ? null : 'Only a doctor can approve a referral.')
                  }}
                >
                  <CheckCircle2 size={15} /> Approve & release
                </Button>
              )}
              {note.status === 'approved' && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <ShieldCheck size={14} /> Approved by {note.approvedBy}
                </span>
              )}
            </div>
            {note.status === 'draft' && !permissions.canApproveReferral && (
              <p className="text-[11px] text-ink-400">
                Draft saved. A doctor must approve it before it is sent to {note.toFacility}.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function ReferralRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-ink-100 pb-2 sm:grid-cols-[170px_1fr] sm:gap-3">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={cx('whitespace-pre-line text-ink-700')}>{value}</dd>
    </div>
  )
}
