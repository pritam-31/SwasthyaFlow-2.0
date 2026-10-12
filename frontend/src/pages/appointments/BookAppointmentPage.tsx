import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, cx, InfoBanner, PageHeader } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatHumanDate, formatHumanTime, todayISO } from '../../lib/appointmentDate'
import { useApp } from '../../store/AppStore'
import type { Role } from '../../types'
import type {
  AppointmentPriority,
  ConsultationType,
  Department,
  DoctorProfile,
  OpenSlot,
} from '../../types/appointment.types'
import { CONSULTATION_TYPES, CONSULTATION_TYPE_LABEL } from '../../types/appointment.types'
import * as api from '../../services/appointmentApi'

const STAFF: Role[] = ['nurse', 'doctor', 'admin', 'facility-admin', 'system-admin']

const STEP_LABELS = ['Doctor', 'Date & time', 'Details']

/** Multi-step direct-booking wizard for patients and staff. */
export default function BookAppointmentPage() {
  const { role, pushToast } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isStaff = STAFF.includes(role)

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null)
  const [deptId, setDeptId] = useState('')

  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [slotTime, setSlotTime] = useState('')

  const [reason, setReason] = useState('')
  const [consultationType, setConsultationType] = useState<ConsultationType>('general')
  const [priority, setPriority] = useState<AppointmentPriority>('routine')
  const [patientId, setPatientId] = useState('')
  const [patientName, setPatientName] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([api.fetchDepartments(), api.fetchDoctors()])
      .then(([d, docs]) => {
        if (cancelled) return
        setDepartments(d.departments)
        setDoctors(docs.doctors)
      })
      .catch((err) => {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Could not load clinic directory.')
      })
    return () => {
      cancelled = true
    }
  }, [pushToast])

  const filteredDoctors = useMemo(() => {
    if (!doctors) return []
    return doctors.filter((d) => d.active && (!deptId || d.departmentId === deptId))
  }, [doctors, deptId])

  const selectedDoctor = useMemo(() => doctors?.find((d) => d.id === doctorId) ?? null, [doctors, doctorId])

  const pickNextAvailable = async () => {
    if (!doctorId) return
    setBusy(true)
    setSlotsError(null)
    try {
      const { availability } = await api.fetchNextAvailable(doctorId, todayISO())
      if (!availability) {
        setSlotsError('This doctor has no open slots in the next 30 days.')
        return
      }
      setDate(availability.date)
      const { slots: open } = await api.fetchSlots(doctorId, availability.date)
      setSlots(open)
      setSlotTime(availability.slot?.time ?? open[0]?.time ?? '')
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Could not find the next available slot.')
    } finally {
      setBusy(false)
    }
  }

  const pickDate = async (value: string) => {
    setDate(value)
    setSlotTime('')
    setSlots(null)
    setSlotsError(null)
    if (!doctorId || !value) return
    setBusy(true)
    try {
      const res = await api.fetchSlots(doctorId, value)
      setSlots(res.slots)
      if (res.slots.length === 0) setSlotsError('No open slots on this date for this doctor.')
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Could not load open slots.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!doctorId || !date || !slotTime) {
      pushToast('warning', 'Pick a doctor, date and time first.')
      return
    }
    const reasonText = reason.trim()
    if (reasonText.length < 3) {
      pushToast('warning', 'Please describe the reason for the visit (at least 3 characters).')
      return
    }
    if (isStaff && (!patientId.trim() || !patientName.trim())) {
      pushToast('warning', 'Enter the patient account id and display name for this booking.')
      return
    }
    setBusy(true)
    try {
      const { appointment } = await api.bookAppointment({
        doctorId,
        departmentId: deptId || undefined,
        appointmentDate: date,
        startTime: slotTime,
        visitReason: reasonText,
        consultationType,
        ...(isStaff ? { priority } : {}),
        patientId: isStaff ? patientId.trim().toLowerCase() : undefined,
        patientName: isStaff ? patientName.trim() : undefined,
      })
      pushToast('success', `${appointment.bookingReference} submitted — awaiting clinic confirmation.`)
      navigate(`/app/appointments/${appointment.id}`)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not submit the booking.')
    } finally {
      setBusy(false)
    }
  }

  const okToAdvance = () => {
    if (step === 0) return Boolean(doctorId)
    if (step === 1) return Boolean(slotTime)
    return true
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Direct booking"
        title="Book an appointment"
        subtitle="Pick a doctor and an open slot, describe your visit, and the clinic will confirm. Direct bookings start as ‘Pending review’."
        icon={<CalendarPlus size={20} />}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/appointments')}>
            <ChevronLeft size={15} /> Back to appointments
          </Button>
        }
      />

      <ol className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={i < step ? () => setStep(i) : undefined}
              className={cx(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ring-1 ring-inset transition-colors',
                i === step
                  ? 'bg-brand-600 text-white ring-brand-700'
                  : i < step
                    ? 'bg-emerald-500 text-white ring-emerald-600'
                    : 'bg-white text-ink-400 ring-ink-200',
              )}
            >
              {i < step ? '✓' : i + 1}
            </button>
            <span className={cx('text-xs font-bold', i === step ? 'text-ink-900' : 'text-ink-400')}>{label}</span>
            {i < STEP_LABELS.length - 1 && <span className="h-px flex-1 bg-ink-200" />}
          </li>
        ))}
      </ol>

      <Card className="!p-6">
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-semibold text-ink-600">
                <span>Department (optional)</span>
                <select
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">All departments</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-xs font-semibold text-ink-600">
                <span>Doctor</span>
                <select
                  value={doctorId}
                  onChange={(e) => {
                    setDoctorId(e.target.value)
                    setDate('')
                    setSlots(null)
                    setSlotTime('')
                  }}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">Select a doctor</option>
                  {filteredDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.specialization}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedDoctor && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-sm text-ink-700">
                <p className="font-extrabold text-ink-900">{selectedDoctor.name}</p>
                <p className="mt-0.5 text-xs">
                  {selectedDoctor.specialization}
                  {selectedDoctor.experienceYears ? ` · ${selectedDoctor.experienceYears} years experience` : ''}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">{CONSULTATION_TYPE_LABEL[selectedDoctor.consultationType]}</p>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1 text-xs font-semibold text-ink-600">
                <span>Date</span>
                <input
                  type="date"
                  min={todayISO()}
                  value={date}
                  onChange={(e) => pickDate(e.target.value)}
                  className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
              <Button variant="secondary" size="sm" onClick={pickNextAvailable} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Jump to next open slot
              </Button>
            </div>

            {date && slots && slots.length > 0 && (
              <>
                <p className="text-xs font-bold text-ink-500">{formatHumanDate(date)} — pick a time</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setSlotTime(s.time)}
                      className={cx(
                        'rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors',
                        slotTime === s.time
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300',
                      )}
                    >
                      {formatHumanTime(s.time)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {slotsError && <InfoBanner tone="rose">{slotsError}</InfoBanner>}
          </div>
        )}

        {step === 2 && (
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-semibold text-ink-600 sm:col-span-2">
                <span>Reason for the visit</span>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What brings you in today? This helps the clinic prepare — it is not a diagnosis."
                  className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-ink-600">
                <span>Visit type</span>
                <select
                  value={consultationType}
                  onChange={(e) => setConsultationType(e.target.value as ConsultationType)}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {CONSULTATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CONSULTATION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>

              {isStaff && (
                <label className="block space-y-1 text-xs font-semibold text-ink-600">
                  <span>Priority (staff only)</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as AppointmentPriority)}
                    className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="routine">Routine</option>
                    <option value="staff-review">Needs staff review</option>
                    <option value="urgent-escalation">Prompt escalation</option>
                  </select>
                </label>
              )}
            </div>

            {isStaff ? (
              <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                <p className="text-xs font-bold text-ink-600 sm:col-span-2">Booking for another patient</p>
                <label className="block space-y-1 text-xs font-semibold text-ink-600">
                  <span>Patient account id</span>
                  <input
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="e.g. user-patient-demo"
                    className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-ink-600">
                  <span>Display name</span>
                  <input
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </label>
              </div>
            ) : (
              <InfoBanner tone="brand">
                <span className="flex items-center gap-1.5 font-bold">
                  <UserRound size={13} /> Booking for: {user?.displayName ?? 'you'}
                </span>
                The booking is automatically linked to your account.
              </InfoBanner>
            )}

            <div className="rounded-xl border border-ink-200 bg-white p-4 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-ink-700">
                <span className="font-extrabold text-ink-900">{selectedDoctor?.name}</span>
                <span className="text-ink-400">·</span>
                {date ? formatHumanDate(date) : 'No date'}
                {slotTime ? ` at ${formatHumanTime(slotTime)}` : ''}
                {reason.trim() ? <span className="text-ink-400">· {reason.trim()}</span> : null}
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={15} />}
                {busy ? 'Submitting…' : 'Submit booking request'}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-5">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={14} /> Back
          </Button>
          {step < 2 && (
            <Button variant="primary" size="sm" onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={!okToAdvance()}>
              Continue <ChevronRight size={14} />
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}