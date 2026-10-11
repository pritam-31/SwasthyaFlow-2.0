import { EmptyState } from '../ui'
import { ShieldCheck } from 'lucide-react'
import { formatAuditTime } from '../../lib/format'
import type { Tombstone } from '../../types/retention.types'

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
    <div className="overflow-x-auto">
      <table className="sf-table min-w-[640px]">
        <thead>
          <tr>
            <th>Deleted</th>
            <th>Scope</th>
            <th>Case</th>
            <th>Reason</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {tombstones.map((tb) => (
            <tr key={tb.id}>
              <td className="whitespace-nowrap text-[11px] text-ink-500">{formatAuditTime(tb.deletedAt)}</td>
              <td className="text-xs font-semibold text-ink-700">{tb.scope}</td>
              <td className="font-mono text-[10px] text-ink-500">
                {tb.patientId ?? '—'}
                {tb.sessionId && <span className="block text-ink-400">{tb.sessionId}</span>}
              </td>
              <td className="text-[11px] text-ink-600">{tb.reason}</td>
              <td className="text-[11px] text-ink-500">
                {tb.deletedBy}
                <span className="block text-[10px] text-ink-400">
                  {tb.deletedByRole} · policy {tb.policyVersion}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
