import { Router, type Request } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityIdOf } from '../middleware/facilityScope'
import { rateLimit } from '../middleware/rateLimit'
import { HttpError } from '../middleware/errorHandler'
import {
  addAudit,
  countAudit,
  getChainMetaForFacility,
  listAudit,
  listAuditFiltered,
  listAuditPaged,
  searchAudit,
  verifyAuditChain,
  verifyAuditEntry,
} from '../services/auditStore'
import { exportAudit, exportFormatOf } from '../services/auditExportService'
import { getStoredImage } from '../services/imageStore'
import { listSessions } from '../services/sessionStore'
import { AUDIT_EXPORT_MIME, type AuditCategory, type AuditFilter } from '../types/auditChain.types'
import type { UserRole } from '../types'
import type { SupportedLanguage } from '../types/language.types'

export const auditRouter = Router()

/**
 * Audit immutability + export routes (P2-16).
 *
 * Reads are facility-scoped by `facilityScope` (mounted globally). Verification
 * and export are gated to facility-admin (own facility) / system-admin (any).
 * Nothing here exposes PII: entries are already anonymised, exports are
 * re-anonymised, chain meta and verification results carry no PII.
 */

const CATEGORIES: AuditCategory[] = ['view', 'edit', 'decision', 'export', 'auth', 'system']
const ROLES: UserRole[] = ['patient', 'nurse', 'doctor', 'admin', 'system-admin', 'facility-admin']
const LANGUAGES: SupportedLanguage[] = ['en', 'hi', 'or']

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function queryList(value: unknown): string[] | undefined {
  const raw = queryString(value)
  if (!raw) return undefined
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  return parts.length > 0 ? parts : undefined
}

function buildFilter(req: Request, limitDefault: number): AuditFilter {
  const since = queryString(req.query.since)
  const until = queryString(req.query.until)
  if (since && !Number.isFinite(Date.parse(since))) throw new HttpError(400, 'since must be an ISO date.')
  if (until && !Number.isFinite(Date.parse(until))) throw new HttpError(400, 'until must be an ISO date.')
  if (since && until && Date.parse(since) > Date.parse(until)) throw new HttpError(400, 'since must be on or before until.')

  const actions = queryList(req.query.actions)
  if (actions && actions.some((action) => action.length > 80)) {
    throw new HttpError(400, 'action filters must be 80 characters or fewer.')
  }

  const categories = queryList(req.query.categories)
  if (categories && categories.some((category) => !CATEGORIES.includes(category as AuditCategory))) {
    throw new HttpError(400, 'categories must be a subset of known audit categories.')
  }

  const actorRoles = queryList(req.query.actorRoles)
  if (actorRoles && actorRoles.some((role) => !ROLES.includes(role as UserRole))) {
    throw new HttpError(400, 'actorRoles must be a subset of known roles.')
  }

  const search = queryString(req.query.search)
  if (search && (search.length < 1 || search.length > 100)) {
    throw new HttpError(400, 'search must be 1..100 characters.')
  }

  const limitRaw = queryString(req.query.limit)
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : limitDefault
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new HttpError(400, 'limit must be an integer 1..1000.')
  }

  const cursor = queryString(req.query.cursor)
  if (cursor && !/^[A-Za-z0-9+/=]+$/.test(cursor)) throw new HttpError(400, 'cursor is invalid.')

  const sort = queryString(req.query.sort) === 'desc' ? 'desc' : 'asc'
  const sessionId = queryString(req.query.sessionId)
  const actor = queryString(req.query.actor)

  return {
    facilityId: facilityIdOf(req),
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
    ...(actions ? { actions } : {}),
    ...(categories ? { categories: categories as AuditCategory[] } : {}),
    ...(actorRoles ? { actorRoles: actorRoles as UserRole[] } : {}),
    ...(req.query.sessionId !== undefined && sessionId ? { sessionId } : {}),
    ...(req.query.actor !== undefined && actor ? { actor } : {}),
    ...(search ? { search } : {}),
    limit,
    ...(queryString(req.query.cursor) ? { cursor: queryString(req.query.cursor)! } : {}),
    sort,
  }
}

