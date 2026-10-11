import type { AuthUser } from '../services/authStore'
import type { FacilityContext } from './facility.types'
import type { AuthAuditContext } from './security.types'

declare global {
  namespace Express {
    interface Request {
      /** Set by the requireAuth middleware once a login session is resolved. */
      user?: AuthUser
      /** Set by the facilityScope middleware (P1-10). */
      facility?: FacilityContext
      /** Correlation id echoed on every response (P1-12). */
      requestId?: string
      /** Opaque session token that authenticated this request (P1-12). */
      sessionToken?: string
      /** Anonymised request context for security events (P1-12). */
      authContext?: AuthAuditContext
    }
  }
}

export {}
