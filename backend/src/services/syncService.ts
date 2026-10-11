import { createHash, randomUUID } from 'node:crypto'
import { HttpError } from '../middleware/errorHandler'
import type { AuthUser } from './authStore'
import { anonymize } from './anonymizer'
import { addAudit, countAuditEntries } from './auditStore'
import { grantConsent, revokeConsent } from './consentRetentionService'
import {
  addClinicianFollowUp,
  answerFollowUp,
  type ClinicianFollowUpInput,
} from './followUpService'
import { fromIntakeLanguage } from './languageDetectionService'
import { submitFeedback, validateFeedbackCreate } from './feedbackService'
import { runWithOfflineOrigin } from './offlineOrigin'
import {
  createSession,
  generatePatientId,
  getSession,
  listSessions,
  updateSession,
} from './sessionStore'
import { analyze } from './triageService'
import {
  addTimelineEvent,
  buildTimeline,
  editTimelineEvent,
  removeTimelineEvent,
  type NewTimelineEventInput,
  type TimelineEventEdit,
} from './timelineBuilder'
import { anonymiseErrorMessage } from './unifiedAnonymizer'
import type {
  AgeBand,
  BatchResult,
  ConflictField,
  ConflictInfo,
  FollowUpCategory,
  FollowUpTarget,
  IntakeLanguage,
  IntakePoint,
  NoteOverride,
  PendingUpload,
  PatientSession,
  ReferralNote,
  SexMarker,
  StructuredNote,
  SupportedLanguage,
  SyncResult,
  TimelineEventType,
  TimePrecision,
  UserRole,
} from '../types'
import { QUEUE_ACTION_TYPES, type QueueActionType, type QueuedItem } from '../types'

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

/** Thrown by a handler when the server copy moved on since the client read it. */
class SyncConflict extends Error {
  constructor(public readonly info: ConflictInfo) {
    super('Conflict detected.')
  }
}

function validationError(message: string, fields: string[]): HttpError {
  return new HttpError(400, message, { fields })
}

function forbidden(message = 'This action requires a higher role.'): HttpError {
  return new HttpError(403, message)
}

function notFound(message = 'Session not found.'): HttpError {
  return new HttpError(404, message)
}

/* ------------------------------------------------------------------ */
/*  Reader helpers                                                     */
/* ------------------------------------------------------------------ */

const FOLLOW_UP_CATEGORIES: FollowUpCategory[] = [
  'timeline',
  'severity',
  'vitals',
  'hydration',
  'medication',
  'allergies',
  'history',
  'responsiveness',
  'pain',
  'bleeding',
  'consciousness',
  'symptom-detail',
  'report',
  'lab-review',
  'visual',
  'safety-recheck',
  'clinician',
  'other',
]
const FOLLOW_UP_TARGETS: FollowUpTarget[] = ['patient', 'staff']
const LANG_CODES_ARR: SupportedLanguage[] = ['en', 'hi', 'or']

function langCode(value: unknown, fallback: SupportedLanguage): SupportedLanguage {
  return typeof value === 'string' && LANG_CODES_ARR.includes(value as SupportedLanguage)
    ? (value as SupportedLanguage)
    : fallback
}

/* ------------------------------------------------------------------ */
/*  Access + RBAC                                                      */
/* ------------------------------------------------------------------ */

function allowed(role: UserRole, roles: UserRole[]): boolean {
  return role === 'admin' || roles.includes(role)
}

function requireRole(actor: AuthUser, roles: UserRole[]): void {
  if (!allowed(actor.role, roles)) throw forbidden()
}

function sessionActor(actor: AuthUser): { name: string; role: UserRole } {
  return { name: actor.displayName, role: actor.role }
}

function loadSession(sessionId: string, actor: AuthUser): PatientSession {
  const session = getSession(sessionId)
  if (!session) throw notFound()
  if (actor.role === 'patient' && session.ownerId !== actor.id) throw notFound()
  return session
}

