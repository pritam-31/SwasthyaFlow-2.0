import { Router } from 'express'
import { authUser, requireAuth } from '../middleware/auth'
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCountForUser,
} from '../services/notificationService'

export const notificationsRouter = Router()

notificationsRouter.get('/', requireAuth, (req, res) => {
  const user = authUser(req)
  res.json({ notifications: listNotificationsForUser(user.id) })
})

notificationsRouter.get('/unread-count', requireAuth, (req, res) => {
  const user = authUser(req)
  res.json({ unread: unreadCountForUser(user.id) })
})

notificationsRouter.patch('/:id/read', requireAuth, (req, res) => {
  const user = authUser(req)
  const notification = markNotificationRead(req.params.id, user.id)
  res.json({ notification })
})

notificationsRouter.post('/read-all', requireAuth, (req, res) => {
  const user = authUser(req)
  markAllNotificationsRead(user.id)
  res.json({ ok: true })
})