import { Router } from 'express'
import { authUser, requireAuth, requireRole } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { facilityIdOf } from '../middleware/facilityScope'
import { isSystemAdmin } from '../services/authStore'
import { getEffectivePolicy, listSecurityPolicies, updatePolicy } from '../services/passwordPolicyService'
import { list as listSecurityEvents } from '../services/securityEventService'
import { clearLockoutByKey, listLockouts } from '../services/lockoutService'
import { block, listActive, unblock } from '../services/ipBlocklistService'
import type { SecurityPolicy } from '../types/security.types'

/**
 * Security administration API (P1-12).
 *
 * Restricted to administrators (a system-admin always passes, a facility-admin
 * manages their own facility). Endpoints cover the per-facility policy, the
 * event trail, active lockouts and the IP blocklist. No secret material is ever
 * returned.
 */
export const securityRouter = Router()

securityRouter.use('/security', requireAuth, requireRole('facility-admin'))

securityRouter.get('/security/policy', async (req, res, next) => {
  try {
    const actor = authUser(req)
    if (isSystemAdmin(actor.role) && typeof req.query.facilityId === 'string') {
      res.json({ policy: await getEffectivePolicy(req.query.facilityId) })
      return
    }
    res.json({ policy: await getEffectivePolicy(facilityIdOf(req)) })
  } catch (err) {
    next(err)
  }
})

securityRouter.put('/security/policy', async (req, res, next) => {
  try {
    const actor = authUser(req)
    const patch = (req.body ?? {}) as Partial<SecurityPolicy>
    const facilityId = typeof req.body?.facilityId === 'string' && isSystemAdmin(actor.role) ? req.body.facilityId : facilityIdOf(req)
    const policy = await updatePolicy(facilityId, patch, { id: actor.id, role: actor.role })
    res.json({ policy })
  } catch (err) {
    next(err)
  }
})

securityRouter.get('/security/policies', async (req, res, next) => {
  try {
    const actor = authUser(req)
    if (!isSystemAdmin(actor.role)) throw new HttpError(403, 'Only a system administrator can list every policy.')
    res.json({ policies: await listSecurityPolicies() })
  } catch (err) {
    next(err)
  }
})

securityRouter.get('/security/events', async (req, res, next) => {
  try {
    const actor = authUser(req)
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const since = typeof req.query.since === 'string' ? req.query.since : undefined
    const allFacilities = isSystemAdmin(actor.role) && req.query.scope === 'all'
    const facilityId = allFacilities ? undefined : facilityIdOf(req)
    const events = await listSecurityEvents({ type, since, facilityId })
    res.json({ events })
  } catch (err) {
    next(err)
  }
})

securityRouter.get('/security/lockouts', (req, res) => {
  authUser(req)
  res.json({ lockouts: listLockouts() })
})

securityRouter.delete('/security/lockouts/:key', (req, res, next) => {
  try {
    authUser(req)
    if (!clearLockoutByKey(req.params.key)) throw new HttpError(404, 'Lockout entry not found.')
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

securityRouter.get('/security/ip-blocklist', (req, res) => {
  authUser(req)
  res.json({ entries: listActive() })
})

securityRouter.post('/security/ip-blocklist', async (req, res, next) => {
  try {
    const actor = authUser(req)
    const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : ''
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
    if (!ip) throw new HttpError(400, 'ip is required.')
    if (!reason) throw new HttpError(400, 'reason is required.')
    const durationMinutes = typeof req.body?.durationMinutes === 'number' ? req.body.durationMinutes : undefined
    const entry = await block({ ip, reason, blockedBy: actor.id, durationMinutes, actorId: actor.id, facilityId: facilityIdOf(req), requestId: req.requestId })
    res.status(201).json({ entry })
  } catch (err) {
    next(err)
  }
})

securityRouter.delete('/security/ip-blocklist/:entryId', async (req, res, next) => {
  try {
    const actor = authUser(req)
    const entry = await unblock(req.params.entryId, actor.id, req.requestId)
    if (!entry) throw new HttpError(404, 'Blocklist entry not found.')
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
