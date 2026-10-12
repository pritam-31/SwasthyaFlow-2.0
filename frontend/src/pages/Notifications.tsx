import { Bell, BellRing, CheckCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, cx, InfoBanner, PageHeader, Skeleton } from '../components/ui'
import * as api from '../services/appointmentApi'
import { useApp } from '../store/AppStore'
import type { AppointmentNotification } from '../types/appointment.types'

const KIND_META: Record<AppointmentNotification['kind'], { label: string; classes: string; dot: string }> = {
  booking_submitted: { label: 'Submitted', classes: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  booking_confirmed: { label: 'Confirmed', classes: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  booking_rejected: { label: 'Rejected', classes: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500' },
  reschedule_requested: { label: 'Change requested', classes: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  rescheduled: { label: 'Rescheduled', classes: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500' },
  cancelled: { label: 'Cancelled', classes: 'bg-ink-100 text-ink-600 ring-ink-200', dot: 'bg-ink-400' },
  checked_in: { label: 'Checked in', classes: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  completed: { label: 'Completed', classes: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  reminder: { label: 'Reminder', classes: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
}

/** In-app notification feed for booking events (patient and staff). */
export default function NotificationsPage() {
  const { pushToast } = useApp()
  const navigate = useNavigate()

  const [items, setItems] = useState<AppointmentNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { notifications } = await api.fetchNotifications()
      setItems(notifications)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notifications.')
      setItems([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markRead = async (n: AppointmentNotification) => {
    if (n.read) return
    setBusy(true)
    try {
      const { notification } = await api.markNotificationRead(n.id)
      setItems((prev) => (prev ? prev.map((x) => (x.id === notification.id ? notification : x)) : prev))
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not update the notification.')
    } finally {
      setBusy(false)
    }
  }

  const markAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.markAllNotificationsRead()
      setItems((prev) => (prev ? prev.map((x) => ({ ...x, read: true })) : prev))
      pushToast('success', 'All notifications marked as read.')
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not update notifications.')
    } finally {
      setBusy(false)
    }
  }

  const unread = items?.filter((n) => !n.read).length ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Booking events"
        title="Notifications"
        subtitle="Status changes on your appointments — confirmation, reschedules, cancellations and reminders."
        icon={<BellRing size={20} />}
        action={
          unread > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAll} disabled={busy}>
              <CheckCheck size={14} /> Mark all read
            </Button>
          ) : null
        }
      />

      {unread > 0 && !error && (
        <InfoBanner tone="brand">{unread} unread notification{unread === 1 ? '' : 's'}.</InfoBanner>
      )}

      {error && <InfoBanner tone="rose">{error}</InfoBanner>}

      {items === null ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Card className="!p-8">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <Bell size={20} />
            </span>
            <p className="text-sm font-bold text-ink-700">Nothing yet</p>
            <p className="text-xs text-ink-500">Booking updates will appear here.</p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => {
            const meta = KIND_META[n.kind]
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    void markRead(n)
                    navigate(`/app/appointments/${n.appointmentId}`)
                  }}
                  className={cx(
                    'group flex w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left transition-colors hover:border-brand-300',
                    n.read ? 'border-ink-200' : 'border-brand-200 bg-brand-50/40',
                  )}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      meta.classes.split(' ').slice(0, 2).join(' '),
                    )}
                  >
                    <Bell size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-ink-900">{n.title}</p>
                      <Badge className={meta.classes}>
                        <span className={cx('h-1.5 w-1.5 rounded-full', meta.dot)} />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{n.message}</p>
                    <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                      {n.bookingReference} · {new Date(n.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-center text-xs text-ink-400">
        Notifications link to the appointment — opening one marks the entry as read.
      </p>
    </div>
  )
}