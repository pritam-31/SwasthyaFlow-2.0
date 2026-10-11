import type { GridColDef } from '@mui/x-data-grid-pro'
import { useState } from 'react'
import { Gauge, Save } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Button, Card } from '../ui'
import { updateRetentionSla } from '../../services/retentionUiApi'
import type { RetentionSlaView } from '../../types/retentionUi.types'

type RetentionSlaBucket = RetentionSlaView['buckets'][number]

const columns: GridColDef<RetentionSlaBucket>[] = [
  {
    field: 'label',
    headerName: 'Category',
    flex: 1,
    minWidth: 160,
    valueGetter: (_value, row) => row.label,
    renderCell: (p) => <span className="font-medium text-ink-700">{p.row.label}</span>,
  },
  {
    field: 'due',
    headerName: 'Due',
    width: 100,
    renderCell: (p) => <span className="text-ink-800">{p.row.due}</span>,
  },
  {
    field: 'oldestOverdueDays',
    headerName: 'Oldest overdue',
    width: 150,
    renderCell: (p) => <span className="text-ink-500">{p.row.oldestOverdueDays}d</span>,
  },
  {
    field: 'breached',
    headerName: 'Status',
    width: 140,
    renderCell: (p) => (
      <Badge
        className={
          p.row.breached ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        }
      >
        {p.row.breached ? 'Breached' : 'Within SLA'}
      </Badge>
    ),
  },
]

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
      <AppDataGrid<RetentionSlaBucket>
        rows={sla.buckets}
        columns={columns}
        ariaLabel="Retention SLA"
        getRowId={(bucket) => bucket.category}
        hideToolbar
        hideFooter
        defaultDensity="compact"
      />
      {error && <p className="mt-2 text-[11px] text-rose-600">{error}</p>}
    </Card>
  )
}
