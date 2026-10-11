import { randomUUID } from 'node:crypto'
import { HttpError } from '../middleware/errorHandler'
import type {
  ExtractedReport,
  OcrTextHold,
  PatientSession,
  RetentionAction,
  RetentionActionKind,
  RetentionActor,
  RetentionCategory,
  RetentionCategoryResult,
  RetentionJobResult,
  RetentionMode,
  RetentionPolicy,
  RetentionStatusRow,
  RetentionTarget,
  TriageNote,
  VisualRecord,
} from '../types'
import { addAudit, listAudit, pruneAuditEntry } from './auditStore'
import { deleteLoginSession, deleteUser, listDeactivatedUsers, listLoginSessions } from './authStore'
import { deleteAppLogLine, listAppLog, pushAppLog } from './appLogStore'
import { anonymiseText } from './unifiedAnonymizer'
import {
  deleteRedactedImage,
  deleteStoredImage,
  deleteStoredImagesForSession,
  getStoredImage,
  listStoredImages,
  reportSourceImageId,
} from './imageStore'
import {
  applyRetentionOverride,
  DAY_MS,
  getRetentionRule,
  isRetentionCategory,
  listRetentionOverrides,
  MAX_RETENTION_DAYS,
  retentionExpiry,
  retentionKey,
  SHELL_PURGE_DELAY_DAYS,
  updateRetentionPolicy,
} from './retentionConfig'
import {
  deleteConsentRecord,
  deleteRedactionMap,
  getSessionIncludingDeleted,
  hardDeleteSession,
  listConsentRecords,
  listRedactionMaps,
  listSeededSessionIds,
  listSessionsIncludingDeleted,
  removeReport,
  removeVisual,
  replaceReport,
  replaceVisual,
  softDeleteSession,
  updateSession,
} from './sessionStore'
import { addTombstone, deleteTombstone, listTombstones } from './tombstoneStore'
import { listAllFeedback, softDeleteFeedbackForRetention } from './feedbackService'

/**
 * Data-retention engine (P0-6).
 *
 * Every category is served by a handler record — `list` what exists, `remove`
 * it, optionally `anonymise` it instead, and `collect` it for an export. The
 * sweep walks a fixed order (sessions first, then their fields, then system
 * buffers) so a case is hidden before its fragments are wiped.
 *
 * Nothing here diagnoses, prescribes or advises treatment.
 */

/* ------------------------------------------------------------------ */
/*  Category order + session-scoped categories                         */
/* ------------------------------------------------------------------ */

const SESSION_FIELD_CATEGORIES: RetentionCategory[] = [
  'triage-notes',
  'timeline',
  'reports',
  'report-source-files',
  'visuals',
  'follow-up-qa',
  'referrals',
  'extracted-text',
  'anonymisation-reports',
  'redaction-maps',
]

/** Sweep order: soft-delete due cases first, wipe their fields next, sweep system buffers last. */
const RUN_ORDER: RetentionCategory[] = [
  'patient-sessions',
  'demo-data',
  'triage-notes',
  'timeline',
  'reports',
  'report-source-files',
  'visuals',
  'visual-source-files',
  'original-images',
  'follow-up-qa',
  'referrals',
  'extracted-text',
  'anonymisation-reports',
  'redaction-maps',
  'consent-records',
  'audit-entries',
  'auth-sessions',
  'user-accounts',
  'ocr-raw-text',
  'export-files',
  'application-logs',
  'tombstones',
  'feedback',
]

/* ------------------------------------------------------------------ */
/*  Actor context                                                      */
/* ------------------------------------------------------------------ */

let currentActor: RetentionActor = { name: 'Retention scheduler', role: 'admin' }

/** Runs `fn` with `actor` recorded against every destructive write it makes. */
export function withRetentionActor<T>(actor: RetentionActor, fn: () => T): T {
  const previous = currentActor
  currentActor = actor
  try {
    return fn()
  } finally {
    currentActor = previous
  }
}

/* ------------------------------------------------------------------ */
/*  Retention action log (the human-readable history)                  */
/* ------------------------------------------------------------------ */

import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  listActions as loadRetentionActions,
  persistAction,
  persistRules,
  loadRules as loadRetentionRules,
} from '../repositories/retentionRepository'
import { applyStoredRuleState } from './retentionConfig'

const MAX_ACTIONS = 500
const actions: RetentionAction[] = []

