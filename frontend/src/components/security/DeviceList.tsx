import { RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
        <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5 font-bold">Device</th>
                <th className="px-3 py-2.5 font-bold">First seen</th>
                <th className="px-3 py-2.5 font-bold">Last seen</th>
                <th className="px-3 py-2.5 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {devices.map((d) => (
                <tr key={d.deviceId} className="transition-colors hover:bg-ink-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Smartphone size={14} className="shrink-0 text-ink-400" />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-ink-800">{d.userAgent || '—'}</p>
                        <p className="font-mono text-[11px] text-ink-400">{d.ip || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-ink-500">{new Date(d.firstSeenAt).toLocaleString()}</td>
                  <td className="px-3 py-3 text-[12px] text-ink-500">{new Date(d.lastSeenAt).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => revoke(d.deviceId)} aria-label={t.revokeDevice}>
                      <XCircle size={14} />
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