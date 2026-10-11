import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button, Card } from '../ui'
import { useApp } from '../../store/AppStore'
import { permissionsFor } from '../../services/rbacService'
import { PRIORITY_SECTION_LABELS } from '../../services/safetyPolicy'
import { PRIORITY_BANDS, PRIORITY_BAND_LABELS } from '../../types/priority.types'
import type { SlaConfig } from '../../types/priority.types'
import { fetchSlaConfig, updateSlaConfig } from '../../services/queueApi'

const FALLBACK: SlaConfig = { critical: 5, high: 15, medium: 60, low: 180, routine: 360 }

/**
 * Per-facility SLA wait-time thresholds (P1-11). Only a facility or system
 * administrator may edit them; the backend enforces the same rule and the
 * ordering constraint (a more urgent band can never wait longer).
 */
export function SlaConfigEditor() {
  const { role, pushToast } = useApp()
  const permissions = permissionsFor(role)
  const labels = PRIORITY_SECTION_LABELS.en
  const [config, setConfig] = useState<SlaConfig>(FALLBACK)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!permissions.canViewQueue) return
    fetchSlaConfig()
      .then((res) => setConfig(res.config))
      .catch(() => setConfig(FALLBACK))
  }, [permissions.canViewQueue])

  if (!permissions.canViewQueue) return null

  const save = async () => {
    setSaving(true)
    try {
      const res = await updateSlaConfig(config)
      setConfig(res.config)
      pushToast('success', labels.slaConfig)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : labels.slaConfig)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title={labels.slaConfig} subtitle={labels.slaConfigHint}>
      <div className="grid gap-3 sm:grid-cols-5">
        {PRIORITY_BANDS.map((band) => (
          <label key={band} className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {PRIORITY_BAND_LABELS[band]}
            </span>
            <input
              type="number"
              min={1}
              max={1440}
              value={config[band]}
              disabled={!permissions.canEditSlaConfig}
              onChange={(e) => setConfig({ ...config, [band]: Number(e.target.value) })}
              className="inp"
            />
            <span className="mt-1 block text-[10px] text-ink-400">{labels.minutes}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={!permissions.canEditSlaConfig || saving}>
          <Save size={14} /> {labels.save}
        </Button>
        {!permissions.canEditSlaConfig && <span className="text-[11px] text-ink-400">{labels.cannotOverride}</span>}
      </div>
    </Card>
  )
}