export function recordRetentionAction(input: {
  action: RetentionActionKind
  detail: string
  actor?: RetentionActor
  category?: RetentionCategory
  targetId?: string
}): RetentionAction {
  const actor = input.actor ?? currentActor
  const entry: RetentionAction = {
    id: `rac-${randomUUID()}`,
    at: new Date().toISOString(),
    actor: actor.name,
    actorRole: actor.role,
    action: input.action,
    ...(input.category ? { category: input.category } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    detail: anonymiseText(input.detail, 'audit-detail').text,
  }
  actions.unshift(entry)
  if (persistenceEnabled()) enqueue('retention-action', () => persistAction(entry))
  if (actions.length > MAX_ACTIONS) actions.length = MAX_ACTIONS
  return entry
}

/** Newest first — surfaced in Settings for doctors and admins. */
export function listRetentionActions(): RetentionAction[] {
  return [...actions]
}

export function clearRetentionActions(): void {
  actions.length = 0
}

/* ------------------------------------------------------------------ */
/*  Raw OCR text hold (0-day `ocr-raw-text` rule)                      */
/* ------------------------------------------------------------------ */

const ocrHolds = new Map<string, OcrTextHold>()

/** Unreleased text older than this is treated as leaked and purged. */
const HOLD_ABANDON_MS = 60 * 60 * 1000

/** Holds raw OCR text for the duration of one processing run. */
export function holdOcrRawText(id: string, text: string): void {
  ocrHolds.set(id, { id, text, createdAt: new Date().toISOString() })
}

/** Marks a hold finished — the text is purged by the next sweep, never kept. */
export function releaseOcrRawText(id: string): void {
  const hold = ocrHolds.get(id)
  if (hold && !hold.releasedAt) ocrHolds.set(id, { ...hold, releasedAt: new Date().toISOString() })
}

export function getOcrHoldCount(): number {
  return ocrHolds.size
}

export function clearOcrHolds(): void {
  ocrHolds.clear()
}

/* ------------------------------------------------------------------ */
/*  Handler contract                                                   */
/* ------------------------------------------------------------------ */

export interface ExportCollector {
  add(category: RetentionCategory, item: unknown): void
}

export interface RetentionHandler {
  /** Every target of this category, each with the instant it becomes due. */
  list(): RetentionTarget[]
  /** Destroys one target. Returns true when something was actually removed. */
  remove(targetId: string): boolean
  /** Strips content but keeps the record shape (retention sweep in anonymise mode). */
  anonymise?(targetId: string): boolean
  /** Hides a case from user-facing surfaces (soft delete). */
  softDelete?(targetId: string): boolean
  /** Adds this target's contents to an export payload. */
  collect(targetId: string, into: ExportCollector): void
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function nowDue(expiresAt: string): boolean {
  const at = Date.parse(expiresAt)
  return Number.isFinite(at) && at <= Date.now()
}

/** Field-level targets of a soft-deleted case are due the moment it was hidden. */
function fieldExpiry(session: PatientSession, category: RetentionCategory, targetId: string, baseIso: string): string {
  if (session.deletedAt) return session.deletedAt
  return retentionExpiry(category, targetId, baseIso)
}

/** When the empty shell of a soft-deleted case is finally destroyed. */
function shellPurgeExpiry(session: PatientSession): string {
  const natural = new Date(Date.parse(session.deletedAt!) + SHELL_PURGE_DELAY_DAYS * DAY_MS).toISOString()
  const extended = listRetentionOverrides().find((entry) => entry.key === retentionKey('patient-sessions', session.id))
  return extended && extended.extendedUntil > natural ? extended.extendedUntil : natural
}

function findReportAny(reportId: string): { session: PatientSession; report: ExtractedReport } | undefined {
  for (const session of listSessionsIncludingDeleted()) {
    const report = session.reports.find((entry) => entry.id === reportId)
    if (report) return { session, report }
  }
  return undefined
}

function findVisualAny(visualId: string): { session: PatientSession; visual: VisualRecord } | undefined {
  for (const session of listSessionsIncludingDeleted()) {
    const visual = session.visuals.find((entry) => entry.id === visualId)
    if (visual) return { session, visual }
  }
  return undefined
}

function noOpCollect(_targetId: string, _into: ExportCollector): void {
  // This category is system-level: it never belongs in a patient export.
}

/* ------------------------------------------------------------------ */
/*  Case-level pipeline: wipe -> hide -> tombstone                     */
/* ------------------------------------------------------------------ */

function wipeSessionFields(sessionId: string): RetentionCategory[] {
  const wiped: RetentionCategory[] = []
  for (const category of SESSION_FIELD_CATEGORIES) {
    const handler = RETENTION_HANDLERS[category]
    let removed = 0
    for (const target of handler.list()) {
      if (target.sessionId !== sessionId) continue
      if (handler.remove(target.id)) removed += 1
    }
    if (removed > 0) wiped.push(category)
  }
  deleteStoredImagesForSession(sessionId)
  return wiped
}

function hideSession(sessionId: string): boolean {
  const hide = RETENTION_HANDLERS['patient-sessions'].softDelete
  return hide ? hide(sessionId) : false
}

/**
 * Erases every session-scoped fragment, hides the case and writes the
 * tombstone. Used by the retention sweep, the manual delete route and consent
 * withdrawal — one code path, one set of guarantees.
 */
export function eraseSessionData(
  sessionId: string,
  actor: RetentionActor,
  reason: string,
): { wiped: RetentionCategory[]; deletedAt: string } {
  return withRetentionActor(actor, () => {
    const session = getSessionIncludingDeleted(sessionId)
    if (!session) throw new HttpError(404, 'Session not found.')
    if (session.deletedAt) throw new HttpError(409, 'This case has already been deleted.')

    // Reasons are human-entered — strip PII before they reach any store (P0-7).
    const safeReason = anonymiseText(reason, 'audit-detail').text

    const wiped = wipeSessionFields(sessionId)
    hideSession(sessionId)

    addTombstone({
      scope: 'session',
      sessionId,
      patientId: session.patientId,
      reason: safeReason,
      deletedBy: actor.name,
      deletedByRole: actor.role,
    })
    addAudit({
      sessionId,
      actor: actor.name,
      role: actor.role,
      action: 'session.deleted',
      detail: `${safeReason} · ${wiped.length} data category(ies) wiped · case hidden, shell purged after ${SHELL_PURGE_DELAY_DAYS} days.`,
      category: 'system',
    })
    recordRetentionAction({
      action: 'session.deleted',
      targetId: sessionId,
      detail: `${safeReason} · wiped: ${wiped.length ? wiped.join(', ') : 'nothing attached'}.`,
    })

    return { wiped, deletedAt: getSessionIncludingDeleted(sessionId)?.deletedAt ?? new Date().toISOString() }
  })
}

/** Destroys the empty shell once its purge delay elapsed (consent proof survives). */
function purgeSessionShell(sessionId: string): boolean {
  const session = getSessionIncludingDeleted(sessionId)
  if (!session || !session.deletedAt) return false
  if (!nowDue(shellPurgeExpiry(session))) return false

  wipeSessionFields(sessionId)
  hardDeleteSession(sessionId)

  addAudit({
    sessionId,
    actor: currentActor.name,
    role: currentActor.role,
    action: 'session.purged',
    detail: `Empty shell purged ${SHELL_PURGE_DELAY_DAYS} days after deletion — consent record and tombstone retained.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'data.deleted',
    category: 'patient-sessions',
    targetId: sessionId,
    detail: 'Shell purged after the 7-day delay; consent proof and tombstone remain.',
  })
  return true
}

/* ------------------------------------------------------------------ */
/*  Handlers — one record per category (no switch statements)          */
/* ------------------------------------------------------------------ */

const patientSessionsHandler: RetentionHandler = {
  list() {
    return listSessionsIncludingDeleted().map((session) => ({
      id: session.id,
      sessionId: session.id,
      expiresAt: session.deletedAt ? shellPurgeExpiry(session) : retentionExpiry('patient-sessions', session.id, session.createdAt),
    }))
  },
  softDelete(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session || session.deletedAt) return false
    return Boolean(softDeleteSession(targetId))
  },
  remove(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session) return false
    if (session.deletedAt) return purgeSessionShell(targetId)
    eraseSessionData(targetId, currentActor, 'Retention: case reached its retention age.')
    return true
  },
  anonymise(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session || session.deletedAt) return false
    for (const category of SESSION_FIELD_CATEGORIES) {
      const handler = RETENTION_HANDLERS[category]
      for (const target of handler.list()) {
        if (target.sessionId !== targetId) continue
        if (handler.anonymise) handler.anonymise(target.id)
        else handler.remove(target.id)
      }
    }
    updateSession(targetId, { displayText: '', patientId: 'ANONYMISED' })
    recordRetentionAction({
      action: 'data.deleted',
      category: 'patient-sessions',
      targetId,
      detail: 'Case content anonymised in place — the record shell remains for traceability.',
    })
    return true
  },
  collect(targetId, into) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session) return
    into.add('patient-sessions', {
      id: session.id,
      patientId: session.patientId,
      displayText: session.displayText,
      language: session.language,
      ageBand: session.ageBand,
      sex: session.sex,
      intakePoint: session.intakePoint,
      facility: session.facility,
      status: session.status,
      createdBy: session.createdBy,
      createdByRole: session.createdByRole,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      deletedAt: session.deletedAt ?? null,
    })
  },
}

const demoDataHandler: RetentionHandler = {
  list() {
    const seeded = new Set(listSeededSessionIds())
    return listSessionsIncludingDeleted()
      .filter((session) => seeded.has(session.id))
      .map((session) => ({
        id: session.id,
        sessionId: session.id,
        expiresAt: session.deletedAt
          ? shellPurgeExpiry(session)
          : retentionExpiry('demo-data', session.id, session.createdAt),
      }))
  },
  remove(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session) return false
    if (session.deletedAt) return purgeSessionShell(targetId)
    eraseSessionData(targetId, currentActor, 'Retention: demo seed data reached its retention age.')
    return true
  },
  collect: noOpCollect,
}

const triageNotesHandler: RetentionHandler = {
  list() {
    return listSessionsIncludingDeleted()
      .filter((session) => session.note)
      .map((session) => ({
        id: session.id,
        sessionId: session.id,
        expiresAt: fieldExpiry(session, 'triage-notes', session.id, session.note!.generatedAt),
      }))
  },
  remove(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session?.note) return false
    updateSession(targetId, { note: null })
    return true
  },
  anonymise(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session?.note) return false
    const blank: TriageNote = {
      ...session.note,
      structuredNote: { chiefComplaint: '', history: '', vitals: '' },
      observations: [],
      missingInformation: [],
      followUpQuestions: [],
    }
    updateSession(targetId, { note: blank, overrides: [] })
    return true
  },
  collect(targetId, into) {
    const session = getSessionIncludingDeleted(targetId)
    if (session?.note) into.add('triage-notes', session.note)
  },
}

const timelineHandler: RetentionHandler = {
  list() {
    return listSessionsIncludingDeleted()
      .filter((session) => session.timeline)
      .map((session) => ({
        id: session.id,
        sessionId: session.id,
        expiresAt: fieldExpiry(session, 'timeline', session.id, session.createdAt),
      }))
  },
  remove(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session?.timeline) return false
    updateSession(targetId, { timeline: undefined })
    return true
  },
  collect(targetId, into) {
    const session = getSessionIncludingDeleted(targetId)
    if (session?.timeline) into.add('timeline', session.timeline)
  },
}

const reportsHandler: RetentionHandler = {
  list() {
    const targets: RetentionTarget[] = []
    for (const session of listSessionsIncludingDeleted()) {
      for (const report of session.reports) {
        targets.push({
          id: report.id,
          sessionId: session.id,
          expiresAt: fieldExpiry(session, 'reports', report.id, report.createdAt),
        })
      }
    }
    return targets
  },
  remove(targetId) {
    const found = findReportAny(targetId)
    if (!found) return false
    removeReport(found.session.id, targetId)
    deleteStoredImage(reportSourceImageId(targetId))
    return true
  },
  anonymise(targetId) {
    const found = findReportAny(targetId)
    if (!found) return false
    replaceReport(found.session.id, {
      ...found.report,
      fileName: 'Redacted report',
      redactedText: '',
      labValues: [],
      vitals: [],
      findings: [],
      warnings: [],
    })
    deleteStoredImage(reportSourceImageId(targetId))
    return true
  },
  collect(targetId, into) {
    const found = findReportAny(targetId)
    if (found) into.add('reports', found.report)
  },
}

function fileTarget(category: RetentionCategory, imageId: string, sessionId: string | undefined, createdAt: string): RetentionTarget {
  return {
    id: imageId,
    ...(sessionId ? { sessionId } : {}),
    expiresAt: retentionExpiry(category, imageId, createdAt),
  }
}

const reportSourceFilesHandler: RetentionHandler = {
  list() {
    return listStoredImages('report-source').map((entry) => fileTarget('report-source-files', entry.id, entry.sessionId, entry.createdAt))
  },
  remove(targetId) {
    return deleteStoredImage(targetId)
  },
  collect(targetId, into) {
    const stored = getStoredImage(targetId)
    if (stored) into.add('report-source-files', { id: stored.id, bytes: stored.buffer.byteLength, createdAt: stored.createdAt })
  },
}

const visualsHandler: RetentionHandler = {
  list() {
    const targets: RetentionTarget[] = []
    for (const session of listSessionsIncludingDeleted()) {
      for (const visual of session.visuals) {
        targets.push({
          id: visual.id,
          sessionId: session.id,
          expiresAt: fieldExpiry(session, 'visuals', visual.id, visual.createdAt),
        })
      }
    }
    return targets
  },
  remove(targetId) {
    const found = findVisualAny(targetId)
    if (!found) return false
    removeVisual(found.session.id, targetId)
    deleteRedactedImage(targetId)
    return true
  },
  anonymise(targetId) {
    const found = findVisualAny(targetId)
    if (!found) return false
    replaceVisual(found.session.id, {
      ...found.visual,
      fileName: 'Redacted photo',
      pii: [],
      piiSummary: { regionCount: 0, byType: [] },
      extraction: { ...found.visual.extraction, appearance: [], features: [], concerns: [] },
    })
    deleteRedactedImage(targetId)
    return true
  },
  collect(targetId, into) {
    const found = findVisualAny(targetId)
    if (found) into.add('visuals', found.visual)
  },
}

function neverStoredHandler(category: RetentionCategory, storedCategory: 'visual-original' | 'visual-source'): RetentionHandler {
  return {
    list() {
      return listStoredImages(storedCategory).map((entry) => fileTarget(category, entry.id, entry.sessionId, entry.createdAt))
    },
    remove(targetId) {
      return deleteStoredImage(targetId)
    },
    collect(targetId, into) {
      const stored = getStoredImage(targetId)
      if (stored) into.add(category, { id: stored.id, bytes: stored.buffer.byteLength, createdAt: stored.createdAt })
    },
  }
}

const followUpHandler: RetentionHandler = {
  list() {
    const targets: RetentionTarget[] = []
    for (const session of listSessionsIncludingDeleted()) {
      for (const question of session.note?.followUpQuestions ?? []) {
        targets.push({
          id: question.id,
          sessionId: session.id,
          expiresAt: fieldExpiry(session, 'follow-up-qa', question.id, question.createdAt),
        })
      }
    }
    return targets
  },
  remove(targetId) {
    for (const session of listSessionsIncludingDeleted()) {
      const questions = session.note?.followUpQuestions ?? []
      if (!questions.some((question) => question.id === targetId)) continue
      updateSession(session.id, {
        note: { ...session.note!, followUpQuestions: questions.filter((question) => question.id !== targetId) },
      })
      return true
    }
    return false
  },
  collect(targetId, into) {
    for (const session of listSessionsIncludingDeleted()) {
      const question = session.note?.followUpQuestions.find((entry) => entry.id === targetId)
      if (question) {
        into.add('follow-up-qa', question)
        return
      }
    }
  },
}

const referralsHandler: RetentionHandler = {
  list() {
    return listSessionsIncludingDeleted()
      .filter((session) => session.referral)
      .map((session) => ({
        id: session.id,
        sessionId: session.id,
        expiresAt: fieldExpiry(session, 'referrals', session.id, session.referral!.generatedAt),
      }))
  },
  remove(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session?.referral) return false
    updateSession(targetId, { referral: null })
    return true
  },
  collect(targetId, into) {
    const session = getSessionIncludingDeleted(targetId)
    if (session?.referral) into.add('referrals', session.referral)
  },
}

/** Clears the anonymised report text while leaving the value rows with the report. */
function clearExtractedText(targetId: string): boolean {
  const found = findReportAny(targetId)
  if (!found || !found.report.redactedText) return false
  replaceReport(found.session.id, { ...found.report, redactedText: '' })
  return true
}

const extractedTextHandler: RetentionHandler = {
  list() {
    const targets: RetentionTarget[] = []
    for (const session of listSessionsIncludingDeleted()) {
      for (const report of session.reports) {
        if (!report.redactedText) continue
        targets.push({
          id: report.id,
          sessionId: session.id,
          expiresAt: fieldExpiry(session, 'extracted-text', report.id, report.createdAt),
        })
      }
    }
    return targets
  },
  remove: clearExtractedText,
  anonymise: clearExtractedText,
  collect(targetId, into) {
    const found = findReportAny(targetId)
    if (found?.report.redactedText) into.add('extracted-text', { reportId: found.report.id, text: found.report.redactedText })
  },
}

const anonymisationReportsHandler: RetentionHandler = {
  list() {
    return listSessionsIncludingDeleted()
      .filter((session) => session.anonymization.redactedCount > 0)
      .map((session) => ({
        id: session.id,
        sessionId: session.id,
        expiresAt: fieldExpiry(session, 'anonymisation-reports', session.id, session.createdAt),
      }))
  },
  remove(targetId) {
    const session = getSessionIncludingDeleted(targetId)
    if (!session || session.anonymization.redactedCount === 0) return false
    updateSession(targetId, { anonymization: { redactedCount: 0, redactions: [] } })
    return true
  },
  collect(targetId, into) {
    const session = getSessionIncludingDeleted(targetId)
    if (session) into.add('anonymisation-reports', session.anonymization)
  },
}

const redactionMapsHandler: RetentionHandler = {
  list() {
    return listRedactionMaps().map((map) => {
      const session = getSessionIncludingDeleted(map.sessionId)
      return {
        id: map.sessionId,
        sessionId: map.sessionId,
        expiresAt: session
          ? fieldExpiry(session, 'redaction-maps', map.sessionId, map.createdAt)
          : retentionExpiry('redaction-maps', map.sessionId, map.createdAt),
      }
    })
  },
  remove(targetId) {
    return deleteRedactionMap(targetId)
  },
  collect(targetId, into) {
    const map = listRedactionMaps().find((entry) => entry.sessionId === targetId)
    if (map) into.add('redaction-maps', map)
  },
}

const consentRecordsHandler: RetentionHandler = {
  list() {
    return listConsentRecords().map((record) => ({
      id: record.consentRecordId,
      sessionId: record.sessionId,
      expiresAt: retentionExpiry('consent-records', record.consentRecordId, record.grantedAt),
    }))
  },
  remove(targetId) {
    return deleteConsentRecord(targetId)
  },
  collect(targetId, into) {
    const record = listConsentRecords().find((entry) => entry.consentRecordId === targetId)
    if (record) into.add('consent-records', record)
  },
}

const auditEntriesHandler: RetentionHandler = {
  list() {
    return listAudit().map((entry) => ({
      id: entry.id,
      ...(entry.sessionId.startsWith('sess-') ? { sessionId: entry.sessionId } : {}),
      expiresAt: retentionExpiry('audit-entries', entry.id, entry.at),
    }))
  },
  remove(targetId) {
    const entry = listAudit().find((candidate) => candidate.id === targetId)
    if (!entry) return false
    // Audit entries are never hard-deleted (P2-16) — the retention sweep prunes
    // them into chain-preserving tombstones so the hash chain stays verifiable.
    const done = pruneAuditEntry(targetId, 'audit-entries', currentActor.name)
    if (done && !entry.pruned) {
      addAudit({
        facilityId: entry.facilityId,
        sessionId: 'audit',
        actor: currentActor.name,
        role: currentActor.role,
        action: 'audit.entry-pruned',
        detail: `Audit entry #${entry.sequenceNumber} pruned by retention rule "audit-entries" — chain continuity preserved.`,
        category: 'system',
      })
    }
    return done
  },
  collect(targetId, into) {
    const entry = listAudit().find((candidate) => candidate.id === targetId)
    if (entry) into.add('audit-entries', entry)
  },
}

