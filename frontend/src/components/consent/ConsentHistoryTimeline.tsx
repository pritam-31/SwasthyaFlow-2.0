import { History } from 'lucide-react'
import { EmptyState } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_EVENT_LABELS, CONSENT_REASON_LABELS, CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { ConsentHistoryEntry } from '../../types/consent.types'

export function ConsentHistoryTimeline({ events }: { events: ConsentHistoryEntry[] }) {
  const { language } = useTriage()
  const code = CODE_BY_INTAKE_LANGUAGE[language]
  const labels = CONSENT_SECTION_LABELS[code]
  const eventLabels = CONSENT_EVENT_LABELS[code]
  const reasonLabels = CONSENT_REASON_LABELS[code]

  if (events.length === 0) {
    return <EmptyState icon={<History size={18} />} title={labels.historyEmpty} />
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-800">{eventLabels[event.kind]}</p>
            <p className="mt-0.5 text-[11px] text-ink-400">
              {formatAuditTime(event.at)} · {event.actor} ({event.actorRole}) · {labels.policyVersion} {event.policyVersion}
            </p>
            {event.reasonCode && (
              <p className="mt-0.5 text-[11px] text-ink-500">
                {labels.reason}: {reasonLabels[event.reasonCode]}
                {event.reasonText ? ` — ${event.reasonText}` : ''}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
