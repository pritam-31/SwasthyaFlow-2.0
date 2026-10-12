import type { GridColDef } from '@mui/x-data-grid-pro'
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppDataGrid } from '../../components/AppDataGrid'
import { Badge, Button, Card, cx, InfoBanner, Modal, PageHeader, Skeleton } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { buildAppointmentLetterHtml, openPrintWindow } from '../../lib/appointmentLetter'
import { formatHumanDate, formatHumanTime, todayISO } from '../../lib/appointmentDate'
import * as api from '../../services/appointmentApi'
import { useApp } from '../../store/AppStore'
import type { Role } from '../../types'
import type {
  Appointment,
  AppointmentAuditEntry,
  AppointmentStatus,
  OpenSlot,
} from '../../types/appointment.types'
import {
  APPOINTMENT_STATUS_META,
  CONSULTATION_TYPE_LABEL,
  PRIORITY_META,
} from '../../types/appointment.types'

const STAFF: Role[] = ['nurse', 'doctor', 'admin', 'facility-admin', 'system-admin']
const MGMT: Role[] = ['admin', 'facility-admin', 'system-admin']

const ACTIVE_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'checked_in']

/** Appointment detail with staff workflow + audit trail. */
export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { role, pushToast } = useApp()
  const { facilities } = useAuth()
  const navigate = useNavigate()

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [audit, setAudit] = useState<AppointmentAuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [reasonModal, setReasonModal] = useState<'cancel' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlots, setRescheduleSlots] = useState<OpenSlot[] | null>(null)
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')

  const reload = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const [{ appointment: a }, { audit: trail }] = await Promise.all([
        api.fetchAppointment(id),
        api.fetchAppointmentAudit(id),
      ])
      setAppointment(a)
      setAudit(trail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the appointment.')
    }
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (error) setAppointment(null)
  }, [error])

  const run = async (name: string, action: () => Promise<void>) => {
    if (busyAction) return
    setBusyAction(name)
    try {
      await action()
      await reload()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusyAction(null)
      setReasonModal(null)
      setReason('')
    }
  }

  const loadRescheduleSlots = async (date: string) => {
    if (!appointment) return
    setRescheduleSlots(null)
    setRescheduleTime('')
    if (!date) return
    try {
      const res = await api.fetchSlots(appointment.doctorId, date)
      setRescheduleSlots(res.slots)
      if (res.slots.length === 0) pushToast('info', 'No open slots for this doctor on that date.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not load slots.')
    }
  }

  const submitTransition = (status: AppointmentStatus) => async () => {
    if (!appointment) return
    await run(status, async () => {
      const { appointment: updated } = await api.transitionAppointment(appointment.id, status, reason.trim() || undefined)
      pushToast('success', `${updated.bookingReference} is now "${APPOINTMENT_STATUS_META[status].label}".`)
    })
  }

  const submitReasonAction = async (e: FormEvent) => {
    e.preventDefault()
    if (!appointment || !reasonModal) return
    if (reason.trim().length < 3) {
      pushToast('warning', 'A short reason is required for this action.')
      return
    }
    if (reasonModal === 'cancel') {
      await run('cancel', async () => {
        const { appointment: updated } = await api.cancelAppointment(appointment.id, reason.trim())
        pushToast('success', `${updated.bookingReference} cancelled.`)
      })
    } else {
      await run('reject', async () => {
        const { appointment: updated } = await api.transitionAppointment(appointment.id, 'rejected', reason.trim())
        pushToast('success', `${updated.bookingReference} rejected.`)
      })
    }
  }

  const submitReschedule = async (e: FormEvent) => {
    e.preventDefault()
    if (!appointment || !rescheduleDate || !rescheduleTime) {
      pushToast('warning', 'Pick a new date and time for the change.')
      return
    }
    await run('reschedule', async () => {
      const { appointment: updated } = await api.requestReschedule(appointment.id, {
        requestedDate: rescheduleDate,
        requestedStartTime: rescheduleTime,
        reason: rescheduleReason.trim() || undefined,
      })
      pushToast('success', `${updated.bookingReference} change requested — needs clinic approval.`)
      setRescheduleOpen(false)
    })
  }

  const decideReschedule = (approved: boolean) => async () => {
    if (!appointment?.rescheduleRequest) return
    await run('reschedule-decision', async () => {
      await api.decideReschedule(appointment.id, {
        approved,
        requestedDate: appointment.rescheduleRequest?.requestedDate,
        requestedStartTime: appointment.rescheduleRequest?.requestedStartTime,
        reason: approved ? undefined : reason.trim() || 'Request declined by clinic.',
      })
      pushToast('success', approved ? 'Reschedule approved.' : 'Reschedule request declined.')
      setReason('')
    })
  }

  const remove = async () => {
    if (!appointment) return
    await run('delete', async () => {
      await api.deleteAppointment(appointment.id)
      pushToast('success', `${appointment.bookingReference} deleted.`)
      navigate('/app/appointments')
    })
  }

  const isStaff = STAFF.includes(role)
  const isActive = appointment ? ACTIVE_STATUSES.includes(appointment.status) : false
  const canReschedule = appointment ? ['pending', 'confirmed', 'rescheduled'].includes(appointment.status) && isActive : false

  const actionButton = (label: string, status: AppointmentStatus, variant: 'primary' | 'danger' | 'success' | 'secondary' = 'primary', busyName?: string) => (
    <Button
      variant={variant}
      size="sm"
      disabled={busyAction !== null}
      onClick={submitTransition(status)}
    >
      {busyAction === (busyName ?? status) ? <Loader2 size={14} className="animate-spin" /> : null}
      {label}
    </Button>
  )

  const auditColumns = useMemo<GridColDef<AppointmentAuditEntry>[]>(
    () => [
      {
        field: 'at',
        headerName: 'When',
        width: 170,
        renderCell: (p) => <span className="text-ink-700">{new Date(p.row.at).toLocaleString('en-IN')}</span>,
      },
      {
        field: 'action',
        headerName: 'Action',
        width: 210,
        renderCell: (p) => <span className="font-mono text-xs font-semibold text-ink-700">{p.row.action}</span>,
      },
      { field: 'actor', headerName: 'By', width: 160, renderCell: (p) => <span className="text-ink-700">{p.row.actor}</span> },
      {
        field: 'statusChange',
        headerName: 'Change',
        width: 190,
        renderCell: (p) => (
          <span className="text-xs">
            {p.row.previousStatus ? (
              <>
                <Badge className={APPOINTMENT_STATUS_META[p.row.previousStatus].classes}>{p.row.previousStatus}</Badge>
                <span className="mx-1 text-ink-300">→</span>
              </>
            ) : null}
            <Badge className={APPOINTMENT_STATUS_META[p.row.newStatus].classes}>{p.row.newStatus}</Badge>
          </span>
        ),
      },
      {
        field: 'reason',
        headerName: 'Reason',
        flex: 1,
        minWidth: 160,
        renderCell: (p) => <span className="text-ink-500">{p.row.reason ?? '—'}</span>,
      },
    ],
    [],
  )

  if (appointment === null) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Appointment" title="Appointment detail" />
        {error ? (
          <InfoBanner tone="rose">{error}</InfoBanner>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
      </div>
    )
  }

  const a = appointment

  const facilityLabel =
    facilities.find((f) => f.id === a.facilityId)?.name ?? 'SwasthyaFlow Health & Wellness Centre'

  const printLetter = () => {
    const ok = openPrintWindow(buildAppointmentLetterHtml(a, facilityLabel))
    if (ok) pushToast('info', 'Print dialog opened — print the letter or save it as a PDF.')
    else pushToast('warning', 'Pop-ups are blocked — allow pop-ups to download the appointment letter.')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow={`${a.bookingMode === 'triage' ? 'Triage-linked' : 'Direct'} booking · ${a.bookingReference}`}
        title={a.patientName}
        subtitle={`${formatHumanDate(a.appointmentDate)} at ${formatHumanTime(a.startTime)} · ${a.doctorName} · ${a.departmentName}`}
        icon={<CalendarClock size={20} />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={printLetter}>
              <Download size={15} /> Appointment letter
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/app/appointments')}>
              <ChevronLeft size={15} /> Appointments
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={APPOINTMENT_STATUS_META[a.status].classes}>
          <span className={cx('h-1.5 w-1.5 rounded-full', APPOINTMENT_STATUS_META[a.status].dot)} />
          {APPOINTMENT_STATUS_META[a.status].label}
        </Badge>
        <Badge className={PRIORITY_META[a.priority].classes}>
          <span className={cx('h-1.5 w-1.5 rounded-full', PRIORITY_META[a.priority].dot)} />
          {PRIORITY_META[a.priority].label}
        </Badge>
        <Badge className="bg-white text-ink-500 ring-ink-200">{CONSULTATION_TYPE_LABEL[a.consultationType]}</Badge>
      </div>

      <Card title="Visit details" subtitle="Created by clinical staff stays human-verified — no automated decisions.">
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ['Booking reference', a.bookingReference],
            ['Patient', a.patientName],
            ['Doctor', a.doctorName],
            ['Department', a.departmentName],
            ['Date', formatHumanDate(a.appointmentDate)],
            ['Start time', formatHumanTime(a.startTime)],
            ['Duration', `${a.durationMinutes} minutes`],
            ['End time', formatHumanTime(a.endTime)],
            ['Booked by', `${a.createdBy} (${a.createdByRole})`],
            ['Visit type', CONSULTATION_TYPE_LABEL[a.consultationType]],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-ink-200 bg-white px-4 py-3">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</dt>
              <dd className="mt-0.5 text-sm font-bold text-ink-800">{value}</dd>
            </div>
          ))}
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3 sm:col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Reason for visit</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-ink-700">{a.visitReason}</dd>
          </div>
          {a.cancellationReason ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-rose-500">Cancellation reason</dt>
              <dd className="mt-0.5 text-sm text-rose-800">{a.cancellationReason}</dd>
            </div>
          ) : null}
          {a.rescheduleRequest ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-sky-500">Pending change request</dt>
              <dd className="mt-0.5 text-sm text-sky-800">
                To {formatHumanDate(a.rescheduleRequest.requestedDate ?? '')} at{' '}
                {formatHumanTime(a.rescheduleRequest.requestedStartTime ?? '')}
                {a.rescheduleRequest.reason ? ` — ${a.rescheduleRequest.reason}` : ''} (requested by{' '}
                {a.rescheduleRequest.requestedBy})
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {isActive && (
        <Card title="Actions" subtitle="Changes are recorded in the audit trail for accountability.">
          <div className="flex flex-wrap gap-2">
            {a.status === 'pending' && isStaff && (
              <>
                {actionButton('Confirm booking', 'confirmed', 'success')}
                <Button variant="danger" size="sm" disabled={busyAction !== null} onClick={() => setReasonModal('reject')}>
                  Reject booking
                </Button>
              </>
            )}
            {(a.status === 'confirmed' || a.status === 'rescheduled') && isStaff && (
              <>
                {actionButton('Check in', 'checked_in', 'primary')}
                {actionButton('Mark no-show', 'no_show', 'secondary')}
              </>
            )}
            {a.status === 'checked_in' && isStaff && actionButton('Complete visit', 'completed', 'success')}
            {a.status === 'reschedule_requested' && isStaff && a.rescheduleRequest && (
              <>
                <Button variant="success" size="sm" disabled={busyAction !== null} onClick={decideReschedule(true)}>
                  {busyAction === 'reschedule-decision' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Approve change
                </Button>
                <Button variant="danger" size="sm" disabled={busyAction !== null} onClick={decideReschedule(false)}>
                  Decline change
                </Button>
              </>
            )}
            {isStaff || role === 'patient' ? (
              <Button variant="danger" size="sm" disabled={busyAction !== null} onClick={() => setReasonModal('cancel')}>
                Cancel appointment
              </Button>
            ) : null}
            {canReschedule && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busyAction !== null}
                onClick={() => setRescheduleOpen(true)}
              >
                <CalendarCheck2 size={14} /> Request a change
              </Button>
            )}
          </div>

          <InfoBanner tone="amber">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={13} /> Reschedule changes and cancellations are only applied after clinic approval —
              a patient never changes the schedule on their own.
            </span>
          </InfoBanner>
        </Card>
      )}

      {audit && (
        <Card title="Audit trail" subtitle="Every status change and its human actor.">
          <AppDataGrid<AppointmentAuditEntry>
            rows={audit}
            columns={auditColumns}
            ariaLabel="Appointment audit trail"
            getRowId={(r) => r.id}
            hideToolbar
            hideFooter
            defaultDensity="compact"
            emptyTitle="No audit entries yet"
          />
        </Card>
      )}

      {MGMT.includes(role) && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" disabled={busyAction !== null} onClick={remove}>
            <Trash2 size={14} /> Delete appointment
          </Button>
        </div>
      )}

      <Modal open={reasonModal !== null} onClose={() => setReasonModal(null)} title={reasonModal === 'cancel' ? 'Cancel appointment' : 'Reject booking'}>
        <form onSubmit={submitReasonAction} className="space-y-4">
          <p className="text-sm text-ink-600">
            {reasonModal === 'cancel'
              ? 'Explain why this appointment is being cancelled. The patient is notified immediately.'
              : 'Explain why this booking is being rejected. The patient is notified immediately.'}
          </p>
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — a short, clear explanation."
            className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReasonModal(null)}>
              Keep appointment
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={busyAction !== null}>
              {busyAction ? <Loader2 size={14} className="animate-spin" /> : null} Confirm
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Request a change of time">
        <form onSubmit={submitReschedule} className="space-y-4">
          <p className="text-sm text-ink-600">
            The new time stays ‘pending clinic approval’ until a doctor or nurse confirms it.
          </p>
          <div className="space-y-3">
            <label className="block space-y-1 text-xs font-semibold text-ink-600">
              <span>New date</span>
              <input
                type="date"
                min={todayISO()}
                value={rescheduleDate}
                onChange={(e) => {
                  setRescheduleDate(e.target.value)
                  void loadRescheduleSlots(e.target.value)
                }}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            {rescheduleSlots && rescheduleSlots.length > 0 && (
              <label className="block space-y-1 text-xs font-semibold text-ink-600">
                <span>New time slot</span>
                <div className="flex flex-wrap gap-1.5">
                  {rescheduleSlots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setRescheduleTime(s.time)}
                      className={cx(
                        'rounded-xl border px-2.5 py-2 text-sm font-bold transition-colors',
                        rescheduleTime === s.time
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300',
                      )}
                    >
                      {formatHumanTime(s.time)}
                    </button>
                  ))}
                </div>
              </label>
            )}
            <label className="block space-y-1 text-xs font-semibold text-ink-600">
              <span>Reason (optional)</span>
              <input
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g. Work schedule clash"
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRescheduleOpen(false)}>
              Close
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busyAction !== null || !rescheduleTime}>
              {busyAction ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck2 size={14} />}
              Request change
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}