function requireSessionId(item: QueuedItem): string {
  if (!item.sessionId) throw validationError('sessionId is required.', ['sessionId'])
  return item.sessionId
}

/* ------------------------------------------------------------------ */
/*  Conflict helpers                                                   */
/* ------------------------------------------------------------------ */

function conflict(entity: string, serverVersion: string, clientVersion: string, fields: ConflictField[]): SyncConflict {
  return new SyncConflict({ conflict: true, entity, serverVersion, clientVersion, fields })
}

/**
 * If the client recorded the server version it started from and the server has
 * since moved on, signal a conflict. Absent base version = best-effort merge,
 * which the human-in-the-loop flow resolves because nothing is auto-accepted.
 */
function assertVersion(baseUpdatedAt: unknown, current: string, entity: string, fields: () => ConflictField[]): void {
  if (typeof baseUpdatedAt !== 'string' || !baseUpdatedAt) return
  if (baseUpdatedAt === current) return
  throw conflict(entity, current, baseUpdatedAt, fields())
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

function handleIntake(item: QueuedItem, actor: AuthUser): unknown {
  const p = item.payload
  const text = typeof p.text === 'string' ? p.text.trim() : ''
  if (!text) throw validationError('A narrative (text) is required.', ['text'])
  if (p.consentAcknowledged !== true) {
    throw validationError('Consent and the non-diagnostic acknowledgement are required.', ['consentAcknowledged'])
  }
  const language: IntakeLanguage = (['English', 'Hindi', 'Odia'] as IntakeLanguage[]).includes(p.language as IntakeLanguage)
    ? (p.language as IntakeLanguage)
    : 'English'
  const ageBand: AgeBand = (['0-17', '18-39', '40-59', '60+', 'Unknown'] as AgeBand[]).includes(p.ageBand as AgeBand)
    ? (p.ageBand as AgeBand)
    : 'Unknown'
  const sex: SexMarker = (['Female', 'Male', 'Other', 'Not stated'] as SexMarker[]).includes(p.sex as SexMarker)
    ? (p.sex as SexMarker)
    : 'Not stated'
  const intakePoint: IntakePoint = (['OPD', 'Health camp', 'Follow-up', 'Emergency triage'] as IntakePoint[]).includes(
    p.intakePoint as IntakePoint,
  )
    ? (p.intakePoint as IntakePoint)
    : 'OPD'

  const { text: displayText, report } = anonymize(text)
  const note = analyze({ text: displayText, language })
  const session = createSession({
    patientId: typeof p.patientId === 'string' && p.patientId ? p.patientId : generatePatientId(),
    displayText,
    anonymization: report,
    note,
    language,
    ageBand,
    sex,
    intakePoint,
    ownerId: actor.id,
    createdBy: actor.displayName,
    createdByRole: actor.role,
  })
  grantConsent(session.id, actor)
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: 'session.created',
    detail: `Session created offline · ${report.redactedCount} PII marker(s) stripped · risk ${note.riskScore}.`,
    category: 'system',
  })
  try {
    buildTimeline(session.id, sessionActor(actor))
  } catch {
    /* rebuilt on demand */
  }
  return { session: getSession(session.id) ?? session }
}

function handleAttachMetadata(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  const kind = item.actionType === 'report.attach-metadata' ? 'report' : 'visual'
  const p = item.payload
  const fileName = typeof p.fileName === 'string' ? p.fileName.trim().slice(0, 200) : ''
  if (!fileName) throw validationError('fileName is required.', ['fileName'])
  const upload: PendingUpload = {
    id: `pu-${randomUUID()}`,
    kind,
    fileName,
    mimeType: typeof p.mimeType === 'string' ? p.mimeType.slice(0, 120) : 'application/octet-stream',
    note: typeof p.note === 'string' ? p.note.trim().slice(0, 1000) : '',
    createdAt: new Date().toISOString(),
    createdBy: actor.displayName,
  }
  const updated = updateSession(session.id, {
    pendingUploads: [...(session.pendingUploads ?? []), upload],
  })
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: kind === 'report' ? 'report.metadata-attached' : 'visual.metadata-attached',
    detail: `Offline ${kind} metadata recorded (bytes still pending upload).`,
    category: 'edit',
  })
  return { session: updated }
}