const authSessionsHandler: RetentionHandler = {
  list() {
    return listLoginSessions().map((session) => ({
      id: session.token,
      expiresAt: retentionExpiry('auth-sessions', session.token, session.expiresAt),
    }))
  },
  remove(targetId) {
    return deleteLoginSession(targetId)
  },
  collect: noOpCollect,
}

const userAccountsHandler: RetentionHandler = {
  list() {
    return listDeactivatedUsers().map((user) => ({
      id: user.id,
      expiresAt: retentionExpiry('user-accounts', user.id, user.deactivatedAt),
    }))
  },
  remove(targetId) {
    try {
      deleteUser(targetId)
      return true
    } catch {
      return false
    }
  },
  collect: noOpCollect,
}

const ocrRawTextHandler: RetentionHandler = {
  list() {
    const targets: RetentionTarget[] = []
    for (const hold of ocrHolds.values()) {
      const abandoned = !hold.releasedAt && Date.now() - Date.parse(hold.createdAt) > HOLD_ABANDON_MS
      const base = hold.releasedAt ?? (abandoned ? hold.createdAt : undefined)
      if (!base) continue
      targets.push({ id: hold.id, expiresAt: retentionExpiry('ocr-raw-text', hold.id, base) })
    }
    return targets
  },
  remove(targetId) {
    return ocrHolds.delete(targetId)
  },
  collect: noOpCollect,
}

