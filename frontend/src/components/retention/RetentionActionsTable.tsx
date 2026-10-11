import type { GridColDef } from '@mui/x-data-grid-pro'
import { EmptyState } from '../ui'
import { History } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { formatAuditTime } from '../../lib/format'
import type { RetentionAction } from '../../types/retention.types'

const ACTION_LABEL: Record<RetentionAction['action'], string> = {
  'policy.updated': 'Policy updated',
  'job.run': 'Sweep run',
  'session.exported': 'Case exported',
  'session.deleted': 'Case erased',
  'session.extended': 'Retention extended',
  'consent.granted': 'Consent granted',
  'consent.revoked': 'Consent withdrawn',
  'data.deleted': 'Data deleted',
  'data.extended': 'Retention extended',
}

const columns: GridColDef<RetentionAction>[] = [
  {
    field: 'at',
    headerName: 'When',
    width: 160,
    renderCell: (p) => <span className="whitespace-nowrap text-[11px] text-ink-500">{formatAuditTime(p.row.at)}</span>,
  },
  {
    field: 'actor',
    headerName: 'Actor',
    width: 180,
    renderCell: (p) => (
      <span className="text-xs text-ink-600">
        {p.row.actor}
        <span className="block text-[10px] text-ink-400">{p.row.actorRole}</span>
      </span>
    ),
  },
  {
    field: 'action',
    headerName: 'Action',
    width: 180,
    renderCell: (p) => (
      <span className="text-xs font-semibold text-ink-700">{ACTION_LABEL[p.row.action] ?? p.row.action}</span>
    ),
  },
  {
    field: 'detail',
    headerName: 'Detail',
    flex: 1,
    minWidth: 240,
    renderCell: (p) => (
      <span className="text-[11px] text-ink-500">
        {p.row.detail}
        {p.row.targetId && <span className="block font-mono text-[10px] text-ink-400">{p.row.targetId}</span>}
      </span>
    ),
  },
]

/** Retention history, most recent first (doctor / admin). */
export default function RetentionActionsTable({ actions }: { actions: RetentionAction[] }) {
  if (actions.length === 0) {
    return (
      <EmptyState icon={<History size={20} />} title="No retention activity yet" hint="Policy edits and sweeps appear here." />
    )
  }
  return (
    <AppDataGrid<RetentionAction>
      rows={actions}
      columns={columns}
      ariaLabel="Retention activity"
      getRowId={(a) => a.id}
      hideToolbar
      hideFooter
      defaultDensity="compact"
    />
  )
}