function handleFollowUpAdd(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  if (!session.note) throw new HttpError(409, 'This session has no note.')
  const p = item.payload
  const text = typeof p.text === 'string' ? p.text.trim() : ''
  if (!text || text.length > 500) throw validationError('text is required (max 500).', ['text'])
  const fallback = session.note?.language ?? fromIntakeLanguage(session.language)
  const input: ClinicianFollowUpInput = {
    text,
    language: langCode(p.language, fallback),
    category: FOLLOW_UP_CATEGORIES.includes(p.category as FollowUpCategory) ? (p.category as FollowUpCategory) : 'other',
    target: FOLLOW_UP_TARGETS.includes(p.target as FollowUpTarget) ? (p.target as FollowUpTarget) : 'patient',
  }
  return addClinicianFollowUp(session.id, input, sessionActor(actor))
}

function handleFollowUpAnswer(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  if (!session.note) throw new HttpError(409, 'This session has no note.')
  const p = item.payload
  const questionId = typeof p.questionId === 'string' ? p.questionId : ''
  if (!questionId) throw validationError('questionId is required.', ['questionId'])
  const answerText = typeof p.answerText === 'string' ? p.answerText.trim() : ''
  if (!answerText) throw validationError('answerText is required.', ['answerText'])
  if (answerText.length > 2000) throw validationError('answerText must be at most 2000 characters.', ['answerText'])
  const target = session.note.followUpQuestions.find((q) => q.id === questionId)
  if (!target) throw notFound('Follow-up question not found.')
  assertVersion(p.baseUpdatedAt, target.updatedAt, 'followup', () => [
    { name: 'answer', serverValue: target.answer ?? null, clientValue: answerText },
  ])
  const answerLanguage = langCode(p.answerLanguage, session.note?.language ?? fromIntakeLanguage(session.language))
  return answerFollowUp(session.id, questionId, answerText, answerLanguage, sessionActor(actor))
}

function handleNoteEdit(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  if (!session.note) throw new HttpError(409, 'This session has no note.')
  const note = session.note
  const p = item.payload
  const next = (p.structuredNote ?? {}) as Record<string, unknown>
  const fields = ['chiefComplaint', 'history', 'vitals'] as const
  assertVersion(p.baseUpdatedAt, session.updatedAt, 'session.note', () =>
    fields.map<ConflictField>((field) => ({
      name: field,
      serverValue: note.structuredNote[field],
      clientValue: typeof next[field] === 'string' ? next[field] : null,
    })),
  )
  const changes = fields.filter((f) => typeof next[f] === 'string' && next[f] !== note.structuredNote[f])
  if (changes.length === 0) return { session, changed: [] }
  const overrides: NoteOverride[] = changes.map((field) => ({
    id: `ovr-${randomUUID()}`,
    field,
    previousValue: note.structuredNote[field],
    newValue: String(next[field]),
    reviewer: actor.displayName,
    role: actor.role,
    at: new Date().toISOString(),
  }))
  const structuredNote: StructuredNote = { ...note.structuredNote }
  for (const field of changes) structuredNote[field] = String(next[field])
  const updated = updateSession(session.id, {
    overrides: [...session.overrides, ...overrides],
    note: { ...note, structuredNote, status: 'human-edited' },
  })
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: 'note.overridden',
    detail: `Human override on: ${changes.join(', ')} (AI draft preserved in the change log).`,
    category: 'edit',
  })
  return { session: updated, changed: changes }
}

