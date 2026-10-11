import { Router } from 'express'
import { authUser } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { getServerVersion, processBatch } from '../services/syncService'
import type { QueueActionType, QueuedItem } from '../types'

export const syncRouter = Router()

const MAX_ITEMS = 100
const MAX_ITEM_BYTES = 200 * 1024
const MAX_TOTAL_BYTES = 2 * 1024 * 1024
const METHODS: QueuedItem['method'][] = ['POST', 'PATCH', 'DELETE']

function asQueuedItem(value: unknown, index: number): QueuedItem {
  if (!value || typeof value !== 'object') throw new HttpError(400, `Item ${index} is not an object.`)
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id : ''
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : ''
  const method = raw.method
  const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey : ''
  if (!id || !endpoint || !METHODS.includes(method as QueuedItem['method']) || !idempotencyKey) {
    throw new HttpError(400, `Item ${index} is missing required fields.`)
  }
  const payload = raw.payload && typeof raw.payload === 'object' ? (raw.payload as Record<string, unknown>) : {}
  const dependencies = Array.isArray(raw.dependencies)
    ? raw.dependencies.filter((d): d is string => typeof d === 'string')
    : []
  return {
    id,
    actionType: (typeof raw.actionType === 'string' ? raw.actionType : '') as QueueActionType,
    endpoint,
    method: method as QueuedItem['method'],
    payload,
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
    actorId: typeof raw.actorId === 'string' ? raw.actorId : '',
    actorRole: (raw.actorRole as QueuedItem['actorRole']) ?? 'patient',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    attemptCount: typeof raw.attemptCount === 'number' ? raw.attemptCount : 0,
    lastAttemptAt: typeof raw.lastAttemptAt === 'string' ? raw.lastAttemptAt : null,
    lastError: null,
    status: 'pending',
    idempotencyKey,
    dependencies,
    conflictInfo: null,
  }
}

syncRouter.get('/version', (_req, res) => {
  res.json(getServerVersion())
})

syncRouter.post('/batch', (req, res) => {
  const actor = authUser(req)
  const body = req.body as { items?: unknown } | undefined
  if (!body || !Array.isArray(body.items)) throw new HttpError(400, 'Malformed batch')
  if (body.items.length < 1 || body.items.length > MAX_ITEMS) throw new HttpError(400, 'Batch too large')

  let total = 0
  const items = body.items.map((raw, index) => {
    const item = asQueuedItem(raw, index)
    const size = Buffer.byteLength(JSON.stringify(item.payload), 'utf8')
    if (size > MAX_ITEM_BYTES) throw new HttpError(400, `Item ${index} payload exceeds 200 KB.`)
    total += size
    return item
  })
  if (total > MAX_TOTAL_BYTES) throw new HttpError(400, 'Batch too large')

  res.json(processBatch(items, actor))
})
