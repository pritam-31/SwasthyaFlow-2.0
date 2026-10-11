import { Timer } from 'lucide-react'
import { Badge, Card, EmptyState } from '../ui'
import { formatAuditTime } from '../../lib/format'
import type { PendingDeletions } from '../../types/retentionUi.types'

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
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-white text-ink-400">
              <tr>
                <th className="py-1.5 pr-2 font-semibold">Category</th>
                <th className="py-1.5 pr-2 font-semibold">Target</th>
                <th className="py-1.5 pr-2 font-semibold">Case</th>
                <th className="py-1.5 pr-2 font-semibold">Due</th>
                <th className="py-1.5 pr-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {pending.rows.map((row) => (
                <tr key={`${row.category}:${row.targetId}`} className="border-t border-ink-100">
                  <td className="py-1.5 pr-2 font-medium text-ink-700">{row.category}</td>
                  <td className="py-1.5 pr-2 font-mono text-ink-500">{row.targetId}</td>
                  <td className="py-1.5 pr-2 font-mono text-ink-500">{row.sessionId ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-ink-500">{formatAuditTime(row.expiresAt)}</td>
                  <td className="py-1.5 pr-2">
                    <Badge className={row.due ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}>
                      {row.due ? `overdue ${Math.abs(row.daysUntil)}d` : `${row.daysUntil}d`}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
