import { motion } from 'framer-motion'
import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, cx, EmptyState, PageHeader, Stagger, StaggerItem } from '../components/ui'
import { reviewMeta, urgencyOf, urgentMeta } from '../lib/format'
import { useApp } from '../store/AppStore'

export default function CasesPage() {
  const { cases } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    let out = cases
    if (q.trim()) {
      const needle = q.toLowerCase()
      out = out.filter(
        (c) =>
          c.patientId.toLowerCase().includes(needle) ||
          c.chiefConcern.toLowerCase().includes(needle) ||
          c.language.toLowerCase().includes(needle) ||
          c.mode.toLowerCase().includes(needle),
      )
    }
    return [...out].sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1))
  }, [cases, q])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Patient registry" title="Patients / Cases" subtitle="All synthetic cases across modes. RBAC: a patient could never see another patient's case." />
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search patient ID, concern, language…"
          className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" gap={0.05}>
        {list.map((c, i) => {
          const urg = urgencyOf(c)
          return (
            <StaggerItem key={c.id}>
              <motion.button
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                onClick={() => navigate(`/app/cases/${c.id}`)}
                className="group flex w-full flex-col rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-[var(--shadow-card)] hover:border-brand-300"
              >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold',
                      i % 3 === 0
                        ? 'bg-brand-100 text-brand-700'
                        : i % 3 === 1
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-violet-100 text-violet-700',
                    )}
                  >
                    {c.patientId.slice(-3)}
                  </div>
                  <p className="truncate text-sm font-bold text-ink-900">{c.patientId}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2.5 line-clamp-2 min-h-[36px] text-[13px] leading-relaxed text-ink-600">{c.chiefConcern}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge className={urgentMeta[urg].classes}>
                  <span className={cx('h-1.5 w-1.5 rounded-full', urgentMeta[urg].dot)} />
                  {urgentMeta[urg].label}
                </Badge>
                <Badge className="bg-white text-ink-500 ring-ink-200">{c.language}</Badge>
                <Badge className="bg-white text-ink-500 ring-ink-200">{c.mode}</Badge>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <Badge className={reviewMeta[c.reviewStatus].classes}>{reviewMeta[c.reviewStatus].label}</Badge>
                <span className="text-[11px] font-medium text-ink-400">{c.createdAt}</span>
              </div>
              </motion.button>
            </StaggerItem>
          )
        })}
      </Stagger>
      {list.length === 0 && (
        <EmptyState icon={<Search size={20} />} title="No cases match your search" />
      )}
    </div>
  )
}