const exportFilesHandler: RetentionHandler = {
  list() {
    return listStoredImages('export').map((entry) => fileTarget('export-files', entry.id, entry.sessionId, entry.createdAt))
  },
  remove(targetId) {
    return deleteStoredImage(targetId)
  },
  collect: noOpCollect,
}

const tombstonesHandler: RetentionHandler = {
  list() {
    return listTombstones().map((entry) => ({
      id: entry.id,
      expiresAt: retentionExpiry('tombstones', entry.id, entry.deletedAt),
    }))
  },
  remove(targetId) {
    return deleteTombstone(targetId)
  },
  collect: noOpCollect,
}

const applicationLogsHandler: RetentionHandler = {
  list() {
    return listAppLog().map((entry) => ({
      id: entry.id,
      expiresAt: retentionExpiry('application-logs', entry.id, entry.at),
    }))
  },
  remove(targetId) {
    return deleteAppLogLine(targetId)
  },
  collect: noOpCollect,
}

const feedbackHandler: RetentionHandler = {
  list() {
    return listAllFeedback()
      .filter((item) => item.status !== 'deleted')
      .map((item) => ({
        id: item.id,
        ...(item.sessionId ? { sessionId: item.sessionId } : {}),
        expiresAt: retentionExpiry('feedback', item.id, item.createdAt),
      }))
  },
  remove(targetId) {
    return softDeleteFeedbackForRetention(targetId)
  },
  collect: noOpCollect,
}

