import { EmptyState } from '../ui'
import { History } from 'lucide-react'
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

/** Retention history, most recent first (doctor / admin). */
export default function RetentionActionsTable({ actions }: { actions: RetentionAction[] }) {
  if (actions.length === 0) {
    return (
      <EmptyState icon={<History size={20} />} title="No retention activity yet" hint="Policy edits and sweeps appear here." />
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="sf-table min-w-[640px]">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap text-[11px] text-ink-500">{formatAuditTime(a.at)}</td>
              <td className="text-xs text-ink-600">
                {a.actor}
                <span className="block text-[10px] text-ink-400">{a.actorRole}</span>
              </td>
              <td className="text-xs font-semibold text-ink-700">{ACTION_LABEL[a.action] ?? a.action}</td>
              <td className="text-[11px] text-ink-500">
                {a.detail}
                {a.targetId && <span className="block font-mono text-[10px] text-ink-400">{a.targetId}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