function handleNoteStatus(item: QueuedItem, actor: AuthUser, status: 'accepted' | 'finalized' | 'rejected'): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, status === 'finalized' ? ['doctor'] : ['nurse', 'doctor'])
  if (!session.note) throw new HttpError(409, 'This session has no note.')
  const note = session.note
  const p = item.payload
  assertVersion(p.baseUpdatedAt, session.updatedAt, 'session.note', () => [
    { name: 'status', serverValue: note.status, clientValue: status },
  ])
  const updated = updateSession(session.id, {
    note: { ...note, status },
  })
  const actionMap: Record<'accepted' | 'finalized' | 'rejected', string> = {
    accepted: 'note.accepted',
    finalized: 'note.finalized',
    rejected: 'note.rejected',
  }
  const detailMap: Record<'accepted' | 'finalized' | 'rejected', string> = {
    accepted: 'AI draft accepted as reviewed by a healthcare worker.',
    finalized: 'Note finalized for this facility by a medical officer. No diagnosis or prescription issued.',
    rejected: 'Note rejected by reviewer.',
  }
  const categoryMap: Record<'accepted' | 'finalized' | 'rejected', 'decision'> = {
    accepted: 'decision',
    finalized: 'decision',
    rejected: 'decision',
  }
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: actionMap[status],
    detail: detailMap[status],
    category: categoryMap[status],
  })
  return { session: updated }
}

function handleTimelineAdd(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  const p = item.payload
  const eventText = typeof p.eventText === 'string' ? p.eventText.trim() : ''
  if (!eventText || eventText.length > 1000) throw validationError('eventText must be 1-1000 characters.', ['eventText'])
  const session = loadSession(sessionId, actor)
  const fallback = session.note?.language ?? fromIntakeLanguage(session.language)
  const input: NewTimelineEventInput = {
    eventText,
    eventTextLanguage: langCode(p.eventTextLanguage, fallback),
    eventType: (p.eventType as TimelineEventType) ?? 'clinician-note',
    timeExpression: typeof p.timeExpression === 'string' ? p.timeExpression.slice(0, 200) : '',
    normalizedTime: (p.normalizedTime as NewTimelineEventInput['normalizedTime']) ?? null,
    timePrecision: (p.timePrecision as TimePrecision) ?? 'unknown',
    sourceRef: typeof p.sourceRef === 'string' ? p.sourceRef.slice(0, 120) : undefined,
  }
  const timeline = addTimelineEvent(sessionId, sessionActor(actor), input)
  if (!timeline) throw notFound('Timeline not built yet. Build it first.')
  return { timeline }
}

function handleTimelineEdit(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  const p = item.payload
  const eventId = typeof p.eventId === 'string' ? p.eventId : ''
  if (!eventId) throw validationError('eventId is required.', ['eventId'])
  const event = session.timeline?.events.find((e) => e.eventId === eventId)
  if (!event) throw notFound('Timeline event not found.')
  const patch = (p.patch ?? {}) as TimelineEventEdit
  assertVersion(p.baseUpdatedAt, session.updatedAt, 'timeline.event', () =>
    Object.entries(patch).map<ConflictField>(([name, clientValue]) => ({
      name,
      serverValue: (event as unknown as Record<string, unknown>)[name] ?? null,
      clientValue,
    })),
  )
  const timeline = editTimelineEvent(sessionId, sessionActor(actor), eventId, patch)
  if (!timeline) throw notFound('Timeline event not found.')
  return { timeline }
}

function handleTimelineDelete(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  const p = item.payload
  const eventId = typeof p.eventId === 'string' ? p.eventId : ''
  if (!eventId) throw validationError('eventId is required.', ['eventId'])
  const event = session.timeline?.events.find((e) => e.eventId === eventId)
  if (!event) throw notFound('Timeline event not found.')
  assertVersion(p.baseUpdatedAt, session.updatedAt, 'timeline.event', () => [
    { name: 'event', serverValue: event.eventText, clientValue: null },
  ])
  const timeline = removeTimelineEvent(sessionId, sessionActor(actor), eventId)
  if (!timeline) throw notFound('Timeline event not found.')
  return { timeline }
}

