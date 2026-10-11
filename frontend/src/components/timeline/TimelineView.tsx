/**
 * Read-only chronological view of a session timeline (P0-4).
 *
 * One row per event: the time label (absolute/relative/unknown), the verbatim
 * anonymised text, and badges that identify the source, event type, match
 * strength and language. Chips resolve the event's related urgency flags and
 * missing-information items against the session's triage note so a staff
 * member can jump from a timeline row to the reason it was attached.
 *
 * The event text and the timeline summary are human/patient-reported strings:
 * they are rendered verbatim and never passed through the non-diagnostic
 * sanitizer (the summary's sanctioned headings contain the words "not a
 * diagnosis" by design).
 */

import { Clock3, HelpCircle, PenLine, ShieldAlert, Trash2 } from 'lucide-react'
import { Badge, Button } from '../ui'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import type { PatientSession } from '../../types/triage'
import type {
  Timeline,
  TimelineEvent,
  TimelineEventType,
  TimelineSource,
  TimePrecision,
} from '../../types/timeline.types'

export const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  'symptom-onset': 'Onset',
  'symptom-change': 'Change',
  'past-medical-event': 'Past medical',
  'current-state': 'Current state',
  report: 'Report',
  visual: 'Photo',
  'follow-up-answer': 'Follow-up',
  'clinician-note': 'Clinician note',
  other: 'Other',
}

export const SOURCE_LABELS: Record<TimelineSource, string> = {
  intake: 'Intake',
  'follow-up': 'Follow-up answer',
  report: 'Report',
  visual: 'Photo',
  clinician: 'Clinician',
}

export const TIME_PRECISION_LABELS: Record<TimePrecision, string> = {
  exact: 'Exact time',
  approximate: 'Approximate',
  relative: 'Relative',
  unknown: 'Time not stated',
}

/** Human-facing "when" label for an event (never an invented calendar date). */
export function formatTimelineTime(event: Pick<TimelineEvent, 'timeExpression' | 'normalizedTime' | 'eventType'>): string {
  const t = event.normalizedTime
  if (!t) return 'Time not stated'
  if (t.kind === 'absolute') {
    const date = t.iso.slice(0, 10)
    return event.eventType === 'report' ? `Report dated ${date}` : date
  }
  if (t.daysFromIntake === 0) {
    return t.hoursFromIntake ? `Intake day, ${t.hoursFromIntake} h in` : 'Intake day'
  }
  const days = `${t.daysFromIntake} day${t.daysFromIntake === 1 ? '' : 's'} before intake`
  return t.hoursFromIntake ? `${days}, ${t.hoursFromIntake} h` : days
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const classes =
    pct >= 80
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : pct >= 60
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-ink-100 text-ink-500 ring-ink-200'
  return (
    <Badge
      className={classes}
      icon={<span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
    >
      match {pct}%
    </Badge>
  )
}

export default function TimelineView({
  session,
  timeline,
  canEdit,
  onEditEvent,
  onDeleteEvent,
}: {
  session: PatientSession
  timeline: Timeline
  canEdit?: boolean
  onEditEvent?: (event: TimelineEvent) => void
  onDeleteEvent?: (event: TimelineEvent) => void
}) {
  const flags = session.triageNote?.urgencyFlags ?? []
  const missing = session.triageNote?.missingInformation ?? []
  return (
    <ol className="relative ml-3 space-y-4 border-l border-ink-200 pl-6">
      {timeline.events.map((event) => {
        const relatedFlags = flags.filter((f) => event.relatedUrgencyFlagIds.includes(f.id))
        const relatedMissing = missing.filter((m) => event.relatedMissingInfoIds.includes(m.id))
        return (
          <li key={event.eventId} className="relative">
            <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-brand-200 bg-white">
              <Clock3 size={10} className="text-brand-600" />
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">
                {formatTimelineTime(event)}
              </p>
              {canEdit && onEditEvent && (
                <Button size="sm" variant="ghost" className="!px-1.5 !py-0.5" onClick={() => onEditEvent(event)}>
                  <PenLine size={12} /> Edit
                </Button>
              )}
              {canEdit && onDeleteEvent && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="!px-1.5 !py-0.5 text-rose-600 hover:bg-rose-50"
                  onClick={() => onDeleteEvent(event)}
                >
                  <Trash2 size={12} /> Delete
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-800">{event.eventText}</p>
            {event.timeExpression && (
              <p className="mt-0.5 text-[11px] italic text-ink-400">
                “{event.timeExpression}” {event.timeExpression === formatTimelineTime(event) ? '' : `· ${TIME_PRECISION_LABELS[event.timePrecision].toLowerCase()}`}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge className="bg-white text-ink-600 ring-ink-200">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
              <Badge className="bg-white text-ink-600 ring-ink-200">{SOURCE_LABELS[event.source]}</Badge>
              <Badge className="bg-white text-ink-500 ring-ink-200">{LANGUAGE_NATIVE_LABEL[event.eventTextLanguage]}</Badge>
              <ConfidenceBadge confidence={event.confidence} />
            </div>
            {relatedFlags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {relatedFlags.map((f) => (
                  <Badge
                    key={f.id}
                    className={
                      f.severity === 'red'
                        ? 'bg-rose-50 text-rose-700 ring-rose-200'
                        : 'bg-amber-50 text-amber-700 ring-amber-200'
                    }
                    icon={<ShieldAlert size={11} />}
                  >
                    {f.label}
                  </Badge>
                ))}
              </div>
            )}
            {relatedMissing.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {relatedMissing.map((m) => (
                  <Badge key={m.id} className="bg-sky-50 text-sky-700 ring-sky-200" icon={<HelpCircle size={11} />}>
                    Missing: {m.field}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        )
      })}
      {timeline.events.length === 0 && (
        <li className="text-sm text-ink-500">No events to display yet.</li>
      )}
    </ol>
  )
}