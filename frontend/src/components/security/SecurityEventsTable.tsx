import { Activity, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
        <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5 font-bold">When</th>
                <th className="px-3 py-2.5 font-bold">Event</th>
                <th className="px-3 py-2.5 font-bold">Role</th>
                <th className="px-3 py-2.5 font-bold">Detail</th>
                <th className="px-3 py-2.5 font-bold">Origin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {visible.map((e) => {
                const { class: toneClass } = severityOf(e.type)
                return (
                  <tr key={e.id} className="transition-colors hover:bg-ink-50/60">
                    <td className="px-4 py-2.5 text-[11px] text-ink-500">
                      {new Date(e.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={toneClass}>{EVENT_LABEL[e.type] ?? e.type}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-600">{e.actorRole ?? '—'}</td>
                    <td className="max-w-[280px] truncate px-3 py-2.5 text-[12px] text-ink-500">{e.detail}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-ink-400">{e.ip ? `IP ${e.ip}` : e.facilityId ? 'facility' : '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}