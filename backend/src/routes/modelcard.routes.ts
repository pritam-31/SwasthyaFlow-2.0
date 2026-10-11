import { Router } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { getCard, listCards, recordCardView, updateCard, type ContentActor } from '../services/modelCardService'
import {
  createFailureMode,
  deleteFailureMode,
  getFailureMode,
  listFailureModes,
  updateFailureMode,
} from '../services/failureModeService'
import { isLayerId } from '../types/modelcard.types'
import type { AuthUser } from '../services/authStore'

/**
 * Model card + failure-mode API (P2-13).
 *
 *  GET    /model-cards                       list all cards                 any authenticated user
 *  GET    /model-cards/:cardId               one card + its failure modes   any authenticated user
 *  PATCH  /model-cards/:cardId               version-gated update           system-admin
 *  GET    /failure-modes                     list (filter ?layerId=)        any authenticated user
 *  POST   /failure-modes                     create                         system-admin
 *  PATCH  /failure-modes/:failureId          update                         system-admin
 *  DELETE /failure-modes/:failureId          delete                         system-admin
 */
export const modelCardRouter = Router()

function actorOf(user: AuthUser): ContentActor {
  return { id: user.id, username: user.username, role: user.role }
}

modelCardRouter.get('/model-cards', (req, res, next) => {
  try {
    authUser(req)
    res.json({ cards: listCards() })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.get('/model-cards/:cardId', (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    const card = getCard(req.params.cardId)
    if (!card) throw new HttpError(404, 'Model card not found.')
    recordCardView(card.cardId, actor)
    res.json({ card, failureModes: listFailureModes(card.layerId) })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.patch('/model-cards/:cardId', requireRole('system-admin'), (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    const card = updateCard(req.params.cardId, (req.body ?? {}) as Record<string, unknown>, actor)
    res.json({ card })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.get('/failure-modes', (req, res, next) => {
  try {
    authUser(req)
    const layerId = typeof req.query.layerId === 'string' ? req.query.layerId : undefined
    if (layerId !== undefined && !isLayerId(layerId)) throw new HttpError(400, 'Invalid layerId filter.')
    res.json({ failureModes: listFailureModes(layerId) })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.post('/failure-modes', requireRole('system-admin'), (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    const failureMode = createFailureMode((req.body ?? {}) as Record<string, unknown>, actor)
    res.status(201).json({ failureMode })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.get('/failure-modes/:failureId', (req, res, next) => {
  try {
    authUser(req)
    const failureMode = getFailureMode(req.params.failureId)
    if (!failureMode) throw new HttpError(404, 'Failure mode not found.')
    res.json({ failureMode })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.patch('/failure-modes/:failureId', requireRole('system-admin'), (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    const failureMode = updateFailureMode(req.params.failureId, (req.body ?? {}) as Record<string, unknown>, actor)
    res.json({ failureMode })
  } catch (err) {
    next(err)
  }
})

modelCardRouter.delete('/failure-modes/:failureId', requireRole('system-admin'), (req, res, next) => {
  try {
    const actor = actorOf(authUser(req))
    if (!deleteFailureMode(req.params.failureId, actor)) throw new HttpError(404, 'Failure mode not found.')
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
