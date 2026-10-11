import { Link } from 'react-router-dom'
import { FileText, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Badge } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { ConsentRecord } from '../../types/retention.types'

export function PatientConsentList({ records }: { records: ConsentRecord[] }) {
  const { language } = useTriage()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  if (records.length === 0) {
    return <p className="text-xs text-ink-400">{labels.none}</p>
  }

  return (
    <ul className="space-y-2">
      {records.map((record) => {
        const revoked = Boolean(record.revokedAt)
        return (
          <li
            key={record.consentRecordId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <Link to={`/app/cases/${record.sessionId}`} className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
                <FileText size={13} /> {record.sessionId}
              </Link>
              <p className="mt-0.5 text-[11px] text-ink-400">
                {labels.grantedAt} {formatAuditTime(record.grantedAt)} · {labels.policyVersion} {record.policyVersion}
              </p>
            </div>
            <Badge
              className={revoked ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}
              icon={revoked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
            >
              {revoked ? labels.withdrawn : labels.active}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