/** Writes `audit.filter-viewed` only for explicit (non-trivial) filter queries. */
function maybeRecordFilterView(req: Request, filter: AuditFilter): void {
  const explicit = Boolean(
    filter.since || filter.until || filter.actions || filter.categories || filter.actorRoles || filter.sessionId || filter.search || filter.actor,
  )
  if (!explicit) return
  const user = authUser(req)
  const summary = [
    filter.since ? `since=${filter.since}` : '',
    filter.until ? `until=${filter.until}` : '',
    filter.actions ? `actions=${filter.actions.join('|')}` : '',
    filter.categories ? `categories=${filter.categories.join('|')}` : '',
    filter.actorRoles ? `roles=${filter.actorRoles.join('|')}` : '',
    filter.sessionId ? 'session=set' : '',
    filter.search ? 'search=set' : '',
  ].filter(Boolean).join(', ')
  addAudit({
    facilityId: filter.facilityId,
    sessionId: 'audit',
    actor: user.displayName,
    role: user.role,
    action: 'audit.filter-viewed',
    detail: `Audit log filtered (${summary || 'facility scope'}).`,
    category: 'view',
  })
}

/** facility-admin may only touch their own facility; admin/system-admin any. */
function assertFacilityAccess(req: Request, facilityId: string): void {
  const user = authUser(req)
  if (user.role === 'admin' || user.role === 'system-admin') return
  if (user.facilityId !== facilityId) throw new HttpError(404, 'Audit chain not found for that facility.')
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

// Preserve the original contract: patients read their own sessions; everyone
// else reads the facility trail. The `{ entries }` shape is unchanged.
auditRouter.get('/', (req, res) => {
  const user = authUser(req)
  const sessionId = queryString(req.query.sessionId)

  if (user.role === 'patient') {
    const own = new Set(listSessions().filter((s) => s.ownerId === user.id).map((s) => s.id))
    const entries = listAudit(sessionId).filter((entry) => own.has(entry.sessionId))
    res.json({ entries })
    return
  }

  const filter = buildFilter(req, 1000)
  maybeRecordFilterView(req, filter)
  res.json({ entries: listAuditFiltered(filter) })
})

auditRouter.get('/paged', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const filter = buildFilter(req, 50)
  maybeRecordFilterView(req, filter)
  res.json(listAuditPaged(filter))
})

auditRouter.get('/count', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const filter = buildFilter(req, 1000)
  res.json({ count: countAudit(filter) })
})

auditRouter.get('/search', requireRole('nurse', 'doctor', 'facility-admin'), (req, res) => {
  const filter = buildFilter(req, 1000)
  maybeRecordFilterView(req, filter)
  res.json({ entries: searchAudit(filter) })
})

/* ------------------------------------------------------------------ */
/*  Client-only events (unchanged contract)                            */
/* ------------------------------------------------------------------ */

/**
 * Client-only events (viewing, consent) are logged here too — but the actor and
 * role always come from the login session, never from the request body, so the
 * trail cannot be forged.
 */
auditRouter.post('/', (req, res) => {
  const user = authUser(req)
  const { sessionId, action, detail, category } = req.body ?? {}

  for (const [key, value] of Object.entries({ sessionId, action, detail })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new HttpError(400, `${key} must be a non-empty string.`)
    }
  }
  if (!CATEGORIES.includes(category)) throw new HttpError(400, `category must be one of: ${CATEGORIES.join(', ')}`)

  const sid = sessionId.trim()
  if (user.role === 'patient') {
    const own = new Set(listSessions().filter((s) => s.ownerId === user.id).map((s) => s.id))
    if (!own.has(sid)) throw new HttpError(403, 'You may only log entries against your own sessions.')
  }

  const entry = addAudit({
    facilityId: facilityIdOf(req),
    sessionId: sid,
    actor: user.displayName,
    role: user.role,
    action: action.trim().slice(0, 80),
    detail: detail.trim().slice(0, 300),
    category,
  })
  res.status(201).json({ entry })
})

/* ------------------------------------------------------------------ */
/*  Hash-chain verification                                            */
/* ------------------------------------------------------------------ */

