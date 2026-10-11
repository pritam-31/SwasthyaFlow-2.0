import { Lock, RefreshCw, Unlock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState } from '../ui'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { LockoutView } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

/** Accounts temporarily locked after repeated failed sign-ins (hashed keys only). */
export function LockoutTable({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [lockouts, setLockouts] = useState<LockoutView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    securityApi
      .fetchLockouts()
      .then((l) => {
        setLockouts(l)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load lockouts.'))
  }, [])

  useEffect(refresh, [refresh])

  const clear = async (key: string) => {
    try {
      await securityApi.clearLockoutByKey(key)
      pushToast('success', t.lockoutCleared)
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not clear the lockout.')
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-500">{!lockouts ? 'Loading…' : lockouts.length === 0 ? t.noLockouts : t.lockoutsSubtitle}</p>
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Reload">
          <RefreshCw size={13} />
        </Button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>}
      {lockouts && lockouts.length === 0 && <EmptyState icon={<Lock size={18} />} title={t.noLockouts} />}
      {lockouts && lockouts.length > 0 && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5 font-bold">Key (hashed)</th>
                <th className="px-3 py-2.5 font-bold">Failures</th>
                <th className="px-3 py-2.5 font-bold">Locked until</th>
                <th className="px-3 py-2.5 font-bold">Lock count</th>
                <th className="px-3 py-2.5 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {lockouts.map((l) => (
                <tr key={l.key} className="transition-colors hover:bg-ink-50/60">
                  <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-[11px] text-ink-500">{l.key}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-600">{l.failures}</td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-500">
                    {l.locked && l.lockedUntil ? new Date(l.lockedUntil).toLocaleString() : l.locked ? t.noLockouts : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-500">{l.lockCount}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => clear(l.key)} aria-label={t.clearLockout}>
                      <Unlock size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}