import { ScrollText } from 'lucide-react'
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
  return (
    <div className="overflow-x-auto">
      <table className="sf-table">
        <thead>
          <tr>
            <th className="w-12">{labels.sequence}</th>
            <th>{labels.when}</th>
            <th>{labels.actorRole}</th>
            <th>{labels.action}</th>
            <th>{labels.category}</th>
            <th>{labels.detail}</th>
            <th>{labels.hash}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              onClick={() => onSelect(entry)}
              className={entry.id === selectedId ? 'cursor-pointer bg-brand-50/40' : 'cursor-pointer'}
            >
              <td className="font-mono text-xs font-semibold text-ink-500">#{entry.sequenceNumber}</td>
              <td className="whitespace-nowrap font-semibold text-ink-700">{formatAuditTime(entry.at)}</td>
              <td className="text-xs text-ink-600">
                <div className="font-medium text-ink-700">{entry.actor}</div>
                <div className="text-[10px] text-ink-400">{entry.role}</div>
              </td>
              <td className="text-xs font-medium text-ink-700">{entry.action}</td>
              <td>
                <Badge className={CATEGORY_CLASS[entry.category] ?? 'bg-ink-100 text-ink-600 ring-ink-200'}>
                  {entry.category}
                </Badge>
              </td>
              <td className="max-w-[260px] text-xs text-ink-600">
                <div className="flex items-center gap-2">
                  {entry.pruned && <PrunedEntryBadge labels={labels} />}
                  <span className="truncate">{entry.detail}</span>
                </div>
              </td>
              <td className="font-mono text-[10px] text-ink-400" title={`${entry.hash} · prev ${entry.previousHash}`}>
                {entry.hash.slice(0, 12)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
