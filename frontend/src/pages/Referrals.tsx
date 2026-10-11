import { Building2, CheckCircle2, ChevronRight, ClipboardList, Download, ShieldCheck, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, cx, KpiTile, Modal, PageHeader } from '../components/ui'
import { useApp } from '../store/AppStore'

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'pending-approval': 'bg-amber-50 text-amber-700 ring-amber-200',
  draft: 'bg-ink-100 text-ink-600 ring-ink-200',
}

export default function ReferralsPage() {
  const { cases, role, pushToast, approveReferral, patchReferral } = useApp()
  const navigate = useNavigate()
  const [approveId, setApproveId] = useState<string | null>(null)

  const referrals = useMemo(
    () =>
      cases
        .filter((c) => c.referral)
        .map((c) => ({ c, ref: c.referral! }))
        .sort((a, b) => (a.ref.status === 'approved' ? 1 : -1) - (b.ref.status === 'approved' ? 1 : -1)),
    [cases],
  )

  const pending = referrals.filter((x) => x.ref.status === 'pending-approval' || x.ref.status === 'draft').length
  const approved = referrals.filter((x) => x.ref.status === 'approved').length

  const approveTarget = approveId ? referrals.find((x) => x.c.id === approveId) : null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Care pathways"
        title="Referrals"
        subtitle="AI prepares the referral draft. A qualified doctor/medical officer approves before anything is sent."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile label="Drafts awaiting approval" value={pending} tone="amber" icon={<ClipboardList size={20} />} hint="doctor action needed" />
        <KpiTile label="Approved & handed off" value={approved} tone="emerald" icon={<CheckCircle2 size={20} />} hint="packet ready" />
        <KpiTile label="Human-approval gate" value="On" tone="sky" icon={<UserCheck size={20} />} hint="always required" />
      </div>

      <div className="space-y-3">
        {referrals.map(({ c, ref }) => {
          const done = ref.checklist.filter((cl) => cl.done).length
          return (
            <Card key={c.id} className="sf-card-hover hover:border-brand-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button onClick={() => navigate(`/app/cases/${c.id}`)} className="group flex min-w-0 items-start gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-extrabold text-white shadow-md shadow-brand-900/20">
                    {c.patientId.slice(-3)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-ink-900 group-hover:text-brand-800">{c.patientId}</span>
                      <Badge className={STATUS_BADGE[ref.status]}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {ref.status.replace('-', ' ')}
                      </Badge>
                    </span>
                    <span className="mt-1 block max-w-md text-[13px] leading-relaxed text-ink-600">{c.chiefConcern}</span>
                  </span>
                </button>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-ink-600">
                  <Building2 size={13} className="text-brand-600" />
                  {ref.targetFacility ?? 'Destination not selected'}
                </span>
              </div>

              <div className="mt-4 rounded-xl bg-ink-50/70 p-3.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-ink-500">
                  <span>Hand-off checklist</span>
                  <span className="text-brand-700">
                    {done}/{ref.checklist.length} ready
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {ref.checklist.map((cl) => (
                    <span
                      key={cl.label}
                      className={cx(
                        'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs',
                        cl.done ? 'text-ink-700' : 'text-ink-400',
                      )}
                    >
                      {cl.done ? (
                        <CheckCircle2 size={13} className="text-emerald-500" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full border-2 border-ink-300" />
                      )}
                      {cl.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {role === 'doctor' && ref.status !== 'approved' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={ref.targetFacility ?? ''}
                      onChange={(e) => patchReferral(c.id, { targetFacility: e.target.value })}
                      className="inp !w-auto !py-1.5 text-xs"
                    >
                      <option value="" disabled>
                        Select destination…
                      </option>
                      {ref.destinationOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="success" onClick={() => setApproveId(c.id)}>
                      <ShieldCheck size={13} /> Approve
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {ref.approvedBy && (
                    <span className="text-[11px] font-medium text-ink-400">
                      Approved by <strong className="text-ink-600">{ref.approvedBy}</strong> · {ref.approvedAt}
                    </span>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/app/cases/${c.id}`)}>
                    <Download size={13} /> Open case <ChevronRight size={13} className="text-ink-300" />
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
        {referrals.length === 0 && <Card><p className="text-sm text-ink-500">No referrals yet. Create one from a case page.</p></Card>}
      </div>

      <Modal open={!!approveId} onClose={() => setApproveId(null)} title="Confirm referral approval">
        {approveTarget && (
          <div className="space-y-3 text-sm">
            <p>
              Approving the referral for <strong>{approveTarget.c.patientId}</strong> to{' '}
              <strong>{approveTarget.ref.targetFacility ?? 'the selected destination'}</strong>.
            </p>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {approveTarget.ref.reason}
              {approveTarget.ref.reviewerNotes ? ` · ${approveTarget.ref.reviewerNotes}` : ''}
            </p>
            <p className="text-[11px] text-ink-400">
              Approval authorizes staff to hand the case packet to the destination facility. No autonomous submission.
            </p>
            <Button
              variant="success"
              className="w-full"
              onClick={() => {
                approveReferral(approveTarget.c.id, 'Dr. A. Mehta')
                pushToast('success', 'Referral approved — case packet marked for hand-off.')
                setApproveId(null)
              }}
            >
              <ShieldCheck size={15} /> Confirm approval
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setApproveId(null)}>
              Cancel
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
