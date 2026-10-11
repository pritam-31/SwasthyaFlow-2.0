import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Filter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, cx, EASE, EmptyState, PageHeader } from '../components/ui'
import { formatCompletenessLabel, reviewMeta, urgentMeta, urgencyOf } from '../lib/format'
import { useApp } from '../store/AppStore'

type Tab = 'all' | 'awaiting-nurse' | 'awaiting-doctor' | 'reviewed' | 'urgent'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'All cases' },
  { key: 'awaiting-nurse', label: 'Awaiting health-worker' },
  { key: 'awaiting-doctor', label: 'Awaiting doctor' },
  { key: 'urgent', label: 'Urgency signals' },
  { key: 'reviewed', label: 'Reviewed / closed' },
]

export default function TriageQueue() {
  const { cases, role } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    let out = cases
    if (tab === 'awaiting-nurse') out = out.filter((c) => c.reviewStatus === 'awaiting-nurse')
    if (tab === 'awaiting-doctor') out = out.filter((c) => c.reviewStatus === 'awaiting-doctor')
    if (tab === 'urgent') out = out.filter((c) => c.urgencySignals.length > 0)
    if (tab === 'reviewed') out = out.filter((c) => c.reviewStatus === 'reviewed' || c.reviewStatus === 'closed')
    if (q.trim()) {
      const needle = q.toLowerCase()
      out = out.filter(
        (c) =>
          c.patientId.toLowerCase().includes(needle) ||
          c.chiefConcern.toLowerCase().includes(needle) ||
          c.language.toLowerCase().includes(needle),
      )
    }
    const rank = { urgent: 0, prompt: 1, routine: 2 }
    return [...out].sort((a, b) => rank[urgencyOf(a)] - rank[urgencyOf(b)])
  }, [cases, tab, q])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow queue"
        title="Patient Triage Queue"
        subtitle="AI-prepares each case; a qualified healthcare worker keeps control. Urgency labels are workflow signals, not diagnoses."
      />
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const count =
                t.key === 'all'
                  ? cases.length
                  : t.key === 'awaiting-nurse'
                    ? cases.filter((c) => c.reviewStatus === 'awaiting-nurse').length
                    : t.key === 'awaiting-doctor'
                      ? cases.filter((c) => c.reviewStatus === 'awaiting-doctor').length
                      : t.key === 'urgent'
                        ? cases.filter((c) => c.urgencySignals.length > 0).length
                        : cases.filter((c) => c.reviewStatus === 'reviewed' || c.reviewStatus === 'closed').length
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cx(
                    'relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    tab === t.key ? 'text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {tab === t.key && (
                    <motion.span
                      layoutId="triage-tab"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="absolute inset-0 rounded-lg bg-brand-700"
                    />
                  )}
                  <span className="relative z-10">
                    {t.label} <span className="opacity-70">({count})</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search case / language…"
                className="w-full rounded-lg border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs text-ink-700 outline-none focus:border-brand-500"
              />
            </div>
            <button className="rounded-lg border border-ink-200 bg-white p-2 text-ink-500 hover:bg-ink-50" title="Filter">
              <Filter size={15} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-5 py-3 font-bold">Case</th>
                <th className="px-3 py-3 font-bold">Concern</th>
                <th className="px-3 py-3 font-bold">Urgency</th>
                <th className="px-3 py-3 font-bold">Completeness</th>
                <th className="px-3 py-3 font-bold">Language</th>
                <th className="px-3 py-3 font-bold">Reports</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              <AnimatePresence initial={false}>
                {list.map((c, i) => {
                  const urg = urgencyOf(c)
                  return (
                    <motion.tr
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -14 }}
                      transition={{ duration: 0.28, delay: 0.02 * Math.min(i, 8), ease: EASE }}
                      onClick={() => navigate(`/app/cases/${c.id}`)}
                      className="group cursor-pointer transition-colors hover:bg-brand-50/40"
                    >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cx(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold',
                            i % 4 === 0
                              ? 'bg-brand-100 text-brand-700'
                              : i % 4 === 1
                                ? 'bg-sky-100 text-sky-700'
                                : i % 4 === 2
                                  ? 'bg-violet-100 text-violet-700'
                                  : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {c.patientId.slice(-3)}
                        </div>
                        <div>
                          <p className="font-bold text-ink-800">{c.patientId}</p>
                          <p className="text-[11px] text-ink-400">{c.createdAt} · {c.reporter}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-3 py-3.5">
                      <p className="truncate text-[13px] text-ink-700">{c.chiefConcern}</p>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge className={urgentMeta[urg].classes}>
                        <span className={cx('h-1.5 w-1.5 rounded-full', urgentMeta[urg].dot)} />
                        {urgentMeta[urg].label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="w-24">
                        <p className="text-xs font-semibold text-ink-700">
                          {c.completeness}%{' '}
                          <span className="font-normal text-ink-400">({formatCompletenessLabel(c.completeness)})</span>
                        </p>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-100">
                          <div
                            className={cx(
                              'h-full rounded-full',
                              c.completeness >= 90 ? 'bg-emerald-500' : c.completeness >= 70 ? 'bg-brand-500' : 'bg-amber-400',
                            )}
                            style={{ width: `${c.completeness}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <Badge className="bg-white text-ink-600 ring-ink-200">{c.language}</Badge>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-ink-600">{c.reportIds.length}</td>
                    <td className="px-3 py-3.5">
                      <Badge className={reviewMeta[c.reviewStatus].classes}>{reviewMeta[c.reviewStatus].label}</Badge>
                    </td>
                    <td className="px-3 py-3.5">
                      <ChevronRight size={16} className="text-ink-300 transition-transform group-hover:translate-x-0.5" />
                    </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
          {list.length === 0 && (
            <EmptyState
              icon={<Search size={20} />}
              title="No cases in this view"
              hint="Try a different filter or create a new intake case."
            />
          )}
        </div>
        <div className="border-t border-ink-100 px-5 py-2.5 text-[11px] text-ink-500">
          {role === 'nurse' ? 'You can open a case, verify AI-extracted fields and escalate to the doctor.' : role === 'doctor' ? 'You can review source material, approve information and decide on referral. Referrals are only sent after your approval.' : 'Administrator view — read-only queue overview.'}
        </div>
      </Card>
    </div>
  )
}
