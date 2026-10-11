/**
 * Human-in-the-loop editor for a session timeline (P0-4).
 *
 * Clinician-entered text runs through the backend's non-diagnostic guard
 * (`assertTimelineTextSafe`) — the saved copy here notes that so an unexpected
 * 400 (whose message is the guard error) is explained, not swallowed. Any add
 * or edit flips the timeline to `human-edited`; only "accept" moves it to
 * `accepted`.
 *
 * Time entry is deliberately conservative: a clinician can give a relative
 * "days before intake", keep an existing absolute time, or mark the time as
 * not stated. The system never guesses or invents a calendar date.
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button, Modal } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { EVENT_TYPE_LABELS, TIME_PRECISION_LABELS } from './TimelineView'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import type { PatientSession } from '../../types/triage'
import type {
  NormalizedTime,
  TimelineEvent,
  TimelineEventType,
  TimelineLanguage,
  TimePrecision,
} from '../../types/timeline.types'

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as TimelineEventType[]
const PRECISIONS: Array<{ value: TimePrecision; label: string }> = [
  { value: 'exact', label: TIME_PRECISION_LABELS.exact },
  { value: 'approximate', label: TIME_PRECISION_LABELS.approximate },
  { value: 'relative', label: TIME_PRECISION_LABELS.relative },
  { value: 'unknown', label: TIME_PRECISION_LABELS.unknown },
]

/** Build a normalizedTime from a "days before intake" input (never invents dates). */
export function relativeNormalizedTime(days: string, precision: TimePrecision): NormalizedTime | null {
  if (precision === 'unknown') return null
  const n = Number(days)
  if (days.trim() === '' || !Number.isFinite(n)) return null
  return { kind: 'relative', daysFromIntake: Math.round(n) }
}

