/** Horizontal mini-timeline (P2-18-L) — rendered on queue cards and CaseDetail header. */

import { Badge } from '../ui'

type TimelineEventType = 'symptom-onset' | 'symptom-change' | 'past-medical-event' | 'current-state' | 'report' | 'visual' | 'follow-up-answer' | 'clinician-note' | 'other'

type TimelineEvent = {
  eventId: string
  eventType: TimelineEventType
  eventText: string
  timeExpression?: string
  normalizedTime?: { kind: 'absolute' | 'relative' | 'unknown'; iso?: string; daysFromIntake?: number; hoursFromIntake?: number }
}

function eventDotClasses(eventType: TimelineEventType): string {
  switch (eventType) {
    case 'symptom-onset':
    case 'symptom-change':
    case 'current-state':
      return 'bg-rose-500'
    case 'past-medical-event':
      return 'bg-amber-500'
    case 'report':
    case 'visual':
      return 'bg-brand-500'
    default:
      return 'bg-ink-500'
  }
}

export default function TimelineMiniBar({
  events,
}: {
  events: TimelineEvent[]
}) {
  const hasTime = events.some((e) => e.normalizedTime && e.normalizedTime.kind !== 'unknown')

  return (
    <div className="flex items-center gap-2 min-w-[120px] px-3 py-1.5 text-[10px] text-ink-500 border-l border-ink-200 bg-ink-50/30">
      {events.map((event) => {
        const dotClasses = eventDotClasses(event.eventType)
        return (
          <Badge key={event.eventId} className={dotClasses}>
            •
          </Badge>
        )
      })}
      {events.length > 0 && !hasTime && (
        <span className="text-ink-400 opacity-60">—</span>
      )}
    </div>
  )
}