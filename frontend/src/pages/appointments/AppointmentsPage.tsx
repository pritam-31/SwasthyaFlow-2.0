import type { GridColDef } from '@mui/x-data-grid-pro'
import { CalendarDays, CalendarPlus, CheckCircle2, Clock3, Hourglass } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppDataGrid } from '../../components/AppDataGrid'
import { Badge, Button, Card, cx, InfoBanner, PageHeader } from '../../components/ui'
import { formatHumanDate, formatHumanTime, todayISO } from '../../lib/appointmentDate'
import * as api from '../../services/appointmentApi'
import { useApp } from '../../store/AppStore'
import type { Role } from '../../types'
import type {
  Appointment,
  AppointmentAnalytics,
  AppointmentStatus,
  AvailabilityWindow,
  DoctorProfile,
} from '../../types/appointment.types'
import {
  APPOINTMENT_STATUS_META,
  CONSULTATION_TYPE_LABEL,
  PRIORITY_META,
} from '../../types/appointment.types'
import { DoctorScheduleCard } from '../../components/appointments/DoctorScheduleCard'

const MGMT: Role[] = ['admin', 'facility-admin', 'system-admin']

const STATUS_CHIPS: Array<AppointmentStatus | 'all'> = [
  'all',
  'pending',
  'confirmed',
  'checked_in',
  'reschedule_requested',
  'completed',
  'cancelled',
]

