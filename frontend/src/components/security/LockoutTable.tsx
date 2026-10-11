import type { GridColDef } from '@mui/x-data-grid-pro'
import { Lock, RefreshCw, Unlock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppDataGrid } from '../AppDataGrid'
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

  const columns: GridColDef<LockoutView>[] = [
    {
      field: 'key',
      headerName: 'Key (hashed)',
      flex: 1,
      minWidth: 200,
      renderCell: (p) => <span className="max-w-[220px] truncate font-mono text-[11px] text-ink-500">{p.row.key}</span>,
    },
    {
      field: 'failures',
      headerName: 'Failures',
      width: 100,
      renderCell: (p) => <span className="text-[12px] text-ink-600">{p.row.failures}</span>,
    },
    {
      field: 'lockedUntil',
      headerName: 'Locked until',
      flex: 1,
      minWidth: 160,
      renderCell: (p) => (
        <span className="text-[11px] text-ink-500">
          {p.row.locked && p.row.lockedUntil ? new Date(p.row.lockedUntil).toLocaleString() : p.row.locked ? t.noLockouts : '—'}
        </span>
      ),
    },
    {
      field: 'lockCount',
      headerName: 'Lock count',
      width: 100,
      renderCell: (p) => <span className="text-[12px] text-ink-500">{p.row.lockCount}</span>,
    },
    {
      field: 'clear',
      headerName: 'Action',
      width: 90,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (p) => (
        <Button variant="ghost" size="sm" onClick={() => clear(p.row.key)} aria-label={t.clearLockout}>
          <Unlock size={14} />
        </Button>
      ),
    },
  ]

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
        <AppDataGrid<LockoutView>
          rows={lockouts}
          columns={columns}
          ariaLabel="Lockouts"
          getRowId={(l) => l.key}
          hideToolbar
          hideFooter
          defaultDensity="compact"
        />
      )}
    </div>
  )
}