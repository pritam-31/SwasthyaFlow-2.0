import { motion } from 'framer-motion'
import { Box, Typography } from '@mui/material'
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
import { AppDataGrid, StatusPill, UrgencyPill, type ToneKey } from '../components/AppDataGrid'
import { Badge, Button, Card, cx, EASE, EmptyState, KpiTile, PageHeader, ProgressBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { getDisplayName } from '../lib/displayName'
import { reviewMeta, urgencyOf, urgentMeta } from '../lib/format'
import { roleCounts, visibleCasesForRole } from '../lib/roleData'
import { CAMPS, useApp } from '../store/AppStore'
import type { CaseRecord, Role } from '../types'

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

/* --- Shared cards ------------------------------------------------------ */

function PipelineCard({ cases }: { cases: CaseRecord[] }) {
  const navigate = useNavigate()
  const total = cases.length
  const awaitingNurse = cases.filter((c) => c.reviewStatus === 'awaiting-nurse').length
  const awaitingDoctor = cases.filter((c) => c.reviewStatus === 'awaiting-doctor').length
  const reviewed = cases.filter((c) => c.reviewStatus === 'reviewed').length
  const closed = cases.filter((c) => c.reviewStatus === 'closed').length
  return (
    <Card title="Triage pipeline" subtitle="Case distribution by review stage" className="lg:col-span-2">
      <div className="space-y-4">
        <StatusRow label="Awaiting health-worker review" count={awaitingNurse} total={total} tone="brand" />
        <StatusRow label="Awaiting doctor review" count={awaitingDoctor} total={total} tone="violet" />
        <StatusRow label="Reviewed" count={reviewed} total={total} tone="sky" />
        <StatusRow label="Closed" count={closed} total={total} tone="emerald" />
      </div>
      <button
        type="button"
        onClick={() => navigate('/app/triage')}
        className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 transition-colors hover:text-brand-900"
      >
        Open triage queue <ArrowRight size={13} />
      </button>
    </Card>
  )
}

function NeedsAttentionCard({ cases }: { cases: CaseRecord[] }) {
  const navigate = useNavigate()
  const urgent = cases.filter((c) => c.urgencySignals.length > 0)
  return (
    <Card title="Needs attention" subtitle="Cases with active urgency signals">
      {urgent.length === 0 ? (
        <EmptyState icon={<Sparkles size={18} />} title="No urgency signals" hint="Anything flagged will appear here." />
      ) : (
        <ul className="space-y-1">
          {urgent.slice(0, 4).map((c) => (
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
  )
}

function RecentCasesCard({ cases }: { cases: CaseRecord[] }) {
  const navigate = useNavigate()
  const recent = [...cases].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6)
  const reviewTone: Record<string, ToneKey> = {
    'awaiting-nurse': 'amber',
    'awaiting-doctor': 'violet',
    reviewed: 'sky',
    closed: 'emerald',
  }
  return (
    <Card title="Recent cases" subtitle="Latest intake across all modes" className="lg:col-span-2" pad={false}>
      <AppDataGrid<CaseRecord>
        rows={recent}
        ariaLabel="Recent cases"
        storageKey="dashboard-recent-cases"
        getRowId={(c) => c.id}
        hideToolbar
        defaultDensity="compact"
        onRowClick={(c) => navigate(`/app/cases/${c.id}`)}
        columns={[
          {
            field: 'patientId',
            headerName: 'Case',
            width: 150,
            renderCell: (p) => (
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>{p.row.patientId}</Typography>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                  {p.row.createdAt} · {p.row.mode}
                </Typography>
              </Box>
            ),
          },
          {
            field: 'chiefConcern',
            headerName: 'Concern',
            flex: 1,
            minWidth: 220,
            renderCell: (p) => <span className="line-clamp-2 text-[13px] text-ink-600">{p.row.chiefConcern}</span>,
          },
          {
            field: 'urgency',
            headerName: 'Urgency',
            width: 120,
            renderCell: (p) => <UrgencyPill level={urgencyOf(p.row)} />,
          },
          {
            field: 'reviewStatus',
            headerName: 'Status',
            width: 150,
            renderCell: (p) => (
              <StatusPill tone={reviewTone[p.row.reviewStatus] ?? 'ink'}>
                {reviewMeta[p.row.reviewStatus].label}
              </StatusPill>
            ),
          },
          {
            field: 'actions',
            headerName: '',
            width: 48,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            renderCell: () => <ArrowRight size={15} className="text-ink-300" />,
          },
        ]}
      />
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
  )
}

function QuickActionsCard({ counts, role }: { counts: { open: number; pendingReferrals: number }; role: Role }) {
  const navigate = useNavigate()
  const actions: { to: string; icon: React.ReactNode; title: string; hint: string }[] = []
  if (role !== 'patient') {
    actions.push(
      { to: '/app/new-intake', icon: <PlusCircle size={16} />, title: 'New patient intake', hint: 'Voice, text or report' },
      { to: '/app/triage', icon: <ListTodo size={16} />, title: 'Triage queue', hint: `${counts.open} waiting on staff` },
      { to: '/app/referrals', icon: <ClipboardList size={16} />, title: 'Referrals', hint: `${counts.pendingReferrals} pending approval` },
      { to: '/app/reports', icon: <FileText size={16} />, title: 'Reports', hint: 'OCR + verification' },
    )
  } else {
    actions.push({ to: '/app/new-intake', icon: <PlusCircle size={16} />, title: 'Report a health concern', hint: 'New patient intake' })
    actions.push({ to: '/app/cases', icon: <FileText size={16} />, title: 'My intake records', hint: 'Track status' })
    actions.push({ to: '/app/followups', icon: <CalendarClock size={16} />, title: 'My follow-ups', hint: 'Next review' })
  }
  return (
    <Card title="Quick actions" subtitle="Common tasks and shortcuts">
      <div className="space-y-1.5">
        {actions.map((a) => (
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
    </Card>
  )
}

function CampsCard() {
  const navigate = useNavigate()
  return (
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
  )
}

function ActivityCard({ enabled }: { enabled: boolean }) {
  const { audit } = useApp()
  const navigate = useNavigate()
  return (
    <Card
      title="Recent activity"
      subtitle="Latest audit-trail entries"
      className="lg:col-span-2"
      pad={false}
      action={
        enabled ? (
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
        {audit.slice(0, 7).map((e, i) => (
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
  )
}

/* --- Role-scoped panes -------------------------------------------------- */

function PatientPane({ myCases }: { myCases: CaseRecord[] }) {
  const navigate = useNavigate()
  const counts = roleCounts(myCases)
  const nextFollowUp = myCases.find((c) => c.reviewStatus === 'awaiting-nurse' || c.reviewStatus === 'awaiting-doctor')
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="My intakes" value={counts.total} tone="brand" icon={<FileText size={20} />} hint="all time" />
        <KpiTile label="Being reviewed" value={counts.open} tone="amber" icon={<ListTodo size={20} />} hint="healthcare worker" />
        <KpiTile label="Reviewed" value={counts.reviewed} tone="sky" icon={<Stethoscope size={20} />} hint="by staff" />
        <KpiTile label="Closed" value={counts.closed} tone="emerald" icon={<Sparkles size={20} />} hint="resolved" />
      </div>

      <Card
        title="Your recent intakes"
        subtitle="How each health concern is progressing"
        action={
          <Button size="sm" onClick={() => navigate('/app/new-intake')}>
            <PlusCircle size={14} /> Report new concern
          </Button>
        }
      >
        {myCases.length === 0 ? (
          <EmptyState
            icon={<PlusCircle size={18} />}
            title="No intakes yet"
            hint="Use “Report a health concern” to start. A qualified healthcare worker reviews every entry."
          />
        ) : (
          <ul className="space-y-1">
            {myCases.slice(0, 5).map((c) => (
              <li key={c.id}>
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  onClick={() => navigate(`/app/cases/${c.id}`)}
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-ink-100"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink-800">{c.patientId}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-500">{c.chiefConcern}</span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">{c.createdAt}</span>
                  </span>
                  <span className="shrink-0">
                    <Badge className={reviewMeta[c.reviewStatus].classes}>{reviewMeta[c.reviewStatus].label}</Badge>
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
                </motion.button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {nextFollowUp && (
        <Card accent="border border-brand-200/80 bg-brand-50/50" title="Next follow-up">
          <p className="text-xs leading-relaxed text-ink-600">
            A healthcare worker is reviewing <span className="font-bold text-ink-900">{nextFollowUp.patientId}</span>. You can see
            timestamps, completed checks and any questions asked. Nothing on this app provides a diagnosis — staff decide
            your care.
          </p>
        </Card>
      )}
    </div>
  )
}

function StaffPane({ role, cases }: { role: Role; cases: CaseRecord[] }) {
  const counts = roleCounts(cases)
  const isDoctor = role === 'doctor'

  const kpi = isDoctor
    ? [
        { label: 'Awaiting your approval', value: counts.awaitingDoctor, tone: 'amber' as const, icon: <ListTodo size={20} />, hint: 'cases for you' },
        { label: 'After-nurse queue', value: counts.awaitingNurse, tone: 'brand' as const, icon: <Users size={20} />, hint: 'still with nurse' },
        { label: 'Urgent open', value: counts.overdue, tone: 'rose' as const, icon: <AlertTriangle size={20} />, hint: 'need attention' },
        { label: 'Referrals pending', value: counts.pendingReferrals, tone: 'sky' as const, icon: <ClipboardList size={20} />, hint: 'awaiting approval' },
      ]
    : [
        { label: 'Drafts to verify', value: counts.awaitingNurse, tone: 'brand' as const, icon: <ListTodo size={20} />, hint: 'awaiting health worker' },
        { label: 'Awaiting doctor', value: counts.awaitingDoctor, tone: 'violet' as const, icon: <Stethoscope size={20} />, hint: 'escalated' },
        { label: 'Urgent open', value: counts.overdue, tone: 'rose' as const, icon: <AlertTriangle size={20} />, hint: 'need attention' },
        { label: 'Referrals pending', value: counts.pendingReferrals, tone: 'sky' as const, icon: <ClipboardList size={20} />, hint: 'awaiting doctor' },
      ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpi.map((k) => (
          <KpiTile key={k.label} label={k.label} value={k.value} tone={k.tone} icon={k.icon} hint={k.hint} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PipelineCard cases={cases} />
        <NeedsAttentionCard cases={cases} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentCasesCard cases={cases} />
        <QuickActionsCard counts={counts} role={role} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityCard enabled={role === 'admin' || role === 'system-admin' || role === 'facility-admin'} />
        <CampsCard />
      </div>
    </div>
  )
}

/* --- Page --------------------------------------------------------------- */

export default function Dashboard() {
  const { role, cases } = useApp()
  const { user: authUser } = useAuth()
  const navigate = useNavigate()
  const [demoOpen, setDemoOpen] = useState(false)
  const name = getDisplayName(authUser?.displayName, (authUser as { firstName?: string } | null)?.firstName)

  const mine = useMemo(() => visibleCasesForRole(role, cases), [role, cases])
  const visible = mine

  const isPatient = role === 'patient'
  const eyebrow = isPatient ? 'My health records' : 'Facility overview'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={isPatient ? `Your care, ${name}` : 'Operations Dashboard'}
        subtitle={
          isPatient
            ? 'This app organises your health information and flags workflow signals for qualified staff — it never diagnoses or prescribes.'
            : 'AI organizes every case and flags workflow signals — a qualified healthcare professional stays in control of every decision.'
        }
        icon={<Stethoscope size={20} />}
        action={
          <>
            {!isPatient && (
              <>
                <Button variant="secondary" onClick={() => setDemoOpen(true)}>
                  <Play size={14} /> Preview AI intake
                </Button>
                <Button variant="secondary" onClick={() => navigate('/app/new-intake')}>
                  <PlusCircle size={15} /> New patient intake
                </Button>
              </>
            )}
          </>
        }
      />

      {isPatient ? <PatientPane myCases={mine} /> : <StaffPane role={role} cases={visible} />}

      <DemoRunner open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  )
}