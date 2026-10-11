import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FileText,
  ListTodo,
  Play,
  PlusCircle,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DemoRunner } from '../components/DemoRunner'
import { Badge, Button, Card, cx, EASE, EmptyState, KpiTile, PageHeader, ProgressBar } from '../components/ui'
import { reviewMeta, urgencyOf, urgentMeta } from '../lib/format'
import { CAMPS, useApp } from '../store/AppStore'

function StatusRow({
  label,
  count,
  total,
  tone,
}: {
  label: string
  count: number
  total: number
  tone: 'brand' | 'violet' | 'sky' | 'emerald' | 'amber'
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-700">{label}</p>
        <span className="text-xs font-bold tabular-nums text-ink-500">
          {count}
          <span className="ml-1 font-medium text-ink-400">· {pct}%</span>
        </span>
      </div>
      <ProgressBar value={pct} tone={tone} />
    </div>
  )
}

export default function Dashboard() {
  const { cases, audit, role } = useApp()
  const navigate = useNavigate()
  const [demoOpen, setDemoOpen] = useState(false)

  const stats = useMemo(() => {
    const total = cases.length
    const awaitingNurse = cases.filter((c) => c.reviewStatus === 'awaiting-nurse').length
    const awaitingDoctor = cases.filter((c) => c.reviewStatus === 'awaiting-doctor').length
    const reviewed = cases.filter((c) => c.reviewStatus === 'reviewed').length
    const closed = cases.filter((c) => c.reviewStatus === 'closed').length
    const urgentCases = cases.filter((c) => c.urgencySignals.length > 0)
    const pendingReferrals = cases.filter(
      (c) => c.referral && (c.referral.status === 'draft' || c.referral.status === 'pending-approval'),
    ).length
    return {
      total,
      awaitingNurse,
      awaitingDoctor,
      reviewed,
      closed,
      active: total - closed,
      pendingReview: awaitingNurse + awaitingDoctor,
      urgentCount: urgentCases.length,
      urgentCases,
      pendingReferrals,
    }
  }, [cases])

  const recent = useMemo(
    () => [...cases].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6),
    [cases],
  )

  const activity = audit.slice(0, 7)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Facility overview"
        title="Operations Dashboard"
        subtitle="AI organizes every case and flags workflow signals — a qualified healthcare professional stays in control of every decision."
        icon={<Stethoscope size={20} />}
        action={
          <>
            <Button onClick={() => setDemoOpen(true)}>
              <Play size={14} /> Preview AI intake
            </Button>
            <Button variant="secondary" onClick={() => navigate('/app/intake')}>
              <PlusCircle size={15} /> New patient intake
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active cases" value={stats.active} tone="brand" icon={<Users size={20} />} hint={`${stats.total} total in registry`} />
        <KpiTile label="Awaiting review" value={stats.pendingReview} tone="amber" icon={<ListTodo size={20} />} hint="queue for staff" />
        <KpiTile label="Urgency signals" value={stats.urgentCount} tone="rose" icon={<AlertTriangle size={20} />} hint="need attention now" />
        <KpiTile label="Referrals pending" value={stats.pendingReferrals} tone="sky" icon={<ClipboardList size={20} />} hint="awaiting doctor approval" />
      </div>

      {/* Row 2 — pipeline + attention */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Triage pipeline"
          subtitle="Case distribution by review stage"
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <StatusRow label="Awaiting health-worker review" count={stats.awaitingNurse} total={stats.total} tone="brand" />
            <StatusRow label="Awaiting doctor review" count={stats.awaitingDoctor} total={stats.total} tone="violet" />
            <StatusRow label="Reviewed" count={stats.reviewed} total={stats.total} tone="sky" />
            <StatusRow label="Closed" count={stats.closed} total={stats.total} tone="emerald" />
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/triage')}
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 transition-colors hover:text-brand-900"
          >
            Open triage queue <ArrowRight size={13} />
          </button>
          <div className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-600">
            {role === 'doctor' ? (
              <>
                <span className="font-extrabold text-ink-900">{stats.awaitingDoctor} case{stats.awaitingDoctor === 1 ? '' : 's'}</span>{' '}
                await your review. Referrals are only sent after a doctor approves the packet.
              </>
            ) : (
              <>
                <span className="font-extrabold text-ink-900">{stats.awaitingNurse} case{stats.awaitingNurse === 1 ? '' : 's'}</span>{' '}
                await verification of AI-extracted fields before escalating to the doctor.
              </>
            )}
          </div>
        </Card>

        <Card title="Needs attention" subtitle="Cases with active urgency signals">
          {stats.urgentCases.length === 0 ? (
            <EmptyState icon={<Sparkles size={18} />} title="No urgency signals" hint="Anything flagged will appear here." />
          ) : (
            <ul className="space-y-1">
              {stats.urgentCases.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    onClick={() => navigate(`/app/cases/${c.id}`)}
                    className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-rose-50/60"
                  >
                    <span
                      className={cx(
                        'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold',
                        c.urgencySignals.some((s) => s.level === 'urgent')
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {c.patientId.slice(-3)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-ink-800">{c.patientId}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-500">{c.chiefConcern}</span>
                    </span>
                    <span className="shrink-0">
                      <Badge className={urgentMeta[urgencyOf(c)].classes}>{urgentMeta[urgencyOf(c)].label}</Badge>
                    </span>
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Row 3 — recent cases + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recent cases" subtitle="Latest intake across all modes" className="lg:col-span-2" pad={false}>
          <div className="overflow-x-auto">
            <table className="sf-table min-w-[680px]">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Concern</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => {
                  const urg = urgencyOf(c)
                  return (
                    <tr key={c.id} onClick={() => navigate(`/app/cases/${c.id}`)} className="cursor-pointer">
                      <td>
                        <p className="text-[13px] font-bold text-ink-800">{c.patientId}</p>
                        <p className="text-[11px] text-ink-400">{c.createdAt} · {c.language}</p>
                      </td>
                      <td className="max-w-[240px]">
                        <p className="truncate text-[13px] text-ink-600">{c.chiefConcern}</p>
                      </td>
                      <td>
                        <Badge className={urgentMeta[urg].classes}>
                          <span className={cx('h-1.5 w-1.5 rounded-full', urgentMeta[urg].dot)} />
                          {urgentMeta[urg].label}
                        </Badge>
                      </td>
                      <td>
                        <Badge className={reviewMeta[c.reviewStatus].classes}>{reviewMeta[c.reviewStatus].label}</Badge>
                      </td>
                      <td>
                        <ArrowRight size={15} className="text-ink-300 transition-transform group-hover:translate-x-0.5" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-100 px-5 py-3">
            <button
              type="button"
              onClick={() => navigate('/app/cases')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 transition-colors hover:text-brand-900"
            >
              View all patients <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        <Card title="Quick actions" subtitle="Common tasks and shortcuts">
          <div className="space-y-1.5">
            {[
              { to: '/app/intake', icon: <PlusCircle size={16} />, title: 'New patient intake', hint: 'Voice, text or report' },
              { to: '/app/triage', icon: <ListTodo size={16} />, title: 'Triage queue', hint: `${stats.pendingReview} waiting on staff` },
              { to: '/app/referrals', icon: <ClipboardList size={16} />, title: 'Referrals', hint: `${stats.pendingReferrals} pending approval` },
              { to: '/app/reports', icon: <FileText size={16} />, title: 'Reports', hint: 'OCR + verification' },
            ].map((a) => (
              <button
                key={a.to}
                type="button"
                onClick={() => navigate(a.to)}
                className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-ink-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white">
                  {a.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-ink-800">{a.title}</span>
                  <span className="block truncate text-[10px] text-ink-400">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2.5 text-xs font-bold text-brand-800 transition-colors hover:bg-brand-50"
          >
            <Play size={13} /> Watch the end-to-end AI intake demo
          </button>
        </Card>
      </div>

      {/* Row 4 — activity + camps */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Recent activity"
          subtitle="Latest audit-trail entries"
          className="lg:col-span-2"
          pad={false}
          action={
            role === 'admin' ? (
              <button
                type="button"
                onClick={() => navigate('/app/audit')}
                className="inline-flex items-center gap-1 text-xs font-bold text-ink-500 transition-colors hover:text-ink-900"
              >
                View audit log <ArrowRight size={12} />
              </button>
            ) : undefined
          }
        >
          <ul className="divide-y divide-ink-100">
            {activity.map((e, i) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/app/cases/${e.caseId}`)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-ink-50/60"
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      e.role === 'System' ? 'bg-ink-100 text-ink-500' : e.role === 'Doctor' ? 'bg-violet-100 text-violet-600' : 'bg-brand-100 text-brand-700',
                    )}
                  >
                    {e.role === 'System' ? <Sparkles size={13} /> : e.role === 'Doctor' ? <Stethoscope size={13} /> : <Users size={13} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink-700">{e.action}</span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">
                      {e.actor} {i === 0 ? '· just now' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-400">{e.time}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-100 px-5 py-2.5 text-[11px] text-ink-400">
            Every action in the workflow is recorded for audit.
          </div>
        </Card>

        <Card title="Health camps" subtitle="Screening & referral status" pad={false}>
          <ul className="divide-y divide-ink-100">
            {CAMPS.slice(0, 3).map((camp) => {
              const pct = camp.screened > 0 ? Math.round((camp.reviewed / camp.screened) * 100) : 0
              return (
                <li key={camp.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-ink-800">{camp.campName}</p>
                    <span className="shrink-0 text-[10px] font-semibold text-ink-400">{camp.screened} screened</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar value={pct} tone="brand" />
                    <span className="shrink-0 text-[10px] font-semibold tabular-nums text-ink-500">{pct}% reviewed</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] font-medium text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{camp.pendingReview} pending</Badge>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">{camp.referred} referred</Badge>
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 text-ink-400">
                      <CalendarClock size={11} /> {camp.date.slice(5)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-ink-100 px-5 py-3">
            <button
              type="button"
              onClick={() => navigate('/app/camps')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 transition-colors hover:text-brand-900"
            >
              All camps <ArrowRight size={13} />
            </button>
          </div>
        </Card>
      </div>

      <DemoRunner open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  )
}