/** One handler per category — the compiler rejects a missing entry. */
export const RETENTION_HANDLERS: Record<RetentionCategory, RetentionHandler> = {
  'patient-sessions': patientSessionsHandler,
  'triage-notes': triageNotesHandler,
  timeline: timelineHandler,
  reports: reportsHandler,
  'report-source-files': reportSourceFilesHandler,
  visuals: visualsHandler,
  'visual-source-files': neverStoredHandler('visual-source-files', 'visual-source'),
  'original-images': neverStoredHandler('original-images', 'visual-original'),
  'follow-up-qa': followUpHandler,
  referrals: referralsHandler,
  'audit-entries': auditEntriesHandler,
  'auth-sessions': authSessionsHandler,
  'user-accounts': userAccountsHandler,
  'consent-records': consentRecordsHandler,
  'anonymisation-reports': anonymisationReportsHandler,
  'redaction-maps': redactionMapsHandler,
  'ocr-raw-text': ocrRawTextHandler,
  'extracted-text': extractedTextHandler,
  'demo-data': demoDataHandler,
  'export-files': exportFilesHandler,
  tombstones: tombstonesHandler,
  'application-logs': applicationLogsHandler,
  feedback: feedbackHandler,
}

/* ------------------------------------------------------------------ */
/*  Policy + status views                                              */
/* ------------------------------------------------------------------ */

