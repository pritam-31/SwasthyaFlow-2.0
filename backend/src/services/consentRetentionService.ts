import { randomUUID } from 'node:crypto'
import { HttpError } from '../middleware/errorHandler'
import type { AuthUser } from './authStore'
import { addAudit } from './auditStore'
import { getRetentionRule, POLICY_VERSION } from './retentionConfig'
import { eraseSessionData, getSessionRetentionTargets, recordRetentionAction } from './retentionService'
import { addTombstone } from './tombstoneStore'
import {
  getConsentRecord,
  getSessionIncludingDeleted,
  listConsentRecords,
  listSessionsForFacility,
  setConsentRecord,
  updateSession,
} from './sessionStore'
import { getStoredImage, saveStoredImage } from './imageStore'
import { enforceNonDiagnostic } from './reportParser'
import { anonymiseText } from './unifiedAnonymizer'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  listConsentEvents as loadConsentEvents,
  listConsentPolicyVersions as loadConsentPolicyVersions,
  upsertConsentEvent,
  upsertConsentPolicyVersion,
} from '../repositories/consentRepository'
import {
  CONSENT_WITHDRAWAL_REASON_CODES,
  isWithdrawalReasonCode,
  type ConsentCoverage,
  type ConsentCoverageRow,
  type ConsentEvent,
  type ConsentHistoryEntry,
  type ConsentPolicyVersion,
  type ConsentReceipt,
  type ConsentReGrantResult,
  type ConsentState,
  type ConsentVersionUpgradeResult,
  type ConsentWithdrawalPreview,
  type ConsentWithdrawalRequest,
  type ConsentWithdrawalResult,
} from '../types'
import type { ConsentImpactCategory, ConsentRecord, RetentionCategory } from '../types'

/**
 * Consent-linked data retention (P0-6).
 *
 * Consent is recorded at intake against the published policy version and the
 * retention policy is linked to it. Revoking consent beats the schedule: the
 * case is erased on the spot while the consent proof (and a consent tombstone)
 * survives as evidence that processing stopped.
 */

export const CONSENT_PURPOSES: string[] = [
  'Symptom organisation and timeline preparation',
  'Report / OCR extraction marked for verification',
  'Healthcare-worker and doctor review',
]

function actor(user: AuthUser): { name: string; role: AuthUser['role'] } {
  return { name: user.displayName, role: user.role }
}

