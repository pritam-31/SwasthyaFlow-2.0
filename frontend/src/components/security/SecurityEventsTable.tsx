import type { GridColDef } from '@mui/x-data-grid-pro'
import { Activity, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Button, EmptyState } from '../ui'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { SecurityEvent, SecurityEventType } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

const EVENT_GROUPS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Authentication', value: 'auth.' },
  { label: 'Rate limit', value: 'security.rate-limit-exceeded' },
  { label: 'CSRF', value: 'security.csrf-failure' },
  { label: 'Input', value: 'security.invalid-input' },
  { label: 'IP', value: 'security.ip-' },
  { label: 'Policy', value: 'security.policy-updated' },
  { label: 'Lockout', value: 'security.lockout-' },
]

const EVENT_LABEL: Record<SecurityEventType, string> = {
  'auth.login-success': 'Login success',
  'auth.login-failure': 'Login failure',
  'auth.logout': 'Logout',
  'auth.logout-all': 'Signed out everywhere',
  'auth.token-refresh': 'Token refresh',
  'auth.token-refresh-reuse-detected': 'Refresh token reuse',
  'auth.password-changed': 'Password changed',
  'auth.password-reset-requested': 'Password reset requested',
  'auth.session-revoked': 'Session revoked',
  'auth.all-sessions-revoked': 'All sessions revoked',
  'auth.device-revoked': 'Device revoked',
  'auth.2fa-enabled': '2FA enabled',
  'auth.2fa-disabled': '2FA disabled',
  'auth.2fa-verified': '2FA verified',
  'auth.2fa-failed': '2FA failed',
  'security.rate-limit-exceeded': 'Rate limit exceeded',
  'security.csrf-failure': 'CSRF failure',
  'security.invalid-input': 'Invalid input',
  'security.nosql-injection-attempt': 'NoSQL injection attempt',
  'security.path-traversal-attempt': 'Path traversal attempt',
  'security.suspicious-ua': 'Suspicious user agent',
  'security.ip-blocked': 'IP blocked',
  'security.ip-unblocked': 'IP unblocked',
  'security.ip-not-allowed': 'IP not allowed',
  'security.policy-updated': 'Policy updated',
  'security.lockout-triggered': 'Lockout triggered',
  'security.lockout-cleared': 'Lockout cleared',
}

function severityOf(type: SecurityEventType): { tone: 'rose' | 'amber' | 'emerald' | 'ink'; class: string } {
  if (type === 'auth.login-success' || type === 'auth.logout' || type === 'auth.token-refresh' || type === 'security.policy-updated') {
    return { tone: 'emerald', class: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  }
  if (
    type === 'auth.login-failure' ||
    type === 'security.invalid-input' ||
    type === 'security.suspicious-ua' ||
    type === 'auth.2fa-failed'
  ) {
    return { tone: 'amber', class: 'bg-amber-50 text-amber-700 ring-amber-200' }
  }
  return { tone: 'rose', class: 'bg-rose-50 text-rose-700 ring-rose-200' }
}

const columns: GridColDef<SecurityEvent>[] = [
  {
    field: 'createdAt',
    headerName: 'When',
    flex: 1,
    minWidth: 180,
    renderCell: (p) => (
      <span className="text-[11px] text-ink-500">
        {new Date(p.row.createdAt).toLocaleString(undefined, {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </span>
    ),
  },
  {
    field: 'type',
    headerName: 'Event',
    width: 220,
    renderCell: (p) => <Badge className={severityOf(p.row.type).class}>{EVENT_LABEL[p.row.type] ?? p.row.type}</Badge>,
  },
  {
    field: 'actorRole',
    headerName: 'Role',
    width: 120,
    renderCell: (p) => <span className="text-[12px] text-ink-600">{p.row.actorRole ?? '—'}</span>,
  },
  {
    field: 'detail',
    headerName: 'Detail',
    flex: 1.4,
    minWidth: 240,
    renderCell: (p) => <span className="max-w-[280px] truncate text-[12px] text-ink-500">{p.row.detail}</span>,
  },
  {
    field: 'origin',
    headerName: 'Origin',
    width: 150,
    valueGetter: (_value, row) => row.ip ?? (row.facilityId ? 'facility' : ''),
    renderCell: (p) => (
      <span className="font-mono text-[11px] text-ink-400">
        {p.row.ip ? `IP ${p.row.ip}` : p.row.facilityId ? 'facility' : '—'}
      </span>
    ),
  },
]

/** Pseudonymised security trail — no identifiers are ever rendered. */
export function SecurityEventsTable({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const [events, setEvents] = useState<SecurityEvent[] | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    securityApi
      .fetchSecurityEvents()
      .then((e) => {
        setEvents(e)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load security events.'))
  }, [])

  useEffect(refresh, [refresh])

  const visible = filter
    ? (events ?? []).filter((e) => e.type.includes(filter))
    : (events ?? [])

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="inp max-w-[200px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {EVENT_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Reload">
          <RefreshCw size={13} />
        </Button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>}
      {visible.length === 0 && <EmptyState icon={<Activity size={18} />} title={t.noEvents} />}
      {visible.length > 0 && (
        <AppDataGrid<SecurityEvent>
          rows={visible}
          columns={columns}
          ariaLabel="Security events"
          getRowId={(e) => e.id}
          hideToolbar
          hideFooter
          defaultDensity="compact"
        />
      )}
    </div>
  )
}