/** Applies an admin policy edit, then records it (action log + audit). */
export function saveRetentionPolicy(
  rules: Array<{ category: unknown; retentionDays?: unknown; enabled?: unknown }>,
  actor: RetentionActor,
): RetentionPolicy {
  const policy = updateRetentionPolicy({ rules, updatedBy: actor.name })
  if (persistenceEnabled()) enqueue('retention-rules', () => persistRules(policy.rules.map((r) => ({ ...r, version: policy.version, updatedAt: new Date().toISOString(), updatedBy: actor.name }))))
  recordRetentionAction({
    action: 'policy.updated',
    detail: `Retention policy updated (${rules.length} rule(s) submitted) — policy ${policy.version}.`,
    actor,
  })
  addAudit({
    sessionId: 'retention',
    actor: actor.name,
    role: actor.role,
    action: 'retention.policy_updated',
    detail: `Retention policy rules updated: ${policy.rules.map((rule) => `${rule.category}=${rule.retentionDays}d`).join(', ')}.`,
    category: 'system',
  })
  return policy
}

/** Per-category inventory: how much exists, how much is due right now. */
export function getRetentionStatus(): RetentionStatusRow[] {
  return RUN_ORDER.map((category) => {
    const rule = getRetentionRule(category)
    const targets = RETENTION_HANDLERS[category].list()
    return {
      category,
      label: rule.label,
      retentionDays: rule.retentionDays,
      enabled: rule.enabled,
      scope: rule.scope,
      total: targets.length,
      eligible: targets.filter((target) => nowDue(target.expiresAt)).length,
    }
  })
}