/** Role-aware landing page for the hybrid appointment system. */
export default function AppointmentsPage() {
  const { role, pushToast } = useApp()
  const navigate = useNavigate()

  const [rows, setRows] = useState<Appointment[] | null>(null)
  const [analytics, setAnalytics] = useState<AppointmentAnalytics | null>(null)
  const [myDoctor, setMyDoctor] = useState<DoctorProfile | null>(null)
  const [schedule, setSchedule] = useState<AvailabilityWindow[] | null>(null)
  const [chip, setChip] = useState<AppointmentStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { appointments } =
        role === 'doctor'
          ? await api.fetchMyAppointments()
          : MGMT.includes(role)
            ? await api.fetchFacilityAppointments()
            : await api.fetchAppointments()
      setRows(appointments)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load appointments.')
      setRows([])
    }
  }, [role])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (role !== 'doctor') return
    let cancelled = false
    api
      .fetchMyDoctor()
      .then(async ({ doctor }) => {
        if (cancelled) return
        setMyDoctor(doctor)
        const { availability } = await api.fetchAvailability(doctor.id).catch(() => ({ availability: [] }))
        if (!cancelled) setSchedule(availability)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [role])

  useEffect(() => {
    if (!MGMT.includes(role)) return
    api
      .fetchAppointmentAnalytics()
      .then(({ analytics: a }) => setAnalytics(a))
      .catch(() => setAnalytics(null))
  }, [role])

  const shown = useMemo(() => {
    if (!rows) return []
    return chip === 'all' ? rows : rows.filter((a) => a.status === chip)
  }, [rows, chip])

  const stats = useMemo(() => {
    const today = todayISO()
    return {
      upcoming: rows?.filter((a) => a.appointmentDate >= today && a.active).length ?? 0,
      pending: rows?.filter((a) => a.status === 'pending' || a.status === 'reschedule_requested').length ?? 0,
      confirmed: rows?.filter((a) => a.status === 'confirmed' || a.status === 'rescheduled').length ?? 0,
      completed: rows?.filter((a) => a.status === 'completed').length ?? 0,
    }
  }, [rows])

  const columns = useMemo<GridColDef<Appointment>[]>(() => {
    const staffLike = role !== 'patient'
    return [
      {
        field: 'bookingReference',
        headerName: 'Ref',
        width: 110,
        renderCell: (p) => <span className="font-mono text-xs font-bold text-ink-700">{p.row.bookingReference}</span>,
      },
      { field: 'patientName', headerName: 'Patient', width: 160, flex: 1 },
      ...(role === 'doctor'
        ? []
        : [{ field: 'doctorName', headerName: 'Doctor', width: 170, flex: 1 }]),
      ...(staffLike
        ? [{ field: 'departmentName', headerName: 'Department', width: 150, flex: 1 }]
        : []),
      {
        field: 'appointmentDate',
        headerName: 'When',
        width: 180,
        renderCell: (p) => (
          <span className="text-ink-700">
            {formatHumanDate(p.row.appointmentDate)} · {formatHumanTime(p.row.startTime)}
          </span>
        ),
      },
      {
        field: 'consultationType',
        headerName: 'Type',
        width: 150,
        renderCell: (p) => (
          <Badge className="bg-white text-ink-500 ring-ink-200">{CONSULTATION_TYPE_LABEL[p.row.consultationType]}</Badge>
        ),
      },
      {
        field: 'priority',
        headerName: 'Priority',
        width: 150,
        renderCell: (p) => (
          <Badge className={PRIORITY_META[p.row.priority].classes}>
            <span className={cx('h-1.5 w-1.5 rounded-full', PRIORITY_META[p.row.priority].dot)} />
            {PRIORITY_META[p.row.priority].label}
          </Badge>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 160,
        renderCell: (p) => (
          <Badge className={APPOINTMENT_STATUS_META[p.row.status].classes}>
            <span className={cx('h-1.5 w-1.5 rounded-full', APPOINTMENT_STATUS_META[p.row.status].dot)} />
            {APPOINTMENT_STATUS_META[p.row.status].label}
          </Badge>
        ),
      },
    ]
  }, [role])

  const statCards = [
    { label: 'Upcoming', value: stats.upcoming, icon: CalendarDays, classes: 'bg-brand-100 text-brand-700' },
    { label: 'Waiting confirmation', value: stats.pending, icon: Hourglass, classes: 'bg-amber-100 text-amber-700' },
    { label: 'Confirmed', value: stats.confirmed, icon: CheckCircle2, classes: 'bg-emerald-100 text-emerald-700' },
    { label: 'Completed', value: stats.completed, icon: Clock3, classes: 'bg-violet-100 text-violet-700' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Smart scheduling · human in the loop"
        title="Appointments"
        subtitle="Direct bookings and triage-linked appointments. Every step is reviewed by clinical staff — priority labels are operational, never a diagnosis."
        action={
          <Button onClick={() => navigate('/app/appointments/book')}>
            <CalendarPlus size={15} /> Book appointment
          </Button>
        }
        icon={<CalendarDays size={20} />}
      />

      <InfoBanner tone="brand">
        The clinic confirms or rejects every booking. Requests for change are approved by a doctor or nurse before the
        schedule moves — no appointment changes are automated.
      </InfoBanner>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="!p-4">
            <div className="flex items-center gap-3">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.classes)}>
                <s.icon size={18} />
              </span>
              <div>
                <p className="text-xs text-ink-400">{s.label}</p>
                <p className="text-xl font-extrabold text-ink-900">{rows === null ? '—' : s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {MGMT.includes(role) && analytics && (
        <Card
          title="Facility overview"
          subtitle="Live totals for this facility — confirmation and completion trends."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Bookings', value: analytics.totals.bookings },
              { label: 'Confirmed', value: analytics.totals.confirmed },
              { label: 'Completed', value: analytics.totals.completed },
              { label: 'Cancellation rate', value: `${analytics.totals.cancellationRate.toFixed(1)}%` },
            ].map((row) => (
              <div key={row.label} className="rounded-xl border border-ink-200 bg-white px-3.5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{row.label}</p>
                <p className="mt-1 text-[22px] font-extrabold text-ink-900">{row.value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_CHIPS.map((c) => {
            const count =
              c === 'all' ? rows?.length ?? 0 : rows?.filter((a) => a.status === c).length ?? 0
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChip(c)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-xs font-bold capitalize ring-1 ring-inset transition-colors',
                  chip === c
                    ? 'bg-ink-900 text-white ring-ink-900'
                    : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                )}
              >
                {c === 'all' ? 'All' : APPOINTMENT_STATUS_META[c].label} · {count}
              </button>
            )
          })}
        </div>

        <AppDataGrid<Appointment>
          rows={shown}
          columns={columns}
          ariaLabel="Appointments"
          storageKey="appointments"
          loading={rows === null}
          error={error}
          onRetry={() => load()}
          getRowId={(a) => a.id}
          onRowClick={(a) => navigate(`/app/appointments/${a.id}`)}
          emptyTitle="No appointments yet"
          emptyBody={
            role === 'patient'
              ? 'Book your first appointment with a doctor at this facility.'
              : 'There are no appointments matching this view.'
          }
          emptyAction={
            <Button variant="secondary" size="sm" onClick={() => navigate('/app/appointments/book')}>
              <CalendarPlus size={14} /> Book appointment
            </Button>
          }
          mobileCardRenderer={(a) => (
            <button
              type="button"
              onClick={() => navigate(`/app/appointments/${a.id}`)}
              className="sf-card-hover w-full rounded-2xl border border-ink-200 bg-white p-4 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-ink-500">{a.bookingReference}</span>
                <Badge className={APPOINTMENT_STATUS_META[a.status].classes}>
                  <span className={cx('h-1.5 w-1.5 rounded-full', APPOINTMENT_STATUS_META[a.status].dot)} />
                  {APPOINTMENT_STATUS_META[a.status].label}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-extrabold text-ink-900">
                {a.patientName} · {formatHumanDate(a.appointmentDate)}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {formatHumanTime(a.startTime)} · {a.doctorName}
              </p>
            </button>
          )}
          toolbarStart={
            <span className="px-1 text-xs font-semibold text-ink-400">
              {role === 'patient' ? 'Your appointments' : role === 'doctor' ? 'Your roster' : 'Facility appointments'}
            </span>
          }
        />
      </div>

      {role === 'doctor' && (
        <DoctorScheduleCard
          doctor={myDoctor}
          schedule={schedule}
          onChange={async () => {
            if (!myDoctor) return
            try {
              const { availability } = await api.fetchAvailability(myDoctor.id)
              setSchedule(availability)
              pushToast('success', 'Schedule updated')
            } catch (err) {
              pushToast('error', err instanceof Error ? err.message : 'Could not refresh the schedule.')
            }
          }}
        />
      )}
    </div>
  )
}