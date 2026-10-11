import type { GridColDef } from '@mui/x-data-grid-pro'
import { Ban, Globe, RefreshCw, ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AppDataGrid } from '../AppDataGrid'
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

  const columns: GridColDef<IpBlocklistEntry>[] = [
    {
      field: 'ip',
      headerName: 'IP',
      width: 170,
      renderCell: (p) => <span className="font-mono text-[12px] font-semibold text-ink-800">{p.row.ip}</span>,
    },
    {
      field: 'reason',
      headerName: 'Reason',
      flex: 1,
      minWidth: 180,
      renderCell: (p) => <span className="text-[12px] text-ink-500">{p.row.reason}</span>,
    },
    {
      field: 'blockedAt',
      headerName: 'Blocked at',
      width: 160,
      renderCell: (p) => {
        const value = new Date(p.row.blockedAt).toLocaleString()
        return <span className="text-[11px] text-ink-500">{value}</span>
      },
    },
    {
      field: 'expiresAt',
      headerName: 'Expires',
      width: 150,
      renderCell: (p) => (
        <span className="text-[11px] text-ink-500">{p.row.expiresAt ? new Date(p.row.expiresAt).toLocaleString() : 'permanent'}</span>
      ),
    },
    {
      field: 'unblock',
      headerName: 'Action',
      width: 90,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (p) => (
        <Button variant="ghost" size="sm" onClick={() => unblock(p.row.entryId)} aria-label={t.unblock}>
          <ShieldOff size={14} />
        </Button>
      ),
    },
  ]

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
        <AppDataGrid<IpBlocklistEntry>
          rows={entries}
          columns={columns}
          ariaLabel="IP blocklist"
          getRowId={(entry) => entry.entryId}
          hideToolbar
          hideFooter
          defaultDensity="compact"
        />
      )}
    </div>
  )
}