/* ------------------------------------------------------------------ */
/*  The sweep                                                          */
/* ------------------------------------------------------------------ */

export function runRetentionJob(options: { actor?: RetentionActor; mode?: RetentionMode } = {}): RetentionJobResult {
  const actor = options.actor ?? { name: 'Retention scheduler', role: 'admin' }
  const mode: RetentionMode = options.mode ?? 'delete'
  const startedAt = Date.now()
  const ranAt = new Date().toISOString()

  return withRetentionActor(actor, () => {
    const byCategory: RetentionCategoryResult[] = []

    for (const category of RUN_ORDER) {
      const rule = getRetentionRule(category)
      const handler = RETENTION_HANDLERS[category]
      if (!rule.enabled) {
        byCategory.push({ category, scanned: 0, deleted: 0 })
        continue
      }
      const targets = handler.list()
      let deleted = 0
      for (const target of targets) {
        if (!nowDue(target.expiresAt)) continue
        const done = mode === 'anonymise' && handler.anonymise ? handler.anonymise(target.id) : handler.remove(target.id)
        if (done) deleted += 1
      }
      byCategory.push({ category, scanned: targets.length, deleted })
    }

    const totalDeleted = byCategory.reduce((sum, row) => sum + row.deleted, 0)
    const changed = byCategory.filter((row) => row.deleted > 0)
    const result: RetentionJobResult = {
      ranAt,
      mode,
      durationMs: Date.now() - startedAt,
      byCategory,
      totalDeleted,
    }

    pushAppLog({
      level: 'info',
      source: 'retention',
      message: `Retention sweep (${mode}) removed ${totalDeleted} item(s) across ${changed.length} categor${changed.length === 1 ? 'y' : 'ies'}.`,
    })
    addAudit({
      sessionId: 'retention',
      actor: actor.name,
      role: actor.role,
      action: 'retention.job_run',
      detail: `Retention sweep (${mode}) removed ${totalDeleted} item(s) across ${changed.length} categor${changed.length === 1 ? 'y' : 'ies'}.`,
      category: 'system',
    })
    recordRetentionAction({
      action: 'job.run',
      detail: `Sweep (${mode}) scanned ${byCategory.length} categor${byCategory.length === 1 ? 'y' : 'ies'}, removed ${totalDeleted} item(s).`,
      actor,
    })
    for (const row of changed) {
      recordRetentionAction({
        action: 'data.deleted',
        category: row.category,
        detail: `${row.deleted} item(s) removed by the ${mode} sweep (${row.scanned} scanned).`,
        actor,
      })
    }

    return result
  })
}

