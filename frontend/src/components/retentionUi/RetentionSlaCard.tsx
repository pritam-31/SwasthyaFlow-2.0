import { useState } from 'react'
import { Gauge, Save } from 'lucide-react'
import { Badge, Button, Card } from '../ui'
import { updateRetentionSla } from '../../services/retentionUiApi'
import type { RetentionSlaView } from '../../types/retentionUi.types'

export function RetentionSlaCard({ sla, canEdit, onSaved }: { sla: RetentionSlaView; canEdit: boolean; onSaved: (next: RetentionSlaView) => void }) {
  const [days, setDays] = useState(String(sla.slaDays))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const next = await updateRetentionSla(Number(days))
      onSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the SLA.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={
        <>
          <Gauge size={15} className="text-brand-600" /> Retention SLA
        </>
      }
      subtitle={`A due record may wait up to ${sla.slaDays} day(s) before it is a breach.`}
      action={
        canEdit ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-xs text-ink-800 outline-none focus:border-brand-400"
            />
            <Button size="sm" variant="secondary" disabled={busy} onClick={save}>
              <Save size={13} /> Save
            </Button>
          </div>
        ) : undefined
      }
    >
      {error && <p className="mb-2 text-[11px] text-rose-700">{error}</p>}
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-ink-500">
        <span>
          Due: <strong className="text-ink-800">{sla.totalDue}</strong>
        </span>
        <span>
          Breached categories: <strong className={sla.breachedCategories > 0 ? 'text-rose-700' : 'text-emerald-700'}>{sla.breachedCategories}</strong>
        </span>
        <span>Next sweep: {new Date(sla.nextRunAt).toLocaleString('en-IN')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-ink-400">
            <tr>
              <th className="py-1.5 pr-2 font-semibold">Category</th>
              <th className="py-1.5 pr-2 font-semibold">Due</th>
              <th className="py-1.5 pr-2 font-semibold">Oldest overdue</th>
              <th className="py-1.5 pr-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {sla.buckets.map((bucket) => (
              <tr key={bucket.category} className="border-t border-ink-100">
                <td className="py-1.5 pr-2 font-medium text-ink-700">{bucket.label}</td>
                <td className="py-1.5 pr-2 text-ink-800">{bucket.due}</td>
                <td className="py-1.5 pr-2 text-ink-500">{bucket.oldestOverdueDays}d</td>
                <td className="py-1.5 pr-2">
                  <Badge className={bucket.breached ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}>
                    {bucket.breached ? 'Breached' : 'Within SLA'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-[11px] text-rose-600">{error}</p>}
    </Card>
  )
}
