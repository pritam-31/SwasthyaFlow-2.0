import { Ban, Globe, RefreshCw, ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, EmptyState } from '../ui'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { IpBlocklistEntry } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

/** Network-edge blocks. Editors are always administrators. */
export function IpBlocklistTable({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [entries, setEntries] = useState<IpBlocklistEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ ip: '', reason: '', durationMinutes: '' })
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    securityApi
      .fetchBlocklist()
      .then((e) => {
        setEntries(e)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the IP blocklist.'))
  }, [])

  useEffect(refresh, [refresh])

  const block = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.ip.trim() || busy) return
    setBusy(true)
    try {
      await securityApi.blockIp({
        ip: form.ip.trim(),
        reason: form.reason.trim() || 'blocked from the security console',
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      })
      pushToast('success', t.ipBlocked)
      setForm({ ip: '', reason: '', durationMinutes: '' })
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not block the IP.')
    } finally {
      setBusy(false)
    }
  }

  const unblock = async (entryId: string) => {
    try {
      await securityApi.unblockIp(entryId)
      pushToast('success', t.ipUnblocked)
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not unblock the IP.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-500">{!entries ? 'Loading…' : entries.length === 0 ? t.noBlocked : t.blocklistSubtitle}</p>
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Reload">
          <RefreshCw size={13} />
        </Button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>}

      <form onSubmit={block} className="flex flex-wrap gap-2 rounded-xl border border-ink-200 p-2.5">
        <input
          className="inp w-[160px]"
          value={form.ip}
          onChange={(e) => setForm({ ...form, ip: e.target.value })}
          placeholder={t.blockIpPlaceholder}
          required
        />
        <input
          className="inp min-w-[180px] flex-1"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder={t.reasonPlaceholder}
        />
        <input
          className="inp w-[150px]"
          type="number"
          min={1}
          value={form.durationMinutes}
          onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
          placeholder={t.durationPlaceholder}
        />
        <Button type="submit" variant="danger" disabled={busy}>
          <Ban size={14} /> {t.blockIp}
        </Button>
      </form>

      {entries && entries.length === 0 && <EmptyState icon={<Globe size={18} />} title={t.noBlocked} />}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5 font-bold">IP</th>
                <th className="px-3 py-2.5 font-bold">Reason</th>
                <th className="px-3 py-2.5 font-bold">Blocked at</th>
                <th className="px-3 py-2.5 font-bold">Expires</th>
                <th className="px-3 py-2.5 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {entries.map((entry) => (
                <tr key={entry.entryId} className="transition-colors hover:bg-ink-50/60">
                  <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-ink-800">{entry.ip}</td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-500">{entry.reason}</td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-500">{new Date(entry.blockedAt).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-[11px] text-ink-500">
                    {entry.expiresAt ? new Date(entry.expiresAt).toLocaleString() : 'permanent'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => unblock(entry.entryId)} aria-label={t.unblock}>
                      <ShieldOff size={14} />
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