import { Badge } from '../ui'
import type { RetentionStatusRow } from '../../types/retention.types'

/** Per-category inventory: what is held and what is eligible to purge (admin). */
export default function RetentionStatusTable({ status }: { status: RetentionStatusRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="sf-table min-w-[560px]">
        <thead>
          <tr>
            <th>Category</th>
            <th>Held</th>
            <th>Due now</th>
            <th>Window</th>
          </tr>
        </thead>
        <tbody>
          {status.map((row) => (
            <tr key={row.category}>
              <td>
                <p className="font-semibold text-ink-700">{row.label}</p>
                <p className="font-mono text-[10px] text-ink-400">{row.category}</p>
              </td>
              <td className="text-xs font-semibold text-ink-700">{row.total}</td>
              <td>
                <Badge
                  className={
                    row.eligible > 0
                      ? 'bg-amber-50 text-amber-700 ring-amber-200'
                      : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  }
                >
                  {row.eligible}
                </Badge>
              </td>
              <td className="text-xs text-ink-500">
                {!row.enabled ? 'Kept forever' : row.retentionDays === 0 ? 'Next sweep' : `${row.retentionDays} days`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
