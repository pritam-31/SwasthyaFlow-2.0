import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { listPersistedAppointmentNotifications, upsertAppointmentNotification } from '../repositories/appointmentNotificationRepository'
import type { AppointmentNotification } from '../types/appointment.types'

const notifications = new Map<string, AppointmentNotification>()

function persist(notification: AppointmentNotification): void {
  if (!persistenceEnabled()) return
  enqueue('appointment-notification:' + notification.id, () => upsertAppointmentNotification({ ...notification }))
}

function now(): string {
  return new Date().toISOString()
}

export function notify(input: {
  userId: string
  facilityId: string
  kind: AppointmentNotification['kind']
  title: string
  message: string
  appointmentId: string
  bookingReference: string
}): AppointmentNotification {
  const notification: AppointmentNotification = {
    id: `not-${randomUUID().slice(0, 8)}`,
    userId: input.userId,
    facilityId: input.facilityId,
    kind: input.kind,
    title: input.title,
    message: input.message,
    appointmentId: input.appointmentId,
    bookingReference: input.bookingReference,
    read: false,
    createdAt: now(),
  }
  notifications.set(notification.id, notification)
  persist(notification)
  return notification
}

/** Latest-first feed for a user. */
export function listNotificationsForUser(userId: string): AppointmentNotification[] {
  return [...notifications.values()]
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function unreadCountForUser(userId: string): number {
  return listNotificationsForUser(userId).filter((n) => !n.read).length
}

export function getNotification(id: string): AppointmentNotification | undefined {
  return notifications.get(id)
}

export function markNotificationRead(id: string, userId: string): AppointmentNotification {
  const existing = notifications.get(id)
  if (!existing) throw new Error('Notification not found.')
  if (existing.userId !== userId) throw new Error('Notification not found.')
  const next = { ...existing, read: true }
  notifications.set(id, next)
  persist(next)
  return next
}

export function markAllNotificationsRead(userId: string): void {
  for (const [id, notification] of notifications) {
    if (notification.userId === userId && !notification.read) {
      const next = { ...notification, read: true }
      notifications.set(id, next)
      persist(next)
    }
  }
}

export async function hydrateAppointmentNotifications(): Promise<void> {
  const rows = await listPersistedAppointmentNotifications()
  notifications.clear()
  for (const notification of rows) notifications.set(notification.id, notification)
}

export function clearNotifications(): void {
  notifications.clear()
}