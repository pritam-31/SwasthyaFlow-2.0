import { Clock } from 'lucide-react'
import { Card, EmptyState } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS, RETENTION_TIMELINE_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { RetentionTimeline as RetentionTimelineModel } from '../../types/retentionUi.types'

export function RetentionTimeline({ timeline }: { timeline: RetentionTimelineModel }) {
  const { language } = useTriage()
  const code = CODE_BY_INTAKE_LANGUAGE[language]
  const labels = CONSENT_SECTION_LABELS[code]
  const kindLabels = RETENTION_TIMELINE_LABELS[code]

  return (
    <Card title={<>{labels.timelineHeading}</>}>
      {timeline.events.length === 0 ? (
        <EmptyState icon={<Clock size={18} />} title={labels.timelineEmpty} />
      ) : (
        <ul className="space-y-3">
          {timeline.events.map((event) => (
            <li key={event.id} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-800">{kindLabels[event.kind]}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {formatAuditTime(event.at)} · {event.actor} ({event.actorRole})
                </p>
                {event.detail && <p className="mt-0.5 text-[11px] text-ink-500">{event.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
