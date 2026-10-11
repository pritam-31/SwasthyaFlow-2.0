import { HttpError } from '../middleware/errorHandler'
import { addAudit, listAudit, pruneAuditEntry, verifyAuditChain } from './auditStore'
import { listConsentEventsForSession } from './consentRetentionService'
import { buildSessionExport } from './retentionExportService'
import { getRetentionPolicy, getRetentionPolicyForFacility, getRetentionRule, POLICY_VERSION } from './retentionConfig'
import {
  eraseSessionData,
  extendSessionRetention,
  RETENTION_HANDLERS,
  getSessionRetentionTargets,
  recordRetentionAction,
} from './retentionService'
import { getRetentionSla } from './retentionSlaService'
import { getSessionIncludingDeleted, listSessionsForFacility } from './sessionStore'
import { getStoredImage, listStoredImages } from './imageStore'
import type { RetentionActor, RetentionCategory, RetentionExportSummary } from '../types'
import type {
  BulkRetentionAction,
  BulkRetentionRequest,
  BulkRetentionResult,
  PendingDeletionRow,
  PendingDeletions,
  PolicyDiff,
  PolicyDiffRow,
  PruneAuditResult,
  RetentionSlaView,
  RetentionTimeline,
  RetentionTimelineEvent,
  RetentionTimelineKind,
  SessionDataInventory,
  SessionInventoryRow,
} from '../types'

/**
 * Data & Privacy console projections (P2-17).
 *
 * Read-mostly views over the retention engine plus the bulk / prune operations.
 * Nothing here diagnoses; every mutation is audited and facility-scoped.
 */

const TIMELINE_KINDS: readonly RetentionTimelineKind[] = [
  'consent.granted',
  'consent.revoked',
  'consent.re-granted',
  'consent.version-upgraded',
  'retention.extended',
  'session.deleted',
  'session.exported',
  'retention.job_run',
]