/* ------------------------------------------------------------------ */
/*  Per-case operations                                                */
/* ------------------------------------------------------------------ */

/** Every target attached to one session (including the case row itself). */
export function getSessionRetentionTargets(sessionId: string): Array<{ category: RetentionCategory; targetId: string; expiresAt: string }> {
  const categories: RetentionCategory[] = ['patient-sessions', ...SESSION_FIELD_CATEGORIES]
  const targets: Array<{ category: RetentionCategory; targetId: string; expiresAt: string }> = []
  for (const category of categories) {
    for (const target of RETENTION_HANDLERS[category].list()) {
      if (target.sessionId === sessionId) targets.push({ category, targetId: target.id, expiresAt: target.expiresAt })
    }
  }
  return targets
}

/**
 * Pushes a case's retention out by `days` (admin-only). Applies to the case row
 * and every fragment attached to it, so nothing can be collected after the
 * case itself expires.
 */
export function extendSessionRetention(
  input: { sessionId: string; days: number },
  actor: RetentionActor,
): { extendedUntil: string; categories: RetentionCategory[] } {
  const session = getSessionIncludingDeleted(input.sessionId)
  if (!session) throw new HttpError(404, 'Session not found.')
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_RETENTION_DAYS) {
    throw new HttpError(400, `days must be an integer 1..${MAX_RETENTION_DAYS}.`)
  }

  const extendedUntil = new Date(Date.now() + input.days * DAY_MS).toISOString()
  const applied: RetentionCategory[] = []
  for (const target of getSessionRetentionTargets(session.id)) {
    if (!isRetentionCategory(target.category)) continue
    applyRetentionOverride(target.category, target.targetId, extendedUntil)
    if (!applied.includes(target.category)) applied.push(target.category)
  }

  addAudit({
    sessionId: session.id,
    actor: actor.name,
    role: actor.role,
    action: 'retention.extended',
    detail: `Retention extended by ${input.days} day(s) (until ${extendedUntil}) for ${applied.length} categor${applied.length === 1 ? 'y' : 'ies'}.`,
    category: 'system',
  })
  recordRetentionAction({
    action: 'session.extended',
    targetId: session.id,
    detail: `Retention extended ${input.days} day(s) — until ${extendedUntil} across ${applied.join(', ') || 'no categories'}.`,
    actor,
  })

  return { extendedUntil, categories: applied }
}

/* ------------------------------------------------------------------ */
/*  Export collection                                                  */
/* ------------------------------------------------------------------ */

/** Gathers everything attached to one session into export sections. */
export function collectSessionExportSections(sessionId: string): Array<{ category: RetentionCategory; items: unknown[] }> {
  const bucket = new Map<RetentionCategory, unknown[]>()
  const collector: ExportCollector = {
    add(category, item) {
      const items = bucket.get(category)
      if (items) items.push(item)
      else bucket.set(category, [item])
    },
  }

  for (const category of RUN_ORDER) {
    const handler = RETENTION_HANDLERS[category]
    for (const target of handler.list()) {
      if (target.sessionId !== sessionId) continue
      handler.collect(target.id, collector)
    }
  }

  return [...bucket.entries()].map(([category, items]) => ({ category, items }))
}


/** Loads persisted retention rules + action log on boot (persistent mode only). */
export async function hydrateRetention(): Promise<void> {
  const stored = await loadRetentionRules()
  applyStoredRuleState(stored)
  const rows = await loadRetentionActions()
  actions.length = 0
  actions.push(...rows.slice(-MAX_ACTIONS).reverse())
}
