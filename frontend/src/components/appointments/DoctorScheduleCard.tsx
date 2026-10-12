import { CalendarClock, CalendarPlus, Clock3, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge, Button, Card, cx, InfoBanner, Modal } from '../ui'
import { formatHumanDate } from '../../lib/appointmentDate'
import type { AvailabilityKind, AvailabilityWindow, DoctorProfile } from '../../types/appointment.types'
import * as api from '../../services/appointmentApi'

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const WINDOW_LABEL: Record<AvailabilityKind, string> = {
  weekly: 'Weekly',
  date: 'Date override',
}

function windowSummary(w: AvailabilityWindow): string {
  if (w.leave) return 'On leave'
  const times = `${w.startTime} – ${w.endTime}`
  const withBreaks =
    w.breakStart && w.breakEnd ? ` · break ${w.breakStart}–${w.breakEnd}` : ''
  const cap = w.maxAppointmentsPerDay ? ` · max ${w.maxAppointmentsPerDay}/day` : ''
  return `${times} · ${w.durationMinutes} min slots${withBreaks}${cap}`
}

/** Signed-in doctor's own availability schedule with a compact editor. */
export function DoctorScheduleCard({
  doctor,
  schedule,
  onChange,
}: {
  doctor: DoctorProfile | null
  schedule: AvailabilityWindow[] | null
  onChange: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removeBusy, setRemoveBusy] = useState<string | null>(null)

  const [form, setForm] = useState({
    kind: 'weekly' as AvailabilityKind,
    dayOfWeek: 1,
    date: '',
    leave: false,
    startTime: '09:00',
    endTime: '17:00',
    durationMinutes: 30,
    maxAppointmentsPerDay: '',
  })

  if (!doctor) {
    return (
      <Card title="My schedule" subtitle="Weekly availability and date overrides.">
        <InfoBanner tone="amber">
          You don't have a doctor profile at this facility yet — ask an administrator to link one so patients can book
          with you.
        </InfoBanner>
      </Card>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await api.createAvailabilityWindow(doctor.id, {
        kind: form.kind,
        dayOfWeek: form.kind === 'weekly' ? form.dayOfWeek : undefined,
        date: form.kind === 'date' ? form.date : undefined,
        leave: form.leave,
        startTime: form.startTime,
        endTime: form.endTime,
        durationMinutes: form.durationMinutes,
        maxAppointmentsPerDay: form.maxAppointmentsPerDay ? Number(form.maxAppointmentsPerDay) : undefined,
      })
      setOpen(false)
      await onChange()
    } catch (err) {
      /* onChange pushes errors via toast */
    } finally {
      setBusy(false)
    }
  }

  const remove = async (w: AvailabilityWindow) => {
    setRemoveBusy(w.id)
    try {
      await api.deleteAvailabilityWindow(w.id)
      await onChange()
    } catch {
      /* toast handled upstream */
    } finally {
      setRemoveBusy(null)
    }
  }

  return (
    <Card
      title="My schedule"
      subtitle="Weekly windows and date overrides. Removing a window never cancels existing bookings."
      action={
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus size={14} /> Add window
        </Button>
      }
    >
      {schedule === null ? (
        <p className="py-4 text-center text-sm text-ink-400">Loading schedule…</p>
      ) : schedule.length === 0 ? (
        <InfoBanner tone="sky">
          No availability windows yet — add a weekly window so patients can see open slots and book.
        </InfoBanner>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {schedule.map((w) => (
            <li
              key={w.id}
              className={cx(
                'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3',
                w.leave ? 'border-rose-200 bg-rose-50/60' : 'border-ink-200 bg-white',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge className="bg-white text-ink-500 ring-ink-200">
                    <CalendarClock size={12} />
                    {w.kind === 'weekly' ? DAY_LABELS[w.dayOfWeek ?? 0] : formatHumanDate(w.date ?? '')}
                  </Badge>
                  {w.leave && <Badge className="bg-rose-50 text-rose-700 ring-rose-200">On leave</Badge>}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-700">
                  <Clock3 size={12} className="text-ink-400" /> {windowSummary(w)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(w)}
                disabled={removeBusy === w.id}
                title="Remove window"
                aria-label="Remove window"
                className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add availability window">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-semibold text-ink-600">
              <span>Kind</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as AvailabilityKind })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="weekly">Weekly window</option>
                <option value="date">Date override</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-semibold text-ink-600">
              <span className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={form.leave}
                  onChange={(e) => setForm({ ...form, leave: e.target.checked })}
                  className="accent-rose-500"
                />
                Leave / holiday
              </span>
              <input
                type="text"
                value={WINDOW_LABEL[form.kind]}
                readOnly
                className="w-full rounded-xl border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-400"
              />
            </label>
          </div>

          {form.kind === 'weekly' ? (
            <label className="block space-y-1 text-xs font-semibold text-ink-600">
              <span>Day of week</span>
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              >
                {DAY_LABELS.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block space-y-1 text-xs font-semibold text-ink-600">
              <span>Date</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-semibold text-ink-600">
              <span>Start</span>
              <input
                type="time"
                required
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-ink-600">
              <span>End</span>
              <input
                type="time"
                required
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-semibold text-ink-600">
              <span>Slot length (min)</span>
              <select
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              >
                {[15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-ink-600">
              <span>Max per day (optional)</span>
              <input
                type="number"
                min={1}
                placeholder="unlimited"
                value={form.maxAppointmentsPerDay}
                onChange={(e) => setForm({ ...form, maxAppointmentsPerDay: e.target.value })}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save window'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}