function handleReferralDraft(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['nurse', 'doctor'])
  if (!session.note) throw new HttpError(409, 'This session has no note.')
  const note = session.note
  const p = item.payload
  const toFacility =
    typeof p.toFacility === 'string' && p.toFacility.trim() ? p.toFacility.trim() : 'Community Health Centre'
  const reason = typeof p.reason === 'string' ? p.reason.trim().slice(0, 500) : ''
  const referral: ReferralNote = {
    id: `ref-${randomUUID()}`,
    sessionId: session.id,
    patientId: session.patientId,
    fromFacility: session.facility,
    toFacility,
    reasonForReferral:
      reason || 'Reviewer requested higher-level assessment — reason to be confirmed by the receiving clinician.',
    urgency: note.riskScore,
    summary: [
      note.structuredNote.chiefComplaint,
      note.structuredNote.history,
      `Reported vitals: ${note.structuredNote.vitals}`,
      `Observations: ${note.observations.join(' | ')}`,
    ].join('\n'),
    missingInformation: note.missingInformation.map((m) => m.field),
    openQuestions: note.followUpQuestions.map((q) => q.question),
    preparedBy: actor.displayName,
    preparedByRole: actor.role,
    approvedBy: null,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    disclaimer:
      'This note is prepared by an AI assistant for review by a qualified healthcare worker. It does not diagnose, does not prescribe and does not replace professional medical judgement.',
  }
  const updated = updateSession(session.id, {
    status: 'escalated',
    referral,
    note: { ...note, status: 'escalated' },
  })
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: 'session.escalated',
    detail: `Escalated to a human reviewer at ${toFacility}.`,
    category: 'decision',
  })
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: 'referral.generated',
    detail: 'Referral note drafted offline (awaiting human review).',
    category: 'export',
  })
  return { session: updated }
}

function handleReferralApprove(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  requireRole(actor, ['doctor'])
  if (!session.referral) throw new HttpError(409, 'No referral has been drafted for this session.')
  const p = item.payload
  assertVersion(p.baseUpdatedAt, session.updatedAt, 'referral', () => [
    { name: 'status', serverValue: session.referral?.status ?? null, clientValue: 'approved' },
  ])
  const updated = updateSession(session.id, {
    referral: { ...session.referral, status: 'approved', approvedBy: actor.displayName },
  })
  addAudit({
    sessionId: session.id,
    actor: actor.displayName,
    role: actor.role,
    action: 'referral.approved',
    detail: 'Referral approved for hand-off to a higher-level facility.',
    category: 'decision',
  })
  return { session: updated }
}

function handleConsentRevoke(item: QueuedItem, actor: AuthUser): unknown {
  const sessionId = requireSessionId(item)
  const session = loadSession(sessionId, actor)
  const reason = typeof item.payload.reason === 'string' ? item.payload.reason.trim().slice(0, 500) : ''
  const result = revokeConsent(session.id, actor, reason)
  return result
}

function handleAuditLog(item: QueuedItem, actor: AuthUser): unknown {
  const p = item.payload
  const action = typeof p.action === 'string' ? p.action.trim().slice(0, 120) : ''
  const detail = typeof p.detail === 'string' ? p.detail.trim() : ''
  if (!action || !detail) throw validationError('action and detail are required.', ['action', 'detail'])
  const sessionId = typeof p.sessionId === 'string' && p.sessionId ? p.sessionId : 'offline'
  const entry = addAudit({
    sessionId,
    actor: actor.displayName,
    role: actor.role,
    action,
    detail,
    category: 'system',
  })
  return { entry }
}

