import { Filter, ScrollText, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, cx, EmptyState, PageHeader } from '../components/ui'
import { AuditChainPanel } from '../components/audit/AuditChainPanel'
import { useAuth } from '../context/AuthContext'
import { permissionsFor } from '../services/rbacService'
import { useTriage } from '../context/TriageContext'
import { formatAuditTime } from '../lib/format'
import { useApp } from '../store/AppStore'

type RoleFilter = 'all' | 'Patient' | 'Nurse' | 'Doctor' | 'System'

const ROLE_CLASS: Record<string, string> = {
  Patient: 'bg-sky-50 text-sky-700 ring-sky-200',
  Nurse: 'bg-brand-50 text-brand-700 ring-brand-200',
  Doctor: 'bg-violet-50 text-violet-700 ring-violet-200',
  System: 'bg-ink-100 text-ink-600 ring-ink-200',
}

const TRIAGE_ROLE_CLASS: Record<string, string> = {
  nurse: 'bg-brand-50 text-brand-700 ring-brand-200',
  doctor: 'bg-violet-50 text-violet-700 ring-violet-200',
  admin: 'bg-ink-100 text-ink-600 ring-ink-200',
}

const CATEGORY_CLASS: Record<string, string> = {
  view: 'bg-sky-50 text-sky-700 ring-sky-200',
  edit: 'bg-violet-50 text-violet-700 ring-violet-200',
  decision: 'bg-brand-50 text-brand-700 ring-brand-200',
  export: 'bg-amber-50 text-amber-700 ring-amber-200',
  auth: 'bg-rose-50 text-rose-700 ring-rose-200',
  system: 'bg-ink-100 text-ink-600 ring-ink-200',
}

export default function AuditLogs() {
  const { audit, cases } = useApp()
  const { sessions, audit: triageLog } = useTriage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canViewChain = user ? permissionsFor(user.role).canViewAudit && user.role !== 'patient' : false
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  const list = useMemo(() => {
    let out = audit
    if (roleFilter !== 'all') out = out.filter((a) => a.role === roleFilter)
    if (q.trim()) {
      const needle = q.toLowerCase()
      out = out.filter((a) => a.action.toLowerCase().includes(needle) || a.actor.toLowerCase().includes(needle))
    }
    return out
  }, [audit, q, roleFilter])

  const filteredTriage = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const matches = needle
      ? triageLog.filter(
          (e) =>
            e.action.toLowerCase().includes(needle) ||
            e.actor.toLowerCase().includes(needle) ||
            e.detail.toLowerCase().includes(needle),
        )
      : triageLog
    return matches.slice(0, 40)
  }, [triageLog, q])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Traceability"
        title="Audit Logs"
        subtitle="Every major action is recorded — actor, action, timestamp, case. No unnecessary sensitive data is exposed."
      />
      {canViewChain && <AuditChainPanel />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actions / actors…"
            className="inp pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1 ring-1 ring-inset ring-ink-200/60">
          {(['all', 'Patient', 'Nurse', 'Doctor', 'System'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cx(
                'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all',
                roleFilter === r ? 'bg-white text-ink-900 shadow-sm ring-1 ring-inset ring-ink-200' : 'text-ink-500 hover:text-ink-800',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <button className="rounded-xl border border-ink-200 bg-white p-2 text-ink-500 transition-colors hover:bg-ink-50" title="Filter">
          <Filter size={15} />
        </button>
      </div>

      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="sf-table min-w-[760px]">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Case</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const c = cases.find((x) => x.id === e.caseId)
                return (
                  <tr key={e.id} onClick={() => navigate(`/app/cases/${e.caseId}`)} className="cursor-pointer">
                    <td className="whitespace-nowrap font-semibold text-ink-700">{e.time}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200">
                        {c?.patientId ?? e.caseId}
                      </span>
                    </td>
                    <td className="font-medium text-ink-700">{e.actor}</td>
                    <td>
                      <Badge className={ROLE_CLASS[e.role] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}>{e.role}</Badge>
                    </td>
                    <td className="text-xs text-ink-600">{e.action}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && (
            <EmptyState icon={<ScrollText size={20} />} title="No audit events match the filters" />
          )}
        </div>
      </Card>

      <Card
        title="Triage session log"
        subtitle="Non-diagnostic workflow events — consent, note review, overrides, escalations. Surrogate patient IDs only, never raw patient text."
        action={
          <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
            <ShieldCheck size={12} /> {triageLog.length} events
          </Badge>
        }
      >
        <div className="space-y-1.5">
          {filteredTriage.map((e) => {
            const session = sessions.find((s) => s.id === e.sessionId)
            return (
              <div
                key={e.id}
                className="grid gap-1 rounded-xl border border-ink-100 bg-ink-50/60 px-3.5 py-2.5 text-xs sm:grid-cols-[150px_130px_1fr]"
              >
                <span className="font-semibold text-ink-500">{formatAuditTime(e.at)}</span>
                <span className="font-mono font-bold text-ink-700">{session?.patientId ?? e.sessionId}</span>
                <span className="text-ink-700">
                  <span className="font-bold">{e.action}</span> · {e.actor} ·{' '}
                  <Badge className={TRIAGE_ROLE_CLASS[e.role] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}>{e.role}</Badge>{' '}
                  <Badge className={CATEGORY_CLASS[e.category] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}>
                    {e.category}
                  </Badge>
                  <span className="mt-0.5 block text-ink-500">{e.detail}</span>
                </span>
              </div>
            )
          })}
          {filteredTriage.length === 0 && (
            <EmptyState icon={<ShieldCheck size={20} />} title="No triage events match your search" />
          )}
        </div>
      </Card>
    </div>
  )
}
