import { BadgeCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { Badge, Card } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { ConsentCoverage } from '../../types/consent.types'

export function ConsentCoverageCard({ coverage }: { coverage: ConsentCoverage }) {
  const { language } = useTriage()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  return (
    <Card
      title={
        <>
          <BadgeCheck size={15} className="text-brand-600" /> {labels.coverageHeading}
        </>
      }
      subtitle={labels.coverageHint}
    >
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <p className="text-lg font-extrabold text-emerald-700">{coverage.granted}</p>
          <p className="text-[11px] text-emerald-700">{labels.active}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2">
          <p className="text-lg font-extrabold text-rose-700">{coverage.revoked}</p>
          <p className="text-[11px] text-rose-700">{labels.withdrawn}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2">
          <p className="text-lg font-extrabold text-ink-600">{coverage.none}</p>
          <p className="text-[11px] text-ink-500">{labels.none}</p>
        </div>
      </div>

      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-white text-ink-400">
            <tr>
              <th className="py-1.5 pr-2 font-semibold">Case</th>
              <th className="py-1.5 pr-2 font-semibold">{labels.statusHeading}</th>
              <th className="py-1.5 pr-2 font-semibold">{labels.grantedAt}</th>
            </tr>
          </thead>
          <tbody>
            {coverage.rows.map((row) => (
              <tr key={row.sessionId} className="border-t border-ink-100">
                <td className="py-1.5 pr-2 font-mono text-ink-600">{row.sessionId}</td>
                <td className="py-1.5 pr-2">
                  <Badge
                    className={
                      row.state === 'granted'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : row.state === 'revoked'
                          ? 'bg-rose-50 text-rose-700 ring-rose-200'
                          : 'bg-ink-100 text-ink-500 ring-ink-200'
                    }
                    icon={
                      row.state === 'granted' ? (
                        <BadgeCheck size={11} />
                      ) : row.state === 'revoked' ? (
                        <ShieldAlert size={11} />
                      ) : (
                        <ShieldQuestion size={11} />
                      )
                    }
                  >
                    {row.state === 'granted' ? labels.active : row.state === 'revoked' ? labels.withdrawn : labels.none}
                  </Badge>
                </td>
                <td className="py-1.5 pr-2 text-ink-500">{row.grantedAt ? formatAuditTime(row.grantedAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