function guardHint() {
  return (
    <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
      Human-entered event text is checked against the non-diagnostic guard. Keep the patient&apos;s own words — the
      timeline organises events; it never diagnoses.
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Add a clinician event                                              */
/* ------------------------------------------------------------------ */

export function AddTimelineEventModal({
  session,
  open,
  onClose,
}: {
  session: PatientSession
  open: boolean
  onClose: () => void
}) {
  const { addTimelineEvent } = useTriage()
  const fallbackLang: TimelineLanguage = session.triageNote?.language ?? 'en'
  const [eventText, setEventText] = useState('')
  const [eventType, setEventType] = useState<TimelineEventType>('clinician-note')
  const [eventTextLanguage, setEventTextLanguage] = useState<TimelineLanguage>(fallbackLang)
  const [timeExpression, setTimeExpression] = useState('')
  const [precision, setPrecision] = useState<TimePrecision>('relative')
  const [days, setDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEventText('')
    setEventType('clinician-note')
    setEventTextLanguage(fallbackLang)
    setTimeExpression('')
    setPrecision('relative')
    setDays('')
    setError(null)
  }

  const submit = async () => {
    const trimmed = eventText.trim()
    if (!trimmed) {
      setError('Event text is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const timeline = await addTimelineEvent(session.id, {
        eventText: trimmed,
        eventTextLanguage,
        eventType,
        timeExpression: timeExpression.trim().slice(0, 200),
        normalizedTime: relativeNormalizedTime(days, precision),
        timePrecision: precision,
      })
      if (!timeline) {
        setError('Timeline not built yet. Build it first.')
      } else {
        reset()
        onClose()
      }
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.includes('non-diagnostic safeguard')
            ? `${e.message} Rephrase it to report the event as it was told.`
            : e.message
          : 'The event could not be added.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add timeline event (clinician note)">
      <div className="space-y-4">
        <div>
          <label htmlFor="tl-event-text" className="mb-1.5 block text-xs font-bold text-ink-700">
            Event text <span className="font-normal text-ink-400">(verbatim, anonymized)</span>
          </label>
          <textarea
            id="tl-event-text"
            value={eventText}
            onChange={(e) => setEventText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder='e.g., "fever reduced today", "patient reports pain since last night"'
            className="w-full rounded-xl border border-ink-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tl-event-time-expr" className="mb-1.5 block text-xs font-bold text-ink-700">
              Time expression <span className="font-normal text-ink-400">(as said)</span>
            </label>
            <input
              id="tl-event-time-expr"
              value={timeExpression}
              onChange={(e) => setTimeExpression(e.target.value)}
              maxLength={200}
              placeholder="e.g. 2 days before intake"
              className="inp"
            />
          </div>
          <div>
            <label htmlFor="tl-event-precision" className="mb-1.5 block text-xs font-bold text-ink-700">
              Time precision
            </label>
            <select
              id="tl-event-precision"
              value={precision}
              onChange={(e) => setPrecision(e.target.value as TimePrecision)}
              className="inp min-h-[40px]"
            >
              {PRECISIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {precision !== 'unknown' && (
          <div>
            <label htmlFor="tl-event-days" className="mb-1.5 block text-xs font-bold text-ink-700">
              Days before intake
            </label>
            <input
              id="tl-event-days"
              type="number"
              min={0}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="0 = intake day"
              className="inp"
            />
            <p className="mt-1 text-[11px] text-ink-400">
              Kept as relative — the system never guesses an absolute calendar date.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tl-event-type" className="mb-1.5 block text-xs font-bold text-ink-700">
              Event type
            </label>
            <select
              id="tl-event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as TimelineEventType)}
              className="inp min-h-[40px]"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tl-event-lang" className="mb-1.5 block text-xs font-bold text-ink-700">
              Language
            </label>
            <select
              id="tl-event-lang"
              value={eventTextLanguage}
              onChange={(e) => setEventTextLanguage(e.target.value as TimelineLanguage)}
              className="inp min-h-[40px]"
            >
              {(Object.keys(LANGUAGE_NATIVE_LABEL) as TimelineLanguage[]).map((c) => (
                <option key={c} value={c}>
                  {LANGUAGE_NATIVE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        {guardHint()}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {saving ? 'Saving…' : 'Add event'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit an existing event                                             */
/* ------------------------------------------------------------------ */

export function EditTimelineEventModal({
  session,
  event,
  open,
  onClose,
}: {
  session: PatientSession
  event: TimelineEvent | null
  open: boolean
  onClose: () => void
}) {
  const { editTimelineEvent } = useTriage()
  const [eventText, setEventText] = useState('')
  const [eventType, setEventType] = useState<TimelineEventType>('other')
  const [eventTextLanguage, setEventTextLanguage] = useState<TimelineLanguage>('en')
  const [timeExpression, setTimeExpression] = useState('')
  const [timeMode, setTimeMode] = useState<'keep' | 'relative' | 'unknown'>('keep')
  const [days, setDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingDays = (() => {
    const nt = event?.normalizedTime
    return nt && nt.kind === 'relative' ? String(nt.daysFromIntake) : ''
  })()
  const isOpen = open && !!event

  const start = () => {
    if (!event) return
    setEventText(event.eventText)
    setEventType(event.eventType)
    setEventTextLanguage(event.eventTextLanguage)
    setTimeExpression(event.timeExpression)
    setTimeMode(event.normalizedTime ? 'keep' : 'unknown')
    setDays(existingDays)
    setError(null)
  }

  useEffect(() => {
    if (isOpen) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.eventId, isOpen])

  const submit = async () => {
    if (!event) return
    const trimmed = eventText.trim()
    if (!trimmed) {
      setError('Event text is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const timeline = await editTimelineEvent(session.id, event.eventId, {
        eventText: trimmed,
        eventTextLanguage,
        eventType,
        timeExpression: timeExpression.trim().slice(0, 200),
        ...(timeMode === 'relative'
          ? { normalizedTime: relativeNormalizedTime(days, 'relative'), timePrecision: 'relative' as const }
          : timeMode === 'unknown'
            ? { normalizedTime: null as NormalizedTime | null, timePrecision: 'unknown' as const }
            : {}),
      })
      if (!timeline) {
        setError('Timeline event not found.')
      } else {
        onClose()
      }
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.includes('non-diagnostic safeguard')
            ? `${e.message} Rephrase it to report the event as it was told.`
            : e.message
          : 'The event could not be updated.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title={`Edit event${event ? ` — ${event.eventId}` : ''}`}>
      {event && (
        <div className="space-y-4">
          {event.normalizedTime && 'iso' in event.normalizedTime && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-[11px] text-brand-800">
              Original absolute time was <strong>{event.normalizedTime.iso}</strong> — choosing &quot;Keep&quot; below
              preserves it as-is.
            </p>
          )}

          <div>
            <label htmlFor="tl-edit-text" className="mb-1.5 block text-xs font-bold text-ink-700">
              Event text <span className="font-normal text-ink-400">(verbatim, anonymized)</span>
            </label>
            <textarea
              id="tl-edit-text"
              value={eventText}
              onChange={(e) => setEventText(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full rounded-xl border border-ink-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tl-edit-time-expr" className="mb-1.5 block text-xs font-bold text-ink-700">
                Time expression <span className="font-normal text-ink-400">(as said)</span>
              </label>
              <input
                id="tl-edit-time-expr"
                value={timeExpression}
                onChange={(e) => setTimeExpression(e.target.value)}
                maxLength={200}
                className="inp"
              />
            </div>
            <div>
              <label htmlFor="tl-edit-time-mode" className="mb-1.5 block text-xs font-bold text-ink-700">
                Time
              </label>
              <select
                id="tl-edit-time-mode"
                value={timeMode}
                onChange={(e) => setTimeMode(e.target.value as typeof timeMode)}
                className="inp min-h-[40px]"
              >
                <option value="keep">Keep current time</option>
                <option value="relative">Relative to intake</option>
                <option value="unknown">Time not stated</option>
              </select>
            </div>
          </div>

          {timeMode === 'relative' && (
            <div>
              <label htmlFor="tl-edit-days" className="mb-1.5 block text-xs font-bold text-ink-700">
                Days before intake
              </label>
              <input
                id="tl-edit-days"
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="0 = intake day"
                className="inp"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tl-edit-type" className="mb-1.5 block text-xs font-bold text-ink-700">
                Event type
              </label>
              <select
                id="tl-edit-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as TimelineEventType)}
                className="inp min-h-[40px]"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tl-edit-lang" className="mb-1.5 block text-xs font-bold text-ink-700">
                Language
              </label>
              <select
                id="tl-edit-lang"
                value={eventTextLanguage}
                onChange={(e) => setEventTextLanguage(e.target.value as TimelineLanguage)}
                className="inp min-h-[40px]"
              >
                {(Object.keys(LANGUAGE_NATIVE_LABEL) as TimelineLanguage[]).map((c) => (
                  <option key={c} value={c}>
                    {LANGUAGE_NATIVE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}

          {guardHint()}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}