function assertSession(sessionId: string, facilityId?: string) {
  const session = getSessionIncludingDeleted(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (facilityId && session.facilityId !== facilityId) throw new HttpError(404, 'Session not found.')
  return session
}

function whyRetained(category: string, expiresAt: string | undefined, deleted: boolean): string {
  if (deleted) return 'case-withdrawn'
  if (!expiresAt) return 'retention-disabled'
  const at = Date.parse(expiresAt)
  if (Number.isFinite(at) && at <= Date.now()) return 'due-now'
  return `held-until-${category}`
}

/* ------------------------------------------------------------------ */
/*  Session data inventory                                             */
/* ------------------------------------------------------------------ */

export function getSessionInventory(sessionId: string, facilityId?: string): SessionDataInventory {
  const session = assertSession(sessionId, facilityId)
  const now = Date.now()
  const grouped = new Map<RetentionCategory, { total: number; eligible: number; minFuture: number | null }>()
  for (const target of getSessionRetentionTargets(sessionId)) {
    const bucket = grouped.get(target.category) ?? { total: 0, eligible: 0, minFuture: null }
    bucket.total += 1
    const at = Date.parse(target.expiresAt)
    if (Number.isFinite(at) && at <= now) bucket.eligible += 1
    else if (Number.isFinite(at)) bucket.minFuture = bucket.minFuture === null ? at : Math.min(bucket.minFuture, at)
    grouped.set(target.category, bucket)
  }

  const rows: SessionInventoryRow[] = []
  let totalRecords = 0
  let eligibleRecords = 0
  for (const [category, bucket] of grouped) {
    const rule = getRetentionRule(category)
    const expiresAt = bucket.minFuture !== null ? new Date(bucket.minFuture).toISOString() : undefined
    rows.push({
      category: rule.category,
      label: rule.label,
      scope: rule.scope,
      total: bucket.total,
      eligible: bucket.eligible,
      ...(expiresAt ? { expiresAt } : {}),
      whyRetained: whyRetained(rule.category, expiresAt, Boolean(session.deletedAt)),
    })
    totalRecords += bucket.total
    eligibleRecords += bucket.eligible
  }
  rows.sort((a, b) => b.total - a.total)

  return {
    sessionId,
    patientId: session.patientId,
    policyVersion: POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    rows,
    totalRecords,
    eligibleRecords,
  }
}

/* ------------------------------------------------------------------ */
/*  Pending deletions (facility-wide)                                  */
/* ------------------------------------------------------------------ */

export function getPendingDeletions(facilityId: string): PendingDeletions {
  const now = Date.now()
  const DAY_MS = 86_400_000
  const rows: PendingDeletionRow[] = []
  for (const session of listSessionsForFacility(facilityId)) {
    for (const target of getSessionRetentionTargets(session.id)) {
      const at = Date.parse(target.expiresAt)
      if (!Number.isFinite(at)) continue
      rows.push({
        category: target.category,
        targetId: target.targetId,
        sessionId: session.id,
        expiresAt: target.expiresAt,
        daysUntil: Math.ceil((at - now) / DAY_MS),
        due: at <= now,
      })
    }
  }
  rows.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
  return { facilityId, generatedAt: new Date(now).toISOString(), rows: rows.slice(0, 500) }
}

/* ------------------------------------------------------------------ */
/*  Retention timeline (merged)                                        */
/* ------------------------------------------------------------------ */

export function getRetentionTimeline(sessionId: string, facilityId?: string): RetentionTimeline {
  assertSession(sessionId, facilityId)
  const events = new Map<string, RetentionTimelineEvent>()

  for (const event of listConsentEventsForSession(sessionId)) {
    events.set(event.id, {
      id: event.id,
      kind: event.kind === 'revoked' ? 'consent.revoked'
        : event.kind === 're-granted' ? 'consent.re-granted'
          : event.kind === 'version-upgraded' ? 'consent.version-upgraded'
            : 'consent.granted',
      at: event.at,
      actor: event.actor,
      actorRole: event.actorRole,
      detail: event.reasonCode ? `Consent ${event.kind} (${event.reasonCode}).` : `Consent ${event.kind} (policy ${event.policyVersion}).`,
    })
  }

  for (const entry of listAudit(sessionId)) {
    if (!(TIMELINE_KINDS as readonly string[]).includes(entry.action)) continue
    events.set(entry.id, {
      id: entry.id,
      kind: entry.action as RetentionTimelineKind,
      at: entry.at,
      actor: entry.actor,
      actorRole: entry.role,
      detail: entry.detail,
    })
  }

  const sorted = [...events.values()].sort((a, b) => a.at.localeCompare(b.at))
  return { sessionId, generatedAt: new Date().toISOString(), events: sorted }
}

/* ------------------------------------------------------------------ */
/*  Policy diff + exports                                              */
/* ------------------------------------------------------------------ */

export function getPolicyDiff(facilityId: string): PolicyDiff {
  const globalPolicy = getRetentionPolicy()
  const facilityPolicy = getRetentionPolicyForFacility(facilityId)
  const facilityRules = new Map(facilityPolicy.rules.map((rule) => [rule.category, rule]))
  const rows: PolicyDiffRow[] = globalPolicy.rules.map((globalRule) => {
    const facilityRule = facilityRules.get(globalRule.category)
    const facilityDays = facilityRule?.retentionDays ?? globalRule.retentionDays
    const facilityEnabled = facilityRule?.enabled ?? globalRule.enabled
    const changed =
      facilityDays !== globalRule.retentionDays || facilityEnabled !== globalRule.enabled
    return {
      category: globalRule.category,
      label: globalRule.label,
      globalDays: globalRule.retentionDays,
      facilityDays,
      deltaDays: facilityDays - globalRule.retentionDays,
      globalEnabled: globalRule.enabled,
      facilityEnabled,
      changed,
    }
  })
  return {
    facilityId,
    globalVersion: globalPolicy.version,
    generatedAt: new Date().toISOString(),
    rows,
    changedCount: rows.filter((row) => row.changed).length,
  }
}

export function listRetentionExports(facilityId: string): RetentionExportSummary[] {
  const sessionIds = new Set(listSessionsForFacility(facilityId).map((session) => session.id))
  return listStoredImages('export')
    .filter((entry) => !entry.sessionId || sessionIds.has(entry.sessionId))
    .map((entry) => ({
      ref: entry.id,
      ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
      createdAt: entry.createdAt,
      bytes: entry.bytes,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getRetentionExportBuffer(ref: string): Buffer | null {
  const entry = getStoredImage(ref)
  if (!entry || entry.category !== 'export') return null
  return entry.buffer
}

/* ------------------------------------------------------------------ */
/*  SLA view                                                           */
/* ------------------------------------------------------------------ */

export function getRetentionSlaView(facilityId: string): RetentionSlaView {
  return getRetentionSla(facilityId)
}

/* ------------------------------------------------------------------ */
/*  Bulk retention                                                     */
/* ------------------------------------------------------------------ */

function sessionsForCategory(facilityId: string, category: BulkRetentionRequest['category']): string[] {
  const all = listSessionsForFacility(facilityId).map((session) => session.id)
  if (category === 'all') return all
  return all.filter((sessionId) =>
    getSessionRetentionTargets(sessionId).some((target) => target.category === category),
  )
}

/**
 * Bulk retention across a facility. Every session is re-checked against the
 * facility boundary; a stale/mismatched id is skipped, never acted on.
 * `category` narrows the candidate set; `all` means every live case.
 */
export function runBulkRetention(
  input: BulkRetentionRequest,
  actor: RetentionActor,
  facilityId: string,
): BulkRetentionResult {
  const action: BulkRetentionAction = input.action
  const category = input.category ?? 'all'
  const requestedIds =
    Array.isArray(input.sessionIds) && input.sessionIds.length > 0
      ? input.sessionIds
      : sessionsForCategory(facilityId, category)

  const within = new Set(sessionsForCategory(facilityId, category))
  const details: BulkRetentionResult['details'] = []
  let affected = 0
  let skipped = 0

  for (const sessionId of requestedIds) {
    const session = getSessionIncludingDeleted(sessionId)
    if (!session || session.facilityId !== facilityId || !within.has(sessionId)) {
      skipped += 1
      details.push({ sessionId, status: 'skipped', message: 'Not a live case in this facility.' })
      continue
    }
    try {
      applyBulkAction(action, sessionId, input.extraDays, actor)
      affected += 1
      details.push({ sessionId, status: 'ok', message: `${action} applied.` })
    } catch (err) {
      skipped += 1
      details.push({ sessionId, status: 'skipped', message: err instanceof HttpError ? err.message : 'Action failed.' })
    }
  }

  recordRetentionAction({
    action: 'job.run',
    detail: `Bulk retention "${action}" on ${affected} case(s) (category ${category}); ${skipped} skipped.`,
    actor,
  })
  addAudit({
    sessionId: 'retention',
    actor: actor.name,
    role: actor.role,
    action: 'retention.bulk-run',
    detail: `Bulk "${action}" applied to ${affected} case(s) in category ${category}; ${skipped} skipped.`,
    category: 'system',
  })

  return {
    ranAt: new Date().toISOString(),
    action,
    category,
    requested: requestedIds.length,
    affected,
    skipped,
    details,
  }
}

function applyBulkAction(action: BulkRetentionAction, sessionId: string, extraDays: number | undefined, actor: RetentionActor): void {
  switch (action) {
    case 'export':
      buildSessionExport(sessionId, actor)
      return
    case 'extend':
      if (!Number.isInteger(extraDays) || (extraDays ?? 0) < 1) throw new HttpError(400, 'extraDays must be a positive integer.')
      extendSessionRetention({ sessionId, days: extraDays as number }, actor)
      return
    case 'soft-delete': {
      const session = getSessionIncludingDeleted(sessionId)
      if (!session || session.deletedAt) throw new HttpError(409, 'Case already deleted.')
      eraseSessionData(sessionId, actor, 'bulk:soft-delete')
      return
    }
    case 'anonymise': {
      const handler = RETENTION_HANDLERS['patient-sessions']
      if (handler.anonymise) handler.anonymise(sessionId)
      return
    }
    case 'run-now':
    default:
      eraseSessionData(sessionId, actor, 'bulk:run-now')
  }
}

/* ------------------------------------------------------------------ */
/*  Audit pruning                                                      */
/* ------------------------------------------------------------------ */

/**
 * Chain-preserving bulk prune of audit entries older than `before`. Entries are
 * replaced by tombstones (never hard-deleted) so verification still passes.
 */
export function pruneAuditRange(input: { before: string }, actor: RetentionActor, facilityId: string): PruneAuditResult {
  const before = Date.parse(input.before)
  if (!Number.isFinite(before)) throw new HttpError(400, 'before must be an ISO date string.')
  const targets = listAudit(undefined, facilityId).filter((entry) => Date.parse(entry.at) < before && !entry.pruned)
  let pruned = 0
  for (const entry of targets) {
    if (pruneAuditEntry(entry.id, 'manual-prune', actor.name)) pruned += 1
  }
  if (pruned > 0) {
    addAudit({
      sessionId: 'audit',
      actor: actor.name,
      role: actor.role,
      action: 'audit.pruned',
      detail: `${pruned} audit entr${pruned === 1 ? 'y' : 'ies'} pruned before ${input.before} — chain continuity preserved.`,
      category: 'system',
    })
  }
  const remaining = listAudit(undefined, facilityId).length
  const verification = verifyAuditChain(facilityId)
  recordRetentionAction({
    action: 'data.deleted',
    category: 'audit-entries',
    detail: `Manual audit prune removed identifiers from ${pruned} entr${pruned === 1 ? 'y' : 'ies'} (before ${input.before}).`,
    actor,
  })
  return {
    ranAt: new Date().toISOString(),
    before: input.before,
    pruned,
    remaining,
    chainIntact: verification.valid,
  }
}
