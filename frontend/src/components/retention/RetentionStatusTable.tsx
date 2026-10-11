import type { GridColDef } from '@mui/x-data-grid-pro'
import { Badge } from '../ui'
import { AppDataGrid } from '../AppDataGrid'
import type { RetentionStatusRow } from '../../types/retention.types'

const columns: GridColDef<RetentionStatusRow>[] = [
  {
    field: 'category',
    headerName: 'Category',
    flex: 1,
    minWidth: 180,
    renderCell: (p) => (
      <div>
        <p className="font-semibold text-ink-700">{p.row.label}</p>
        <p className="font-mono text-[10px] text-ink-400">{p.row.category}</p>
      </div>
    ),
  },
  {
    field: 'total',
    headerName: 'Held',
    width: 100,
    renderCell: (p) => <span className="text-xs font-semibold text-ink-700">{p.row.total}</span>,
  },
  {
    field: 'eligible',
    headerName: 'Due now',
    width: 110,
    renderCell: (p) => (
      <Badge
        className={
          p.row.eligible > 0 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        }
      >
        {p.row.eligible}
      </Badge>
    ),
  },
  {
    field: 'window',
    headerName: 'Window',
    width: 150,
    valueGetter: (_value, row) => row.retentionDays,
    renderCell: (p) => (
      <span className="text-xs text-ink-500">
        {!p.row.enabled ? 'Kept forever' : p.row.retentionDays === 0 ? 'Next sweep' : `${p.row.retentionDays} days`}
      </span>
    ),
  },
]

/** Per-category inventory: what is held and what is eligible to purge (admin). */
export default function RetentionStatusTable({ status }: { status: RetentionStatusRow[] }) {
  return (
    <AppDataGrid<RetentionStatusRow>
      rows={status}
      columns={columns}
      ariaLabel="Retention inventory"
      getRowId={(row) => row.category}
      hideToolbar
      hideFooter
      defaultDensity="compact"
    />
  )
}