/** Records consent for a freshly created session (called from POST /api/sessions). */
export function grantConsent(sessionId: string, user: AuthUser): ConsentRecord {
  const timestamp = new Date().toISOString()
  const record: ConsentRecord = {
    consentRecordId: `con-${randomUUID()}`,
    sessionId,
    policyVersion: POLICY_VERSION,
    purposes: [...CONSENT_PURPOSES],
    grantedAt: timestamp,
    grantedBy: user.displayName,
    grantedByRole: user.role,
    retentionLinkedAt: timestamp,
  }
  setConsentRecord(record)
  updateSession(sessionId, { consentRecordId: record.consentRecordId })

  addAudit({
    sessionId,
    actor: user.displayName,
    role: user.role,
    action: 'consent.granted',
    detail: `Consent recorded against policy ${POLICY_VERSION} for ${record.purposes.length} purpose(s); retention policy linked.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'consent.granted',
    targetId: sessionId,
    detail: `Consent recorded (policy ${POLICY_VERSION}) with retention linked.`,
    actor: actor(user),
  })
  recordConsentEvent({
    consentRecordId: record.consentRecordId,
    sessionId,
    kind: 'granted',
    policyVersion: record.policyVersion,
    purposes: record.purposes,
    actor: user.displayName,
    actorRole: user.role,
    facilityId: getSessionIncludingDeleted(sessionId)?.facilityId,
  })
  return record
}

/** The consent proof for a case, or null when none was recorded. */
export function getConsentForSession(sessionId: string): ConsentRecord | null {
  return getConsentRecord(sessionId) ?? null
}

export interface ConsentRevocationResult {
  consent: ConsentRecord
  wiped: RetentionCategory[]
}

/**
 * Withdraws consent for a case: the record is marked revoked first (so the
 * proof survives), then every session-scoped fragment is erased and the case
 * is hidden. Idempotent revocation answers 409 rather than double-erasing.
 */
export function revokeConsent(sessionId: string, user: AuthUser, reason?: string): ConsentRevocationResult {
  const record = getConsentRecord(sessionId)
  if (!record) throw new HttpError(404, 'No consent record exists for this case.')
  if (record.revokedAt) throw new HttpError(409, 'Consent already revoked.')

  const session = getSessionIncludingDeleted(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')

  const detail = (reason ?? '').trim() || 'Consent revoked — permission to process this case withdrawn.'
  const timestamp = new Date().toISOString()
  const revoked: ConsentRecord = {
    ...record,
    revokedAt: timestamp,
    revokedBy: user.displayName,
    revokedByRole: user.role,
  }
  setConsentRecord(revoked)

  const erased = eraseSessionData(sessionId, actor(user), detail)

  addTombstone({
    scope: 'consent',
    sessionId,
    patientId: session.patientId,
    reason: detail,
    deletedBy: user.displayName,
    deletedByRole: user.role,
  })
  addAudit({
    sessionId,
    actor: user.displayName,
    role: user.role,
    action: 'consent.revoked',
    detail: `${detail} · ${erased.wiped.length} data category(ies) wiped immediately; consent proof retained.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'consent.revoked',
    targetId: sessionId,
    detail: `${detail} · wiped: ${erased.wiped.length ? erased.wiped.join(', ') : 'nothing attached'}.`,
    actor: actor(user),
  })

  return { consent: revoked, wiped: erased.wiped }
}

/* ------------------------------------------------------------------ */
/*  Consent lifecycle (P2-17)                                          */
/* ------------------------------------------------------------------ */

const MAX_CONSENT_EVENTS = 2000

const consentEvents: ConsentEvent[] = []

/** Strips PII and clinical conclusions from a patient's free-text reason. */
function cleanReasonText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 500) throw new HttpError(400, 'reasonText must be 500 characters or fewer.')
  const anonymised = anonymiseText(trimmed, 'audit-detail').text
  return enforceNonDiagnostic(anonymised).trim() || undefined
}

function recordConsentEvent(input: {
  consentRecordId: string
  sessionId: string
  kind: ConsentEvent['kind']
  policyVersion: string
  purposes: string[]
  actor: string
  actorRole: AuthUser['role']
  facilityId?: string
  reasonCode?: ConsentEvent['reasonCode']
  reasonText?: string
  previousConsentId?: string
}): ConsentEvent {
  const event: ConsentEvent = {
    id: `cev-${randomUUID()}`,
    facilityId: input.facilityId ?? getSessionIncludingDeleted(input.sessionId)?.facilityId ?? 'facility-default',
    consentRecordId: input.consentRecordId,
    sessionId: input.sessionId,
    kind: input.kind,
    policyVersion: input.policyVersion,
    purposes: [...input.purposes],
    at: new Date().toISOString(),
    actor: input.actor,
    actorRole: input.actorRole,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.reasonText ? { reasonText: input.reasonText } : {}),
    ...(input.previousConsentId ? { previousConsentId: input.previousConsentId } : {}),
  }
  consentEvents.unshift(event)
  if (consentEvents.length > MAX_CONSENT_EVENTS) consentEvents.length = MAX_CONSENT_EVENTS
  if (persistenceEnabled()) enqueue('consent-event:' + event.id, () => upsertConsentEvent(event))
  return event
}

export function listConsentEventsForSession(sessionId: string): ConsentEvent[] {
  return consentEvents.filter((event) => event.sessionId === sessionId)
}

export function countConsentEvents(): number {
  return consentEvents.length
}

