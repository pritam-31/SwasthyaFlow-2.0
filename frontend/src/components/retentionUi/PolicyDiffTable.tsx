import { GitCompare } from 'lucide-react'
import { Badge, Card } from '../ui'
import type { PolicyDiff } from '../../types/retentionUi.types'

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
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-ink-400">
            <tr>
              <th className="py-1.5 pr-2 font-semibold">Category</th>
              <th className="py-1.5 pr-2 font-semibold">Global</th>
              <th className="py-1.5 pr-2 font-semibold">Facility</th>
              <th className="py-1.5 pr-2 font-semibold">Delta</th>
              <th className="py-1.5 pr-2 font-semibold">Changed</th>
            </tr>
          </thead>
          <tbody>
            {diff.rows.map((row) => (
              <tr key={row.category} className="border-t border-ink-100">
                <td className="py-1.5 pr-2 font-medium text-ink-700">{row.label}</td>
                <td className="py-1.5 pr-2 text-ink-500">
                  {row.globalDays}d{row.globalEnabled ? '' : ' · off'}
                </td>
                <td className="py-1.5 pr-2 text-ink-800">
                  {row.facilityDays}d{row.facilityEnabled ? '' : ' · off'}
                </td>
                <td className="py-1.5 pr-2">
                  {row.deltaDays === 0 ? (
                    <span className="text-ink-300">0</span>
                  ) : (
                    <span className={row.deltaDays > 0 ? 'text-sky-700' : 'text-amber-700'}>
                      {row.deltaDays > 0 ? '+' : ''}
                      {row.deltaDays}d
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  {row.changed ? (
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Changed</Badge>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
