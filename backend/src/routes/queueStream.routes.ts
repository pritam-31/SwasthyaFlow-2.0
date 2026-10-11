import { Router } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { onQueueEvent } from '../services/priorityEvents'
import { summarizeQueue } from '../services/queueService'
import type { QueueEvent, UserRole } from '../types'

/**
 * Server-Sent Events stream of queue updates (P1-11).
 *
 * Emits `priority:updated` when a case's priority changes and `summary:updated`
 * when the facility dashboard counts change. Scoped to the caller's facility; a
 * heartbeat every 25s keeps proxies from closing the connection.
 */

export const queueStreamRouter = Router()

const STAFF_ROLES: UserRole[] = ['nurse', 'doctor', 'facility-admin']

queueStreamRouter.get('/queue/stream', requireRole(...STAFF_ROLES), (req, res) => {
  authUser(req)
  const facilityId = facilityIdOf(req)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event: QueueEvent): void => {
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  send({ type: 'summary:updated', facilityId, at: new Date().toISOString() })

  const unsubscribe = onQueueEvent((event) => {
    if (event.facilityId !== facilityId) return
    send(event)
  })

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n')
  }, 25_000)
  heartbeat.unref?.()

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })

  // Surface the current summary immediately so a fresh client is never blank.
  res.write(`event: snapshot\n`)
  res.write(`data: ${JSON.stringify({ summary: summarizeQueue(facilityId) })}\n\n`)
})