function handleFeedbackCreate(item: QueuedItem, actor: AuthUser): unknown {
  requireRole(actor, ['nurse', 'doctor', 'facility-admin'])
  const payload = item.payload
  const validation = validateFeedbackCreate(payload)
  if (!validation.ok) throw validationError('Invalid feedback.', validation.errors)
  const sessionId = typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : null
  let facilityId = actor.activeFacilityId ?? actor.facilityId
  if (sessionId) {
    const session = getSession(sessionId)
    if (!session || session.facilityId !== facilityId) throw notFound('Session not found.')
    facilityId = session.facilityId
  }
  const feedback = submitFeedback({
    facilityId,
    sessionId,
    targetType: String(payload.targetType),
    targetId: String(payload.targetId),
    targetLabel: typeof payload.targetLabel === 'string' ? payload.targetLabel : null,
    layerId: typeof payload.layerId === 'string' ? payload.layerId : null,
    verdict: String(payload.verdict),
    reasonCode: String(payload.reasonCode),
    reasonText: typeof payload.reasonText === 'string' ? payload.reasonText : null,
    severity: typeof payload.severity === 'string' ? payload.severity : undefined,
    suggestedFix: typeof payload.suggestedFix === 'string' ? payload.suggestedFix : null,
    actor: { id: actor.id, role: actor.role },
  })
  return { feedback }
}

function dispatch(item: QueuedItem, actor: AuthUser): unknown {
  switch (item.actionType) {
    case 'intake.create-text':
    case 'intake.create-voice':
      return handleIntake(item, actor)
    case 'report.attach-metadata':
    case 'visual.attach-metadata':
      return handleAttachMetadata(item, actor)
    case 'followup.add':
      return handleFollowUpAdd(item, actor)
    case 'followup.answer':
      return handleFollowUpAnswer(item, actor)
    case 'note.edit':
      return handleNoteEdit(item, actor)
    case 'note.accept':
      return handleNoteStatus(item, actor, 'accepted')
    case 'note.reject':
      return handleNoteStatus(item, actor, 'rejected')
    case 'note.finalize':
      return handleNoteStatus(item, actor, 'finalized')
    case 'timeline.add':
      return handleTimelineAdd(item, actor)
    case 'timeline.edit':
      return handleTimelineEdit(item, actor)
    case 'timeline.delete':
      return handleTimelineDelete(item, actor)
    case 'referral.draft':
      return handleReferralDraft(item, actor)
    case 'referral.approve':
      return handleReferralApprove(item, actor)
    case 'consent.revoke':
      return handleConsentRevoke(item, actor)
    case 'audit.log':
      return handleAuditLog(item, actor)
    case 'feedback.create':
      return handleFeedbackCreate(item, actor)
    default:
      throw new HttpError(400, 'unknown-action')
  }
}

/* ------------------------------------------------------------------ */
/*  Result mapping                                                     */
/* ------------------------------------------------------------------ */

function fieldsOf(err: HttpError): string[] {
  const fields = err.extra?.fields
  return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === 'string') : []
}

