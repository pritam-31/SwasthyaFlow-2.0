import type { GridColDef } from '@mui/x-data-grid-pro'
import { EmptyState } from '../ui'
import { ShieldCheck } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { formatAuditTime } from '../../lib/format'
import type { Tombstone } from '../../types/retention.types'

const columns: GridColDef<Tombstone>[] = [
  {
    field: 'deletedAt',
    headerName: 'Deleted',
    width: 160,
    renderCell: (p) => (
      <span className="whitespace-nowrap text-[11px] text-ink-500">{formatAuditTime(p.row.deletedAt)}</span>
    ),
  },
  {
    field: 'scope',
    headerName: 'Scope',
    width: 120,
    renderCell: (p) => <span className="text-xs font-semibold text-ink-700">{p.row.scope}</span>,
  },
  {
    field: 'case',
    headerName: 'Case',
    width: 180,
    valueGetter: (_value, row) => row.patientId ?? row.sessionId ?? '',
    renderCell: (p) => (
      <span className="font-mono text-[10px] text-ink-500">
        {p.row.patientId ?? '—'}
        {p.row.sessionId && <span className="block text-ink-400">{p.row.sessionId}</span>}
      </span>
    ),
  },
  {
    field: 'reason',
    headerName: 'Reason',
    flex: 1,
    minWidth: 200,
    renderCell: (p) => <span className="text-[11px] text-ink-600">{p.row.reason}</span>,
  },
  {
    field: 'deletedBy',
    headerName: 'By',
    width: 200,
    renderCell: (p) => (
      <span className="text-[11px] text-ink-500">
        {p.row.deletedBy}
        <span className="block text-[10px] text-ink-400">
          {p.row.deletedByRole} · policy {p.row.policyVersion}
        </span>
      </span>
    ),
  },
]

/**
 * Deletion proof (admin). Tombstones carry identifiers and reasons only —
 * never any patient payload — so they can outlive the data they attest to.
 */
export default function TombstoneList({ tombstones }: { tombstones: Tombstone[] }) {
  if (tombstones.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck size={20} />}
        title="No deletions recorded"
        hint="Every erased case leaves a tombstone that holds no patient data."
      />
    )
  }
  return (
    <AppDataGrid<Tombstone>
      rows={tombstones}
      columns={columns}
      ariaLabel="Deletion tombstones"
      getRowId={(tb) => tb.id}
      hideToolbar
      hideFooter
      defaultDensity="compact"
    />
  )
}