auditRouter.get('/chain/:facilityId/verify', rateLimit('sensitive'), requireRole('facility-admin'), (req, res) => {
  const facilityId = req.params.facilityId
  assertFacilityAccess(req, facilityId)
  const result = verifyAuditChain(facilityId)
  const user = authUser(req)
  addAudit({
    facilityId,
    sessionId: 'audit',
    actor: user.displayName,
    role: user.role,
    action: 'audit.chain-verified',
    detail: `Hash chain ${result.valid ? 'valid' : 'INVALID'} — ${result.checkedEntries} entr${result.checkedEntries === 1 ? 'y' : 'ies'} checked${result.firstInvalidSequence !== undefined ? `, first invalid #${result.firstInvalidSequence}` : ''}.`,
    category: 'system',
  })
  res.json(result)
})

auditRouter.get(
  '/chain/:facilityId/entry/:sequenceNumber/verify',
  rateLimit('sensitive'),
  requireRole('facility-admin'),
  (req, res) => {
    const facilityId = req.params.facilityId
    assertFacilityAccess(req, facilityId)
    const sequenceNumber = Number.parseInt(req.params.sequenceNumber, 10)
    if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
      throw new HttpError(400, 'sequenceNumber must be a positive integer.')
    }
    const result = verifyAuditEntry(facilityId, sequenceNumber)
    if (!result.valid && result.reason === 'entry not found') throw new HttpError(404, 'Audit entry not found.')
    const user = authUser(req)
    addAudit({
      facilityId,
      sessionId: 'audit',
      actor: user.displayName,
      role: user.role,
      action: 'audit.chain-verified',
      detail: `Entry #${sequenceNumber} ${result.valid ? 'verified' : `INVALID (${result.reason ?? 'unknown'})`}.`,
      category: 'system',
    })
    res.json(result)
  },
)

auditRouter.get('/chain/:facilityId/meta', rateLimit('sensitive'), requireRole('facility-admin'), (req, res) => {
  const facilityId = req.params.facilityId
  assertFacilityAccess(req, facilityId)
  const meta = getChainMetaForFacility(facilityId)
  if (!meta) throw new HttpError(404, 'Audit chain not found for that facility.')
  res.json(meta)
})

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

auditRouter.post('/export', rateLimit('sensitive'), requireRole('facility-admin'), async (req, res, next) => {
  try {
    const user = authUser(req)
    const body = (req.body ?? {}) as { filter?: unknown; format?: unknown; language?: unknown }
    const { filter, format } = body
    if (!filter || typeof filter !== 'object') throw new HttpError(400, 'filter is required.')
    if (format !== 'csv' && format !== 'json' && format !== 'pdf') {
      throw new HttpError(400, 'format must be one of: csv, json, pdf.')
    }
    const language = typeof body.language === 'string' && LANGUAGES.includes(body.language as SupportedLanguage)
      ? (body.language as SupportedLanguage)
      : 'en'

    const requested = filter as Partial<AuditFilter>
    const facilityId = queryString((requested as { facilityId?: unknown }).facilityId) ?? facilityIdOf(req)
    assertFacilityAccess(req, facilityId)

    const scoped: AuditFilter = {
      facilityId,
      ...(requested.since ? { since: String(requested.since) } : {}),
      ...(requested.until ? { until: String(requested.until) } : {}),
      ...(Array.isArray(requested.actions) ? { actions: requested.actions.map(String) } : {}),
      ...(Array.isArray(requested.categories) ? { categories: requested.categories as AuditCategory[] } : {}),
      ...(Array.isArray(requested.actorRoles) ? { actorRoles: requested.actorRoles as UserRole[] } : {}),
      ...(requested.sessionId ? { sessionId: String(requested.sessionId) } : {}),
      ...(requested.search ? { search: String(requested.search).slice(0, 100) } : {}),
      sort: 'asc',
      limit: 1000,
    }

    const result = await exportAudit(scoped, format, { name: user.displayName, role: user.role }, language)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

auditRouter.get('/export/:ref', rateLimit('sensitive'), requireRole('facility-admin'), (req, res) => {
  const ref = req.params.ref
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(ref)) throw new HttpError(400, 'Invalid export reference.')
  const stored = getStoredImage(ref)
  if (!stored || stored.category !== 'export') throw new HttpError(404, 'Export not found or expired.')
  const format = exportFormatOf(ref) ?? 'csv'
  res.setHeader('Content-Type', AUDIT_EXPORT_MIME[format])
  res.setHeader('Content-Disposition', `attachment; filename="audit-export-${ref}.${format}"`)
  res.setHeader('Content-Length', String(stored.buffer.byteLength))
  res.end(stored.buffer)
})