function processItem(item: QueuedItem, actor: AuthUser): SyncResult {
  if (!QUEUE_ACTION_TYPES.includes(item.actionType as QueueActionType)) {
    return { id: item.id, status: 'failed', error: 'unknown-action' }
  }
  const queuedAt = typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString()
  const syncedAt = new Date().toISOString()
  try {
    const response = runWithOfflineOrigin({ offlineOrigin: true, queuedAt, syncedAt }, () => dispatch(item, actor))
    // An item that resolved a conflict carries the fields it reconciled.
    if (typeof item.payload.resolvedFrom === 'string') {
      addAudit({
        sessionId: item.sessionId ?? 'offline',
        actor: actor.displayName,
        role: actor.role,
        action: 'offline.conflict-resolved',
        detail: `Conflict resolved for ${item.actionType} and synced.`,
        category: 'decision',
      })
    }
    addAudit({
      sessionId: item.sessionId ?? 'offline',
      actor: actor.displayName,
      role: actor.role,
      action: 'offline.synced',
      detail: `Queued ${item.actionType} synced (idempotency key ${item.idempotencyKey}).`,
      category: 'system',
      offlineOrigin: true,
      queuedAt,
      syncedAt,
    })
    return { id: item.id, status: 'synced', response }
  } catch (err) {
    if (err instanceof SyncConflict) return { id: item.id, status: 'conflict', conflict: err.info }
    if (err instanceof HttpError) {
      if (err.status === 403) return { id: item.id, status: 'failed', error: 'forbidden' }
      if (err.status === 404) return { id: item.id, status: 'failed', error: 'not-found' }
      if (err.status === 400) {
        return { id: item.id, status: 'failed', error: 'validation-failed', fields: fieldsOf(err) }
      }
      if (err.status === 409) return { id: item.id, status: 'failed', error: 'conflict-state' }
      return { id: item.id, status: 'failed', error: anonymiseErrorMessage(err.message) }
    }
    return { id: item.id, status: 'failed', error: 'internal-error' }
  }
}

/* ------------------------------------------------------------------ */
/*  Batch orchestration                                                */
/* ------------------------------------------------------------------ */

/** Topological order so an item's dependencies are processed first. */
function orderByDependencies(items: QueuedItem[]): QueuedItem[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const ordered: QueuedItem[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()
  const visit = (item: QueuedItem): void => {
    if (done.has(item.id)) return
    if (visiting.has(item.id)) return
    visiting.add(item.id)
    for (const dep of item.dependencies) {
      const dependency = byId.get(dep)
      if (dependency) visit(dependency)
    }
    visiting.delete(item.id)
    done.add(item.id)
    ordered.push(item)
  }
  for (const item of items) visit(item)
  return ordered
}

export function processBatch(items: QueuedItem[], actor: AuthUser): BatchResult {
  const started = Date.now()
  const ordered = orderByDependencies(items)
  const byId = new Map(items.map((item) => [item.id, item]))
  const results = new Map<string, SyncResult>()

  for (const item of ordered) {
    const failedDep = item.dependencies
      .map((dep) => byId.get(dep))
      .find((dep) => dep !== undefined && results.get(dep.id)?.status !== 'synced')
    if (failedDep) {
      results.set(item.id, { id: item.id, status: 'failed', error: 'dependency-failed' })
      continue
    }
    results.set(item.id, processItem(item, actor))
  }

  const orderedResults: SyncResult[] = items.map(
    (item) => results.get(item.id) ?? { id: item.id, status: 'failed', error: 'internal-error' },
  )

  const syncedCount = orderedResults.filter((r) => r.status === 'synced').length
  const conflictCount = orderedResults.filter((r) => r.status === 'conflict').length
  const failedCount = orderedResults.filter((r) => r.status === 'failed').length

  addAudit({
    sessionId: 'sync',
    actor: actor.displayName,
    role: actor.role,
    action: 'sync.batch-processed',
    detail: `Offline batch processed in ${Date.now() - started}ms: ${orderedResults.length} item(s) — ${syncedCount} synced, ${conflictCount} conflict(s), ${failedCount} failed.`,
    category: 'system',
  })

  return { results: orderedResults, serverVersion: getServerVersion().serverVersion }
}

/** Monotonic-ish fingerprint of the latest server state, so clients can skip fetches. */
export function getServerVersion(): { serverVersion: string; lastChangeAt: string } {
  const sessions = listSessions()
  let lastChangeAt = '1970-01-01T00:00:00.000Z'
  const parts: string[] = []
  for (const session of sessions) {
    parts.push(`${session.id}:${session.updatedAt}`)
    if (session.updatedAt > lastChangeAt) lastChangeAt = session.updatedAt
  }
  parts.push(`audit:${countAuditEntries()}`)
  const serverVersion = createHash('sha256').update(parts.sort().join('|')).digest('hex')
  return { serverVersion, lastChangeAt }
}
