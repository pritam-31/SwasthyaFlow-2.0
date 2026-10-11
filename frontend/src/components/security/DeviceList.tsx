import type { GridColDef } from '@mui/x-data-grid-pro'
import { RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppDataGrid } from '../AppDataGrid'
import { EmptyState, Button } from '../ui'
import { useApp } from '../../store/AppStore'
import { SECURITY_SECTION_LABELS } from '../../services/safetyPolicy'
import type { Device } from '../../types/security.types'
import * as securityApi from '../../services/securityApi'

type Lang = 'en' | 'hi' | 'or'

/** Known signing-in devices for the account; revoking ends their sessions. */
export function DeviceList({ lang = 'en' }: { lang?: Lang }) {
  const t = SECURITY_SECTION_LABELS[lang]
  const { pushToast } = useApp()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    securityApi
      .fetchDevices()
      .then((d) => {
        setDevices(d)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load devices.'))
  }, [])

  useEffect(refresh, [refresh])

  const revoke = async (deviceId: string) => {
    try {
      await securityApi.revokeDevice(deviceId)
      pushToast('success', t.deviceRevoked)
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not revoke the device.')
    }
  }

  const columns: GridColDef<Device>[] = [
    {
      field: 'device',
      headerName: 'Device',
      flex: 1,
      minWidth: 200,
      valueGetter: (_value, row) => row.userAgent,
      renderCell: (p) => (
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="shrink-0 text-ink-400" />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-ink-800">{p.row.userAgent || '—'}</p>
            <p className="font-mono text-[11px] text-ink-400">{p.row.ip || ''}</p>
          </div>
        </div>
      ),
    },
    {
      field: 'firstSeenAt',
      headerName: 'First seen',
      flex: 1,
      minWidth: 140,
      renderCell: (p) => <span className="text-[12px] text-ink-500">{new Date(p.row.firstSeenAt).toLocaleString()}</span>,
    },
    {
      field: 'lastSeenAt',
      headerName: 'Last seen',
      flex: 1,
      minWidth: 140,
      renderCell: (p) => <span className="text-[12px] text-ink-500">{new Date(p.row.lastSeenAt).toLocaleString()}</span>,
    },
    {
      field: 'revoke',
      headerName: 'Action',
      width: 90,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (p) => (
        <Button variant="ghost" size="sm" onClick={() => revoke(p.row.deviceId)} aria-label={t.revokeDevice}>
          <XCircle size={14} />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-500">{!devices ? 'Loading…' : devices.length === 0 ? t.noDevices : t.devicesSubtitle}</p>
        <Button variant="ghost" size="sm" onClick={refresh} aria-label="Reload">
          <RefreshCw size={13} />
        </Button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>}
      {devices && devices.length === 0 && <EmptyState icon={<Smartphone size={18} />} title={t.noDevices} />}
      {devices && devices.length > 0 && (
        <AppDataGrid<Device>
          rows={devices}
          columns={columns}
          ariaLabel="Devices"
          getRowId={(d) => d.deviceId}
          hideToolbar
          hideFooter
          defaultDensity="compact"
        />
      )}
    </div>
  )
}