export function clearConsentEvents(): void {
  consentEvents.length = 0
}

export function listConsentVersions(): ConsentPolicyVersion[] {
  ensureConsentVersionsSeeded()
  return consentPolicyVersions.map((version) => ({ ...version }))
}

let consentPolicyVersions: ConsentPolicyVersion[] = []

function ensureConsentVersionsSeeded(): void {
  if (consentPolicyVersions.length > 0) return
  consentPolicyVersions = [defaultPolicyVersion()]
}

function defaultPolicyVersion(): ConsentPolicyVersion {
  return {
    version: POLICY_VERSION,
    publishedAt: new Date(0).toISOString(),
    publishedBy: 'system',
    summary: 'Baseline consent policy: anonymised, non-diagnostic case processing with linked retention.',
  }
}

export function currentConsentVersion(): ConsentPolicyVersion {
  ensureConsentVersionsSeeded()
  return { ...consentPolicyVersions[0] }
}

export function publishConsentVersion(input: { version: string; publishedBy: string; summary: string }): ConsentPolicyVersion {
  const version = input.version.trim()
  if (!version) throw new HttpError(400, 'version is required.')
  if (consentPolicyVersions.some((entry) => entry.version === version)) {
    throw new HttpError(409, `Consent policy version ${version} already exists.`)
  }
  const published: ConsentPolicyVersion = {
    version,
    publishedAt: new Date().toISOString(),
    publishedBy: input.publishedBy,
    summary: enforceNonDiagnostic(anonymiseText(input.summary.trim() || 'Consent policy update.', 'audit-detail').text),
  }
  consentPolicyVersions.unshift(published)
  if (persistenceEnabled()) enqueue('consent-policy-version:' + published.version, () => upsertConsentPolicyVersion(published))
  return { ...published }
}

