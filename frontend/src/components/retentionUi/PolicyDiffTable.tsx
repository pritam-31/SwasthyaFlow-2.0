import type { GridColDef } from '@mui/x-data-grid-pro'
import { GitCompare } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Card } from '../ui'
import type { PolicyDiff } from '../../types/retentionUi.types'

type PolicyDiffRow = PolicyDiff['rows'][number]

const columns: GridColDef<PolicyDiffRow>[] = [
  {
    field: 'label',
    headerName: 'Category',
    flex: 1,
    minWidth: 160,
    valueGetter: (_value, row) => row.label,
    renderCell: (p) => <span className="font-medium text-ink-700">{p.row.label}</span>,
  },
  {
    field: 'globalDays',
    headerName: 'Global',
    width: 110,
    renderCell: (p) => (
      <span className="text-ink-500">
        {p.row.globalDays}d{p.row.globalEnabled ? '' : ' · off'}
      </span>
    ),
  },
  {
    field: 'facilityDays',
    headerName: 'Facility',
    width: 110,
    renderCell: (p) => (
      <span className="text-ink-800">
        {p.row.facilityDays}d{p.row.facilityEnabled ? '' : ' · off'}
      </span>
    ),
  },
  {
    field: 'deltaDays',
    headerName: 'Delta',
    width: 100,
    renderCell: (p) =>
      p.row.deltaDays === 0 ? (
        <span className="text-ink-300">0</span>
      ) : (
        <span className={p.row.deltaDays > 0 ? 'text-sky-700' : 'text-amber-700'}>
          {p.row.deltaDays > 0 ? '+' : ''}
          {p.row.deltaDays}d
        </span>
      ),
  },
  {
    field: 'changed',
    headerName: 'Changed',
    width: 120,
    renderCell: (p) =>
      p.row.changed ? (
        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Changed</Badge>
      ) : (
        <span className="text-ink-300">—</span>
      ),
  },
]

export function PolicyDiffTable({ diff }: { diff: PolicyDiff }) {
  return (
    <Card
      title={
        <>
          <GitCompare size={15} className="text-brand-600" /> Policy diff
        </>
      }
      subtitle={`This facility vs the global policy (${diff.globalVersion}). ${diff.changedCount} category change(s).`}
    >
      <AppDataGrid<PolicyDiffRow>
        rows={diff.rows}
        columns={columns}
        ariaLabel="Policy diff"
        getRowId={(row) => row.category}
        hideToolbar
        hideFooter
        defaultDensity="compact"
      />
    </Card>
  )
}
