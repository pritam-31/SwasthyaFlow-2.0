import { Card } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { SessionDataInventory } from '../../types/retentionUi.types'

export function SessionDataInventory({ inventory }: { inventory: SessionDataInventory }) {
  const { language } = useTriage()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  return (
    <Card title={<>{labels.inventoryHeading}</>} subtitle={labels.inventoryHint}>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-ink-500">
        <span>
          {labels.records}: <strong className="text-ink-800">{inventory.totalRecords}</strong>
        </span>
        <span>
          {labels.eligible}: <strong className="text-amber-700">{inventory.eligibleRecords}</strong>
        </span>
        <span>
          {labels.policyVersion}: <strong className="text-ink-800">{inventory.policyVersion}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-ink-400">
            <tr>
              <th className="py-1.5 pr-2 font-semibold">{labels.category}</th>
              <th className="py-1.5 pr-2 font-semibold">{labels.records}</th>
              <th className="py-1.5 pr-2 font-semibold">{labels.eligible}</th>
              <th className="py-1.5 pr-2 font-semibold">{labels.expiresAt}</th>
              <th className="py-1.5 pr-2 font-semibold">{labels.whyRetained}</th>
            </tr>
          </thead>
          <tbody>
            {inventory.rows.map((row) => (
              <tr key={row.category} className="border-t border-ink-100 align-top">
                <td className="py-1.5 pr-2 font-medium text-ink-700">{row.label}</td>
                <td className="py-1.5 pr-2 text-ink-800">{row.total}</td>
                <td className="py-1.5 pr-2">
                  {row.eligible > 0 ? (
                    <span className="font-semibold text-amber-700">{row.eligible}</span>
                  ) : (
                    <span className="text-ink-300">0</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-ink-500">{row.expiresAt ? formatAuditTime(row.expiresAt) : '—'}</td>
                <td className="py-1.5 pr-2 text-ink-500">{row.whyRetained}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
