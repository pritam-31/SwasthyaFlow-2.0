import type { GridColDef } from '@mui/x-data-grid-pro'
import { Timer } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Card, EmptyState } from '../ui'
import { formatAuditTime } from '../../lib/format'
import type { PendingDeletions } from '../../types/retentionUi.types'

type PendingRow = PendingDeletions['rows'][number]

const columns: GridColDef<PendingRow>[] = [
  {
    field: 'category',
    headerName: 'Category',
    flex: 1,
    minWidth: 160,
    renderCell: (p) => <span className="font-medium text-ink-700">{p.row.category}</span>,
  },
  {
    field: 'targetId',
    headerName: 'Target',
    width: 180,
    renderCell: (p) => <span className="font-mono text-ink-500">{p.row.targetId}</span>,
  },
  {
    field: 'sessionId',
    headerName: 'Case',
    width: 180,
    renderCell: (p) => <span className="font-mono text-ink-500">{p.row.sessionId ?? '—'}</span>,
  },
  {
    field: 'expiresAt',
    headerName: 'Due',
    width: 160,
    renderCell: (p) => <span className="text-ink-500">{formatAuditTime(p.row.expiresAt)}</span>,
  },
  {
    field: 'daysUntil',
    headerName: 'Status',
    width: 140,
    renderCell: (p) => (
      <Badge
        className={p.row.due ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}
      >
        {p.row.due ? `overdue ${Math.abs(p.row.daysUntil)}d` : `${p.row.daysUntil}d`}
      </Badge>
    ),
  },
]

export function PendingDeletionsTable({ pending }: { pending: PendingDeletions }) {
  return (
    <Card
      title={
        <>
          <Timer size={15} className="text-brand-600" /> Pending deletions
        </>
      }
      subtitle="Records already due or approaching their retention age across this facility."
    >
      {pending.rows.length === 0 ? (
        <EmptyState icon={<Timer size={18} />} title="Nothing due right now." />
      ) : (
        <AppDataGrid<PendingRow>
          rows={pending.rows}
          columns={columns}
          ariaLabel="Pending deletions"
          getRowId={(row) => `${row.category}:${row.targetId}`}
          hideToolbar
          hideFooter
          defaultDensity="compact"
          maxHeight={320}
        />
      )}
    </Card>
  )
}
