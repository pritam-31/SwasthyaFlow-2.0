import type { GridColDef } from '@mui/x-data-grid-pro'
import { MonitorSmartphone, RefreshCw, XCircle } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Button, EmptyState } from '../ui'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { AccountSession } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'
import { useSessionTimer } from '../../hooks/useSessionTimer'

type Lang = 'en' | 'hi' | 'or'
type T = (typeof SECURITY_SECTION_LABELS)[Lang]

type SessionRow = AccountSession & { id: string }

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
        <AppDataGrid<SessionRow>
          rows={sessions}
          ariaLabel="Access sessions"
          getRowId={(s) => s.id}
          hideToolbar
          hideFooter
          defaultDensity="compact"
          columns={[
            {
              field: 'deviceAddress',
              headerName: 'Device / address',
              flex: 1,
              minWidth: 200,
              renderCell: (p) => (
                <div className="truncate">
                  {p.row.deviceAddress ?? '—'}
                </div>
              ),
            },
            {
              field: 'createdAt',
              headerName: 'Created',
              width: 180,
              renderCell: (p) => <span className="text-[11px] text-ink-500">{new Date(p.row.createdAt).toLocaleString()}</span>,
            },
            {
              field: 'expiresIn',
              headerName: 'Expires in',
              width: 150,
              renderCell: (p) => {
                const minutes = Math.round((new Date(p.row.expiresAt).getTime() - new Date().getTime()) / 60000)
                return minutes > 0 ? `${minutes} min remaining` : 'expired'
              },
            },
            {
              field: 'action',
              headerName: 'Action',
              width: 120,
              sortable: false,
              filterable: false,
              disableColumnMenu: true,
              align: 'right',
              headerAlign: 'right',
              renderCell: (p) => (
                <Button variant="ghost" size="sm" onClick={() => revoke(p.row.id)} aria-label={t.sessionRevoked}>
                  <XCircle size={14} />
                </Button>
              ),
            },
          ]}
        />
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