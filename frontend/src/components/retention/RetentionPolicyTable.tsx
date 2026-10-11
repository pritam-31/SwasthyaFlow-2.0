import type { GridColDef } from '@mui/x-data-grid-pro'
import { Badge } from '../ui'
import { AppDataGrid } from '../AppDataGrid'
import type { RetentionPolicy } from '../../types/retention.types'

const SCOPE_LABEL: Record<string, string> = {
  session: 'Per-case',
  account: 'Account',
  system: 'System',
  file: 'File',
}

type RetentionRule = RetentionPolicy['rules'][number]

const columns: GridColDef<RetentionRule>[] = [
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
    field: 'scope',
    headerName: 'Scope',
    width: 120,
    renderCell: (p) => <span className="text-xs text-ink-500">{SCOPE_LABEL[p.row.scope] ?? p.row.scope}</span>,
  },
  {
    field: 'retention',
    headerName: 'Retention',
    width: 190,
    valueGetter: (_value, row) => row.retentionDays,
    renderCell: (p) => (
      <span className="text-xs font-semibold text-ink-700">
        {p.row.retentionDays === 0 ? 'Immediately on next sweep' : `${p.row.retentionDays} days`}
      </span>
    ),
  },
  {
    field: 'enabled',
    headerName: 'State',
    width: 140,
    renderCell: (p) => (
      <Badge
        className={
          p.row.enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-ink-100 text-ink-500 ring-ink-200'
        }
      >
        {p.row.enabled ? 'Enabled' : 'Kept forever'}
      </Badge>
    ),
  },
]

/**
 * Read-only view of the published retention policy. Doctors and admins may
 * read it; only admins edit it (see RetentionPolicyEditor).
 */
export default function RetentionPolicyTable({ policy }: { policy: RetentionPolicy }) {
  return (
    <AppDataGrid<RetentionRule>
      rows={policy.rules}
      columns={columns}
      ariaLabel="Published retention policy"
      getRowId={(rule) => rule.category}
      hideToolbar
      hideFooter
      defaultDensity="compact"
    />
  )
}
