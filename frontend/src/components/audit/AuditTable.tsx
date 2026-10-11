import type { GridColDef } from '@mui/x-data-grid-pro'
import { ScrollText } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, EmptyState } from '../ui'
import { PrunedEntryBadge } from './PrunedEntryBadge'
import { formatAuditTime } from '../../lib/format'
import type { AuditSectionLabels } from '../../services/safetyPolicy'
import type { AuditChainEntry } from '../../types/auditChain.types'

const CATEGORY_CLASS: Record<string, string> = {
  view: 'bg-sky-50 text-sky-700 ring-sky-200',
  edit: 'bg-violet-50 text-violet-700 ring-violet-200',
  decision: 'bg-brand-50 text-brand-700 ring-brand-200',
  export: 'bg-amber-50 text-amber-700 ring-amber-200',
  auth: 'bg-rose-50 text-rose-700 ring-rose-200',
  system: 'bg-ink-100 text-ink-600 ring-ink-200',
}

interface Props {
  labels: AuditSectionLabels
  entries: AuditChainEntry[]
  selectedId?: string
  onSelect: (entry: AuditChainEntry) => void
}

/** The chained audit trail table. Rows open the detail drawer. */
export function AuditTable({ labels, entries, selectedId, onSelect }: Props) {
  if (entries.length === 0) {
    return <EmptyState icon={<ScrollText size={20} />} title={labels.noEntries} />
  }

  const columns: GridColDef<AuditChainEntry>[] = [
    {
      field: 'sequenceNumber',
      headerName: labels.sequence,
      width: 90,
      renderCell: (p) => <span className="font-mono text-xs font-semibold text-ink-500">#{p.row.sequenceNumber}</span>,
    },
    {
      field: 'at',
      headerName: labels.when,
      width: 190,
      renderCell: (p) => <span className="whitespace-nowrap font-semibold text-ink-700">{formatAuditTime(p.row.at)}</span>,
    },
    {
      field: 'actor',
      headerName: labels.actorRole,
      width: 170,
      renderCell: (p) => (
        <div className="text-xs text-ink-600">
          <div className="font-medium text-ink-700">{p.row.actor}</div>
          <div className="text-[10px] text-ink-400">{p.row.role}</div>
        </div>
      ),
    },
    {
      field: 'action',
      headerName: labels.action,
      flex: 1,
      minWidth: 160,
      renderCell: (p) => <span className="text-xs font-medium text-ink-700">{p.row.action}</span>,
    },
    {
      field: 'category',
      headerName: labels.category,
      width: 150,
      renderCell: (p) => (
        <Badge className={CATEGORY_CLASS[p.row.category] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}>{p.row.category}</Badge>
      ),
    },
    {
      field: 'detail',
      headerName: labels.detail,
      flex: 1.2,
      minWidth: 220,
      renderCell: (p) => (
        <div className="flex items-center gap-2">
          {p.row.pruned && <PrunedEntryBadge labels={labels} />}
          <span className="truncate">{p.row.detail}</span>
        </div>
      ),
    },
    {
      field: 'hash',
      headerName: labels.hash,
      width: 150,
      renderCell: (p) => (
        <span className="font-mono text-[10px] text-ink-400" title={`${p.row.hash} · prev ${p.row.previousHash}`}>
          {p.row.hash.slice(0, 12)}…
        </span>
      ),
    },
  ]

  return (
    <AppDataGrid<AuditChainEntry>
      rows={entries}
      columns={columns}
      ariaLabel={labels.tableTitle}
      getRowId={(entry) => entry.id}
      onRowClick={onSelect}
      getRowClassName={(entry) => (entry.id === selectedId ? 'bg-brand-50/40' : '')}
      hideToolbar
      hideFooter
      defaultDensity="compact"
    />
  )
}
