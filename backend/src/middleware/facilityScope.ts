import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { isSystemAdmin, type AuthUser } from '../services/authStore'
import { defaultFacilityId, facilityNameOf, getFacility } from '../services/facilityService'
import { HttpError } from './errorHandler'
import type { FacilityContext } from '../types/facility.types'

/**
 * Resolves the facility in scope for the request (P1-10).
 *
 * `X-Facility-Id` is honoured only for a system-admin, and only when it names an
 * existing, non-archived facility. Every other role is pinned to its own
 * facility — the header is ignored. When a system-admin sends no header the
 * request is scoped to the facility already active on the session (defaulting to
 * the first active facility).
 */

const UUID_ISH = /^[A-Za-z0-9_-]{1,64}$/

function headerFacility(req: Request): string | undefined {
  const raw = req.header('x-facility-id')
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value || undefined
}

export function resolveContext(user: AuthUser, requested: string | undefined): FacilityContext {
  if (isSystemAdmin(user.role)) {
    if (requested) {
      if (!UUID_ISH.test(requested)) throw new HttpError(400, 'Invalid X-Facility-Id header.')
      const facility = getFacility(requested)
      if (!facility) throw new HttpError(404, 'Facility not found.')
      if (facility.status === 'archived') throw new HttpError(409, 'That facility is archived.')
      return { facilityId: facility.id, facilityName: facility.name, facilityType: facility.type, source: 'header' }
    }
    const fallback = user.activeFacilityId ?? defaultFacilityId()
    const facility = getFacility(fallback)
    return {
      facilityId: fallback,
      facilityName: facility?.name ?? facilityNameOf(fallback),
      facilityType: facility?.type ?? 'other',
      source: 'user-default',
    }
  }
  const facility = getFacility(user.facilityId)
  return {
    facilityId: user.facilityId,
    facilityName: facility?.name ?? facilityNameOf(user.facilityId),
    facilityType: facility?.type ?? 'other',
    source: 'user-default',
  }
}

export const facilityScope: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user
  if (!user) {
    next(new HttpError(401, 'Authentication required — log in first.'))
    return
  }
  try {
    req.facility = resolveContext(user, headerFacility(req))
    next()
  } catch (err) {
    next(err)
  }
}

/** Narrowing helper for route handlers (facilityScope runs first). */
export function facilityContext(req: Request): FacilityContext {
  const context = req.facility
  if (!context) throw new HttpError(500, 'Facility scope was not resolved for this request.')
  return context
}

export function facilityIdOf(req: Request): string {
  return facilityContext(req).facilityId
}