/** Boot: load policy versions + events from Mongo, seeding the baseline version. */
export async function hydrateConsent(): Promise<void> {
  ensureConsentVersionsSeeded()
  if (!persistenceEnabled()) return
  const storedVersions = await loadConsentPolicyVersions()
  if (storedVersions.length > 0) {
    const merged = new Map<string, ConsentPolicyVersion>()
    for (const version of consentPolicyVersions) merged.set(version.version, version)
    for (const version of storedVersions) merged.set(version.version, version)
    consentPolicyVersions = [...merged.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  } else {
    for (const version of consentPolicyVersions) {
      await upsertConsentPolicyVersion(version)
    }
  }
  const events = await loadConsentEvents()
  consentEvents.length = 0
  consentEvents.push(...events.slice(0, MAX_CONSENT_EVENTS))
}

function facilityGuard(sessionId: string, facilityId?: string): { session: NonNullable<ReturnType<typeof getSessionIncludingDeleted>>; record: ConsentRecord } {
  const session = getSessionIncludingDeleted(sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (facilityId && session.facilityId !== facilityId) throw new HttpError(404, 'Session not found.')
  const record = getConsentRecord(sessionId)
  if (!record) throw new HttpError(404, 'No consent record exists for this case.')
  return { session, record }
}

/** What the patient loses by withdrawing — the impact preview. */
export function previewConsentWithdrawal(sessionId: string, facilityId?: string): ConsentWithdrawalPreview {
  const { record } = facilityGuard(sessionId, facilityId)
  const byCategory = new Map<RetentionCategory, number>()
  for (const target of getSessionRetentionTargets(sessionId)) {
    byCategory.set(target.category, (byCategory.get(target.category) ?? 0) + 1)
  }

  const rows: ConsentImpactCategory[] = []
  const willWipe: RetentionCategory[] = []
  for (const [category, total] of byCategory) {
    rows.push({
      category,
      label: getRetentionRule(category).label,
      total,
      willBeDeleted: total,
      retained: 0,
      whyRetained: 'withdrawn-immediately',
    })
    willWipe.push(category)
  }

  // The consent proof, deletion proof and audit trail survive withdrawal.
  const willRetain: RetentionCategory[] = ['consent-records', 'tombstones', 'audit-entries']
  for (const category of willRetain) {
    rows.push({
      category,
      label: getRetentionRule(category).label,
      total: category === 'consent-records' ? 1 : 0,
      willBeDeleted: 0,
      retained: category === 'consent-records' ? 1 : 0,
      whyRetained: category === 'audit-entries' ? 'audit-proof' : category === 'tombstones' ? 'deletion-proof' : 'consent-proof',
    })
  }

  return {
    sessionId,
    consentRecordId: record.consentRecordId,
    policyVersion: record.policyVersion,
    categories: rows,
    willWipe,
    willRetain,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Withdraws consent (patient-owned). Idempotent: a repeat call returns the
 * existing revoked record without erasing again.
 */
export function withdrawConsent(input: {
  sessionId: string
  facilityId?: string
  user: AuthUser
  request: ConsentWithdrawalRequest
}): ConsentWithdrawalResult {
  const { session, record } = facilityGuard(input.sessionId, input.facilityId)
  const request = input.request ?? ({} as ConsentWithdrawalRequest)
  if (!isWithdrawalReasonCode(request.reasonCode)) {
    throw new HttpError(400, `reasonCode must be one of: ${CONSENT_WITHDRAWAL_REASON_CODES.join(', ')}.`)
  }
  const reasonText = cleanReasonText(request.reasonText)

  if (record.revokedAt) {
    const existing = consentEvents.find((event) => event.sessionId === input.sessionId && event.kind === 'revoked')
    const fallback: ConsentEvent = existing ?? recordConsentEvent({
      consentRecordId: record.consentRecordId,
      sessionId: input.sessionId,
      kind: 'revoked',
      policyVersion: record.policyVersion,
      purposes: record.purposes,
      actor: input.user.displayName,
      actorRole: input.user.role,
      facilityId: session.facilityId,
      reasonCode: record.withdrawalReasonCode as ConsentEvent['reasonCode'],
    })
    return { consent: record, event: fallback, wiped: [], tombstoneId: '' }
  }

  const timestamp = new Date().toISOString()
  const revoked: ConsentRecord = {
    ...record,
    revokedAt: timestamp,
    revokedBy: input.user.displayName,
    revokedByRole: input.user.role,
    withdrawalReasonCode: request.reasonCode,
    ...(reasonText ? { withdrawalReasonText: reasonText } : {}),
  }
  setConsentRecord(revoked)

  const detailKey = `withdrawal:${request.reasonCode}`
  const event = recordConsentEvent({
    consentRecordId: record.consentRecordId,
    sessionId: input.sessionId,
    kind: 'revoked',
    policyVersion: record.policyVersion,
    purposes: record.purposes,
    actor: input.user.displayName,
    actorRole: input.user.role,
    facilityId: session.facilityId,
    reasonCode: request.reasonCode,
    ...(reasonText ? { reasonText } : {}),
  })

  const erased = eraseSessionData(input.sessionId, actor(input.user), detailKey)
  const tombstone = addTombstone({
    scope: 'consent',
    sessionId: input.sessionId,
    patientId: session.patientId,
    reason: `${detailKey}${reasonText ? ` — ${reasonText}` : ''}`,
    deletedBy: input.user.displayName,
    deletedByRole: input.user.role,
  })

  addAudit({
    sessionId: input.sessionId,
    actor: input.user.displayName,
    role: input.user.role,
    action: 'consent.revoked',
    detail: `Consent withdrawn (${request.reasonCode}) · ${erased.wiped.length} data category(ies) wiped immediately; consent proof retained.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'consent.revoked',
    targetId: input.sessionId,
    detail: `Consent withdrawn (${request.reasonCode}) · wiped: ${erased.wiped.length ? erased.wiped.join(', ') : 'nothing attached'}.`,
    actor: actor(input.user),
  })

  return { consent: revoked, event, wiped: erased.wiped, tombstoneId: tombstone.id }
}

/** Re-grants consent for a case whose consent was withdrawn (patient-owned). */
export function reGrantConsent(input: { sessionId: string; facilityId?: string; user: AuthUser }): ConsentReGrantResult {
  const { session, record } = facilityGuard(input.sessionId, input.facilityId)
  if (!record.revokedAt) throw new HttpError(409, 'Consent is already active for this case.')

  const timestamp = new Date().toISOString()
  const reGranted: ConsentRecord = {
    ...record,
    policyVersion: POLICY_VERSION,
    purposes: [...CONSENT_PURPOSES],
    grantedAt: timestamp,
    grantedBy: input.user.displayName,
    grantedByRole: input.user.role,
    revokedAt: undefined,
    revokedBy: undefined,
    revokedByRole: undefined,
    withdrawalReasonCode: undefined,
    withdrawalReasonText: undefined,
    previousConsentId: record.consentRecordId,
  }
  setConsentRecord(reGranted)

  const event = recordConsentEvent({
    consentRecordId: record.consentRecordId,
    sessionId: input.sessionId,
    kind: 're-granted',
    policyVersion: reGranted.policyVersion,
    purposes: reGranted.purposes,
    actor: input.user.displayName,
    actorRole: input.user.role,
    facilityId: session.facilityId,
    previousConsentId: record.consentRecordId,
  })

  addAudit({
    sessionId: input.sessionId,
    actor: input.user.displayName,
    role: input.user.role,
    action: 'consent.re-granted',
    detail: `Consent re-granted under policy ${POLICY_VERSION}; case processing permitted again.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'consent.granted',
    targetId: input.sessionId,
    detail: `Consent re-granted (policy ${POLICY_VERSION}).`,
    actor: actor(input.user),
  })

  return { consent: reGranted, event }
}

/** Upgrades an active consent to the current policy version (patient-owned). */
export function upgradeConsentVersion(input: { sessionId: string; facilityId?: string; user: AuthUser }): ConsentVersionUpgradeResult {
  const { session, record } = facilityGuard(input.sessionId, input.facilityId)
  if (record.revokedAt) throw new HttpError(409, 'Consent has been withdrawn and cannot be upgraded — re-grant first.')
  if (record.policyVersion === POLICY_VERSION) {
    throw new HttpError(409, `Consent is already on the current policy version (${POLICY_VERSION}).`)
  }

  const fromVersion = record.policyVersion
  const upgraded: ConsentRecord = { ...record, policyVersion: POLICY_VERSION, previousConsentId: record.consentRecordId }
  setConsentRecord(upgraded)

  const event = recordConsentEvent({
    consentRecordId: record.consentRecordId,
    sessionId: input.sessionId,
    kind: 'version-upgraded',
    policyVersion: POLICY_VERSION,
    purposes: upgraded.purposes,
    actor: input.user.displayName,
    actorRole: input.user.role,
    facilityId: session.facilityId,
    previousConsentId: record.consentRecordId,
  })

  addAudit({
    sessionId: input.sessionId,
    actor: input.user.displayName,
    role: input.user.role,
    action: 'consent.version-upgraded',
    detail: `Consent upgraded from ${fromVersion} to ${POLICY_VERSION}.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'consent.granted',
    targetId: input.sessionId,
    detail: `Consent upgraded ${fromVersion} → ${POLICY_VERSION}.`,
    actor: actor(input.user),
  })

  return { consent: upgraded, event, fromVersion, toVersion: POLICY_VERSION }
}

/** Full consent history for one case, newest first. */
export function getConsentHistory(sessionId: string, facilityId?: string): ConsentHistoryEntry[] {
  facilityGuard(sessionId, facilityId)
  return listConsentEventsForSession(sessionId).map((event) => ({ ...event }))
}

function consentStateOf(record: ConsentRecord | undefined): ConsentState {
  if (!record) return 'none'
  return record.revokedAt ? 'revoked' : 'granted'
}

/** Facility consent coverage (admin view). */
export function getConsentCoverage(facilityId: string): ConsentCoverage {
  const sessions = listSessionsForFacility(facilityId)
  const rows: ConsentCoverageRow[] = sessions.map((session) => {
    const record = getConsentRecord(session.id)
    return {
      sessionId: session.id,
      patientId: session.patientId,
      consentRecordId: record?.consentRecordId ?? null,
      state: consentStateOf(record),
      policyVersion: record?.policyVersion ?? null,
      grantedAt: record?.grantedAt ?? null,
      revokedAt: record?.revokedAt ?? null,
    }
  })
  const granted = rows.filter((row) => row.state === 'granted').length
  const revoked = rows.filter((row) => row.state === 'revoked').length
  const none = rows.filter((row) => row.state === 'none').length
  return { facilityId, generatedAt: new Date().toISOString(), total: rows.length, granted, revoked, none, rows }
}

/* ------------------------------------------------------------------ */
/*  Consent receipts                                                   */
/* ------------------------------------------------------------------ */

const RECEIPT_DISCLAIMER =
  'Proof-of-consent receipt. It records what the patient agreed to and when — it is not a diagnosis, a prescription or treatment advice. The receipt reference expires after 1 day.'

function buildReceipt(record: ConsentRecord): ConsentReceipt {
  return {
    ref: `cr-${randomUUID()}`,
    sessionId: record.sessionId,
    consentRecordId: record.consentRecordId,
    policyVersion: record.policyVersion,
    purposes: [...record.purposes],
    grantedAt: record.grantedAt,
    grantedBy: record.grantedBy,
    grantedByRole: record.grantedByRole,
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    ...(record.revokedBy ? { revokedBy: record.revokedBy } : {}),
    ...(record.revokedByRole ? { revokedByRole: record.revokedByRole } : {}),
    ...(record.withdrawalReasonCode ? { withdrawalReasonCode: record.withdrawalReasonCode as ConsentReceipt['withdrawalReasonCode'] } : {}),
    generatedAt: new Date().toISOString(),
    disclaimer: RECEIPT_DISCLAIMER,
  }
}

/** Generates a downloadable proof-of-consent receipt (short-lived ref). */
export function generateConsentReceipt(input: { sessionId: string; facilityId?: string; user: AuthUser }): ConsentReceipt {
  const { record } = facilityGuard(input.sessionId, input.facilityId)
  const receipt = buildReceipt(record)
  saveStoredImage(receipt.ref, Buffer.from(JSON.stringify(receipt, null, 2), 'utf8'), 'export', { sessionId: input.sessionId })
  addAudit({
    sessionId: input.sessionId,
    actor: input.user.displayName,
    role: input.user.role,
    action: 'consent.receipt-generated',
    detail: `Proof-of-consent receipt generated (ref ${receipt.ref}).`,
    category: 'export',
  })
  return receipt
}

/** Reads a stored receipt back; refs older than 1 day are gone. */
export function getConsentReceipt(ref: string): ConsentReceipt | null {
  const stored = getStoredImage(ref)
  if (!stored || stored.category !== 'export') return null
  if (!Number.isFinite(Date.parse(stored.createdAt)) || Date.now() - Date.parse(stored.createdAt) > 86_400_000) return null
  try {
    return JSON.parse(stored.buffer.toString('utf8')) as ConsentReceipt
  } catch {
    return null
  }
}

/** Convenience for the patient-facing list: every consent record they own. */
export function listConsentForOwner(ownerId: string): Array<{ sessionId: string; record: ConsentRecord }> {
  return listConsentRecords()
    .filter((record) => getSessionIncludingDeleted(record.sessionId)?.ownerId === ownerId)
    .map((record) => ({ sessionId: record.sessionId, record }))
}
