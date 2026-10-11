import { MonitorSmartphone, RefreshCw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, EmptyState } from '../ui'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { AccountSession } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'
import { useSessionTimer } from '../../hooks/useSessionTimer'

type Lang = 'en' | 'hi' | 'or'
type T = (typeof SECURITY_SECTION_LABELS)[Lang]

/** Live access sessions for the signed-in account. */
export function SessionList({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [sessions, setSessions] = useState<AccountSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    securityApi
      .fetchSessions()
      .then((s) => {
        setSessions(s)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t.sessionRevoked))
  }, [t])

  useEffect(refresh, [refresh])

  const revoke = async (id: string) => {
    try {
      await securityApi.revokeSession(id)
      pushToast('success', t.sessionRevoked)
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.sessionRevoked)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-500">{!sessions ? 'Loading…' : sessions.length === 0 ? t.noSessions : t.sessionsSubtitle}</p>
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Reload">
          <RefreshCw size={13} />
        </Button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>}
      {sessions && sessions.length === 0 && <EmptyState icon={<MonitorSmartphone size={18} />} title={t.noSessions} />}
      {sessions && sessions.length > 0 && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5 font-bold">Device / address</th>
                <th className="px-3 py-2.5 font-bold">Created</th>
                <th className="px-3 py-2.5 font-bold">Expires in</th>
                <th className="px-3 py-2.5 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} onRevoke={() => revoke(s.id)} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, onRevoke, t }: { session: AccountSession; onRevoke: () => void; t: T }) {
  const { formatted, expired } = useSessionTimer(session.expiresAt)
  return (
    <tr className="transition-colors hover:bg-ink-50/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorSmartphone size={14} className="shrink-0 text-ink-400" />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-ink-800">{session.userAgent || '—'}</p>
            <p className="font-mono text-[11px] text-ink-400">{session.ip || ''}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-[12px] text-ink-500">
        {new Date(session.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="px-3 py-3">
        {session.current ? (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">{t.current}</Badge>
        ) : expired ? (
          <span className="text-[11px] text-ink-400">expired</span>
        ) : (
          <span className="font-mono text-[12px] text-ink-600">{formatted}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {!session.current && (
          <Button variant="ghost" size="sm" onClick={onRevoke} aria-label={t.revoke}>
            <XCircle size={14} />
          </Button>
        )}
      </td>
    </tr>
  )
}