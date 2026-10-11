import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { authUser, requireRole } from '../middleware/auth'
import { facilityContext, facilityIdOf } from '../middleware/facilityScope'
import { HttpError } from '../middleware/errorHandler'
import { addAudit } from '../services/auditStore'
import { anonymize } from '../services/anonymizer'
import { getUser, listUsersForFacility, type AuthUser } from '../services/authStore'
import { getConsentForSession, grantConsent, revokeConsent } from '../services/consentRetentionService'
import { fromIntakeLanguage } from '../services/languageDetectionService'
import { buildSessionExport } from '../services/retentionExportService'
import { eraseSessionData, extendSessionRetention } from '../services/retentionService'
import {
  createSession,
  generatePatientId,
  getSession,
  listSessionsForFacility,
  updateSession,
} from '../services/sessionStore'
import { analyze } from '../services/triageService'
import {
  ESCALATION_REASON_CODES,
  NOTE_REJECTION_REASON_CODES,
  RETURN_REASON_CODES,
  acceptNote,
  escalateNote,
  finalizeNote,
  markReviewed,
  rejectNote,
  resolveEscalation,
  returnToIntake,
} from '../services/noteReviewService'
import {
  applyReferralStatus,
  buildReferralNote,
  checklistSatisfied,
  overrideChecklist,
  setChecklistEntry,
  toStructuredReferralNote,
} from '../services/referralService'
import { REFERRAL_LEVELS, REFERRAL_STATUSES, type ReferralLevel, type ReferralStatus } from '../types'
import {
  acceptTimeline,
  addTimelineEvent,
  assertTimelineTextSafe,
  buildTimeline,
  editTimelineEvent,
  getTimelineForSession,
  regenerateTimeline,
  removeTimelineEvent,
  type NewTimelineEventInput,
  type TimelineEventEdit,
} from '../services/timelineBuilder'
import {
  addClinicianFollowUp,
  answerFollowUp,
  askFollowUp,
  deleteFollowUp,
  editFollowUp,
  ensureSessionFollowUps,
  getSessionQuestions,
  regenerateSessionFollowUps,
  reorderFollowUps,
  skipFollowUp,
  type ClinicianFollowUpInput,
  type FollowUpEditPatch,
} from '../services/followUpService'
import type {
  AgeBand,
  EscalationReasonCode,
  FollowUpCategory,
  FollowUpQuestion,
  FollowUpTarget,
  IntakeLanguage,
  IntakePoint,
  NormalizedTime,
  NoteOverride,
  NoteRejectionReasonCode,
  PatientSession,
  ReturnReasonCode,
  SexMarker,
  StructuredNote,
  SupportedLanguage,
  TimePrecision,
  TimelineEventType,
} from '../types'

export const sessionsRouter = Router()

const LANGUAGES: IntakeLanguage[] = ['English', 'Hindi', 'Odia']
const AGE_BANDS: AgeBand[] = ['0-17', '18-39', '40-59', '60+', 'Unknown']
const SEX_MARKERS: SexMarker[] = ['Female', 'Male', 'Other', 'Not stated']
const INTAKE_POINTS: IntakePoint[] = ['OPD', 'Health camp', 'Follow-up', 'Emergency triage']

const LANG_CODES: SupportedLanguage[] = ['en', 'hi', 'or']
const EVENT_TYPES: TimelineEventType[] = [
  'symptom-onset',
  'symptom-change',
  'past-medical-event',
  'current-state',
  'report',
  'visual',
  'follow-up-answer',
  'clinician-note',
  'other',
]
const TIME_PRECISIONS: TimePrecision[] = ['exact', 'approximate', 'relative', 'unknown']

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

/**
 * Loads a session for the caller. Patients only ever see their own sessions —
 * a stranger's session id answers 404 so ids cannot be probed.
 */
function requireSession(req: Request, id: string): { session: PatientSession; user: AuthUser } {
  const user = authUser(req)
  const session = getSession(id)
  if (!session) throw new HttpError(404, 'Session not found.')
  // Cross-facility reads resolve to 404 (never 403) so tenants cannot probe.
  if (session.facilityId !== facilityIdOf(req)) throw new HttpError(404, 'Session not found.')
  if (user.role === 'patient' && session.ownerId !== user.id) throw new HttpError(404, 'Session not found.')
  return { session, user }
}

function requireNote(session: PatientSession): void {
  if (!session.note) throw new HttpError(409, 'This session has no note.')
}

function actorOf(user: AuthUser): { name: string; role: AuthUser['role'] } {
  return { name: user.displayName, role: user.role }
}

/** Validates a normalizedTime from a request body (null clears the time). */
function parseNormalizedTime(value: unknown): NormalizedTime | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') throw new HttpError(400, 'normalizedTime must be an object or null.')
  const raw = value as Record<string, unknown>
  if (raw.kind === 'absolute') {
    if (typeof raw.iso !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw.iso)) {
      throw new HttpError(400, 'absolute normalizedTime needs an ISO date (YYYY-MM-DD).')
    }
    return { kind: 'absolute', iso: raw.iso }
  }
  if (raw.kind === 'relative') {
    if (typeof raw.daysFromIntake !== 'number' || !Number.isFinite(raw.daysFromIntake)) {
      throw new HttpError(400, 'relative normalizedTime needs a numeric daysFromIntake.')
    }
    const hours = raw.hoursFromIntake === undefined ? undefined : Number(raw.hoursFromIntake)
    return {
      kind: 'relative',
      daysFromIntake: raw.daysFromIntake,
      ...(typeof hours === 'number' && Number.isFinite(hours) ? { hoursFromIntake: hours } : {}),
    }
  }
  throw new HttpError(400, 'normalizedTime.kind must be "absolute" or "relative".')
}

function readFollowUpText(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, 'text is required.')
  const text = value.trim()
  if (!text) throw new HttpError(400, 'text is required.')
  if (text.length > max) throw new HttpError(400, `text must be at most ${max} characters.`)
  return text
}

function readLanguageCode(value: unknown): SupportedLanguage {
  if (!LANG_CODES.includes(value as SupportedLanguage)) throw new HttpError(400, 'language must be en, hi or or.')
  return value as SupportedLanguage
}

function readFollowUpCategory(value: unknown): FollowUpCategory {
  if (!FOLLOW_UP_CATEGORIES.includes(value as FollowUpCategory)) {
    throw new HttpError(400, `category must be one of: ${FOLLOW_UP_CATEGORIES.join(', ')}.`)
  }
  return value as FollowUpCategory
}

function readFollowUpTarget(value: unknown): FollowUpTarget {
  if (!FOLLOW_UP_TARGETS.includes(value as FollowUpTarget)) {
    throw new HttpError(400, 'target must be patient or staff.')
  }
  return value as FollowUpTarget
}

function readReferralLevel(value: unknown): ReferralLevel | undefined {
  if (value === undefined) return undefined
  if (!REFERRAL_LEVELS.includes(value as ReferralLevel)) {
    throw new HttpError(400, `referralLevel must be one of: ${REFERRAL_LEVELS.join(', ')}.`)
  }
  return value as ReferralLevel
}

function readReferralStatus(value: unknown): ReferralStatus {
  if (!REFERRAL_STATUSES.includes(value as ReferralStatus)) {
    throw new HttpError(400, `status must be one of: ${REFERRAL_STATUSES.join(', ')}.`)
  }
  return value as ReferralStatus
}

function readReasonCode<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    throw new HttpError(400, `reasonCode must be one of: ${allowed.join(', ')}.`)
  }
  return value as T
}

function readReasonText(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'reasonText is required.')
  return value
}

/** Picks the senior clinician to escalate to (explicit id, else a facility doctor). */
function resolveSeniorTarget(req: Request, requestedId: unknown): { id: string; name: string } {
  if (typeof requestedId === 'string' && requestedId.trim()) {
    const user = getUser(requestedId.trim())
    if (!user || user.role !== 'doctor') throw new HttpError(400, 'The selected senior clinician was not found.')
    return { id: user.id, name: user.displayName }
  }
  const doctor = listUsersForFacility(facilityIdOf(req)).find((candidate) => candidate.role === 'doctor')
  if (!doctor) throw new HttpError(409, 'No senior clinician is available to escalate to.')
  return { id: doctor.id, name: doctor.displayName }
}

sessionsRouter.get('/', (req, res) => {
  const user = authUser(req)
  const sessions = listSessionsForFacility(facilityIdOf(req))
  res.json({ sessions: user.role === 'patient' ? sessions.filter((s) => s.ownerId === user.id) : sessions })
})

sessionsRouter.get('/:id', (req, res) => {
  const { session } = requireSession(req, req.params.id)
  res.json({ session })
})

sessionsRouter.post('/', (req, res) => {
  const user = authUser(req)
  const body = req.body ?? {}
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) throw new HttpError(400, 'A narrative (text) is required.')
  if (body.consentAcknowledged !== true) {
    throw new HttpError(400, 'Consent and the non-diagnostic acknowledgement are required.')
  }

  const language: IntakeLanguage = LANGUAGES.includes(body.language) ? body.language : 'English'
  const ageBand: AgeBand = AGE_BANDS.includes(body.ageBand) ? body.ageBand : 'Unknown'
  const sex: SexMarker = SEX_MARKERS.includes(body.sex) ? body.sex : 'Not stated'
  const intakePoint: IntakePoint = INTAKE_POINTS.includes(body.intakePoint) ? body.intakePoint : 'OPD'

  // 1. Strip PII before anything touches the analysis layer.
  const { text: displayText, report } = anonymize(text)

  // 2. Observational draft only — never a diagnosis or prescription.
  const note = analyze({ text: displayText, language })

  const facility = facilityContext(req)
  const session = createSession({
    patientId: typeof body.patientId === 'string' && body.patientId ? body.patientId : generatePatientId(),
    displayText,
    anonymization: report,
    note,
    language,
    ageBand,
    sex,
    intakePoint,
    ownerId: user.id,
    createdBy: user.displayName,
    createdByRole: user.role,
    facilityId: facility.facilityId,
    facility: facility.facilityName,
  })

  // Consent proof is recorded at intake and the retention policy is linked to
  // it, so a later withdrawal knows exactly what it is withdrawing (P0-6).
  grantConsent(session.id, user)

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'session.created',
    detail: `Session created · ${report.redactedCount} PII marker(s) stripped · risk ${note.riskScore}.`,
    category: 'system',
  })

  // P0-4: build the timeline draft right away so the clinical views have it.
  // Never fatal — intake must not fail because the timeline could not build.
  try {
    buildTimeline(session.id, actorOf(user))
  } catch {
    // Timeline is rebuilt on demand via POST /:id/timeline/build.
  }

  // P0-5: generate the context-aware follow-up questions right away.
  // Never fatal — regenerated on demand via POST /:id/followups/generate.
  try {
    ensureSessionFollowUps(session.id, actorOf(user))
  } catch {
    // The note's generated questions already survive as a fallback.
  }

  res.status(201).json({ session: getSession(session.id) ?? session })
})

/** Human-in-the-loop override of the AI draft (AI values kept in the change log). */
sessionsRouter.patch('/:id/note', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const note = session.note!

  const next = (req.body?.structuredNote ?? {}) as Record<string, unknown>
  const fields = ['chiefComplaint', 'history', 'vitals'] as const
  const changes = fields.filter((f) => typeof next[f] === 'string' && next[f] !== note.structuredNote[f])
  if (changes.length === 0) {
    res.json({ session, changed: [] })
    return
  }

  const overrides: NoteOverride[] = changes.map((field) => ({
    id: `ovr-${randomUUID()}`,
    field,
    previousValue: note.structuredNote[field],
    newValue: String(next[field]),
    reviewer: user.displayName,
    role: user.role,
    at: new Date().toISOString(),
  }))

  // Only fields that passed the validation above are written, so the stored
  // note can never drift from what the change log records.
  const structuredNote: StructuredNote = { ...note.structuredNote }
  for (const field of changes) structuredNote[field] = String(next[field])

  const updated = updateSession(session.id, {
    overrides: [...session.overrides, ...overrides],
    note: {
      ...note,
      structuredNote,
      status: 'human-edited',
    },
  })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.overridden',
    detail: `Human override on: ${changes.join(', ')} (AI draft preserved in the change log).`,
    category: 'edit',
  })

  res.json({ session: updated, changed: changes })
})

/** Accept / finalize the note as reviewed (finalize needs doctor or admin). */
sessionsRouter.post('/:id/status', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)

  const status = req.body?.status
  if (status !== 'accepted') throw new HttpError(400, "status must be 'accepted'.")

  const action = req.body?.action
  if (action !== undefined && action !== 'accepted' && action !== 'finalized') {
    throw new HttpError(400, "action must be 'accepted' or 'finalized'.")
  }
  const finalized = action === 'finalized'
  if (finalized && user.role !== 'doctor' && user.role !== 'admin') {
    // requireRole already allows nurse/doctor/admin through; nurses may not finalize.
    throw new HttpError(403, 'Only a doctor can finalize a note.')
  }

  const updated = updateSession(session.id, {
    status,
    note: { ...session.note!, status: finalized ? 'finalized' : 'accepted' },
  })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: finalized ? 'note.finalized' : 'note.accepted',
    detail: finalized
      ? 'Note finalized for this facility by a medical officer. No diagnosis or prescription issued.'
      : 'AI draft accepted as reviewed by a healthcare worker.',
    category: 'decision',
  })

  res.json({ session: updated })
})

/* ==================================================================== */
/*  Note review chain (P2-18 items H / P / Q / R)                        */
/* ==================================================================== */

/** Mark the draft as reviewed (the reviewer looked at it, no decision yet). */
sessionsRouter.post('/:id/review', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const note = markReviewed(session.note!, actorOf(user))
  const updated = updateSession(session.id, { note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.reviewed',
    detail: 'AI draft reviewed — no acceptance decision recorded yet.',
    category: 'view',
  })
  res.json({ session: updated })
})

/** Accept the reviewed draft (doctor). */
sessionsRouter.post('/:id/review/accept', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const note = acceptNote(session.note!, actorOf(user))
  const updated = updateSession(session.id, { status: 'accepted', note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.accepted',
    detail: 'Reviewed draft accepted by a medical officer. No diagnosis or prescription issued.',
    category: 'decision',
  })
  res.json({ session: updated })
})

/** Finalize an accepted note (doctor) — terminal for the note. */
sessionsRouter.post('/:id/review/finalize', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const note = finalizeNote(session.note!, actorOf(user))
  const updated = updateSession(session.id, { note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.finalized',
    detail: 'Note finalized for this facility. No diagnosis or prescription issued.',
    category: 'decision',
  })
  res.json({ session: updated })
})

/** Reject the note with a required reason (doctor). */
sessionsRouter.post('/:id/review/reject', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const reasonCode = readReasonCode<NoteRejectionReasonCode>(req.body?.reasonCode, NOTE_REJECTION_REASON_CODES)
  const note = rejectNote(session.note!, reasonCode, readReasonText(req.body?.reasonText), actorOf(user))
  const updated = updateSession(session.id, { note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.rejected',
    detail: `Note rejected (${reasonCode}).`,
    category: 'decision',
  })
  res.json({ session: updated })
})

/** Send the note back to intake with a required reason. */
sessionsRouter.post('/:id/review/return', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const reasonCode = readReasonCode<ReturnReasonCode>(req.body?.reasonCode, RETURN_REASON_CODES)
  const note = returnToIntake(session.note!, reasonCode, readReasonText(req.body?.reasonText), actorOf(user))
  const updated = updateSession(session.id, { status: 'ready', note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.returned-to-intake',
    detail: `Note returned to intake (${reasonCode}); more information is needed.`,
    category: 'decision',
  })
  res.json({ session: updated })
})

/** Escalate the note to a senior clinician (multi-level escalation). */
sessionsRouter.post('/:id/review/escalate', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const reasonCode = readReasonCode<EscalationReasonCode>(req.body?.reasonCode, ESCALATION_REASON_CODES)
  const target = resolveSeniorTarget(req, req.body?.escalatedTo)
  const note = escalateNote(
    session.note!,
    { escalatedTo: target.id, escalatedToName: target.name, reasonCode, reasonText: readReasonText(req.body?.reasonText) },
    actorOf(user),
  )
  const updated = updateSession(session.id, { status: 'escalated', note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'note.escalated-senior',
    detail: `Escalated to senior clinician (${reasonCode}).`,
    category: 'decision',
  })
  res.json({ session: updated })
})

/** A senior accepts or declines a pending escalation (doctor). */
sessionsRouter.post('/:id/review/escalation', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const decision = req.body?.decision
  if (decision !== 'accepted' && decision !== 'declined') {
    throw new HttpError(400, "decision must be 'accepted' or 'declined'.")
  }
  const note = resolveEscalation(session.note!, decision, actorOf(user))
  const updated = updateSession(session.id, { note })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: decision === 'accepted' ? 'note.escalation-accepted' : 'note.escalation-declined',
    detail: decision === 'accepted' ? 'Senior clinician accepted the escalated note.' : 'Senior clinician declined the escalation.',
    category: 'decision',
  })
  res.json({ session: updated })
})

/** Ask a follow-up question or record the patient's answer. */
sessionsRouter.patch('/:id/followup', (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const note = session.note!

  const questionId = req.body?.questionId
  const target = note.followUpQuestions.find((q) => q.id === questionId)
  if (!target) throw new HttpError(404, 'Follow-up question not found.')

  const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : ''
  // Patients may answer questions on their own session, but not pose new ones.
  if (!answer && user.role === 'patient') {
    throw new HttpError(403, 'Only clinical staff can ask follow-up questions.')
  }
  const nextStatus: FollowUpQuestion['status'] = answer ? 'answered' : 'asked'
  const updatedNote = {
    ...note,
    followUpQuestions: note.followUpQuestions.map((q) =>
      q.id === questionId ? { ...q, status: nextStatus, ...(answer ? { answer } : {}) } : q,
    ),
  }

  const updated = updateSession(session.id, { note: updatedNote })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: answer ? 'followup.answered' : 'followup.asked',
    detail: answer ? 'Answer recorded verbatim for the reviewing clinician.' : 'Follow-up question put to the patient.',
    category: 'edit',
  })

  res.json({ session: updated })
})

/* ==================================================================== */
/*  Dynamic follow-up questions (P0-5)                                  */
/* ==================================================================== */

/** Generate the context-aware AI suggestion set (preserves human-tracked ones). */
sessionsRouter.post('/:id/followups/generate', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const { questions } = ensureSessionFollowUps(session.id, actorOf(user))
  res.status(201).json(questions)
})

/** Regenerate the AI suggestion set (previous suggestions replaced). */
sessionsRouter.post('/:id/followups/regenerate', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const { questions } = regenerateSessionFollowUps(session.id, actorOf(user))
  res.status(201).json(questions)
})

/** Reorder the question list (full permutation required). */
sessionsRouter.post('/:id/followups/reorder', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const raw = req.body?.orderedIds
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
    throw new HttpError(400, 'orderedIds must be an array of question ids.')
  }
  const questions = reorderFollowUps(session.id, raw as string[], actorOf(user))
  res.json(questions)
})

/** Add a clinician-authored question (runs the PII + non-diagnostic guards). */
sessionsRouter.post('/:id/followups', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const fallbackLanguage: SupportedLanguage = session.note?.language ?? fromIntakeLanguage(session.language)
  const input: ClinicianFollowUpInput = {
    text: readFollowUpText(req.body?.text, 500),
    language: readLanguageCode(req.body?.language ?? fallbackLanguage),
    category: readFollowUpCategory(req.body?.category ?? 'other'),
    target: readFollowUpTarget(req.body?.target ?? 'patient'),
  }
  const question = addClinicianFollowUp(session.id, input, actorOf(user))
  res.status(201).json(question)
})

/** Read every follow-up question for a session. */
sessionsRouter.get('/:id/followups', (req, res) => {
  const { session } = requireSession(req, req.params.id)
  requireNote(session)
  res.json(getSessionQuestions(session.id))
})

/** Mark a question as put to the patient (staff only). */
sessionsRouter.post('/:id/followups/:questionId/ask', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const question = askFollowUp(session.id, req.params.questionId, actorOf(user))
  if (!question) throw new HttpError(404, 'Follow-up question not found.')
  res.json(question)
})

/** Record the patient's answer (verbatim, anonymised) in its own language. */
sessionsRouter.post('/:id/followups/:questionId/answer', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const answerText = typeof req.body?.answerText === 'string' ? req.body.answerText.trim() : ''
  if (!answerText) throw new HttpError(400, 'answerText is required.')
  if (answerText.length > 2000) throw new HttpError(400, 'answerText must be at most 2000 characters.')
  const answerLanguage: SupportedLanguage = readLanguageCode(
    req.body?.answerLanguage ?? session.note?.language ?? fromIntakeLanguage(session.language),
  )
  const question = answerFollowUp(session.id, req.params.questionId, answerText, answerLanguage, actorOf(user))
  if (!question) throw new HttpError(404, 'Follow-up question not found.')
  res.json(question)
})

/** Skip a question (the patient could not answer it now). */
sessionsRouter.post('/:id/followups/:questionId/skip', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const question = skipFollowUp(session.id, req.params.questionId, actorOf(user))
  if (!question) throw new HttpError(404, 'Follow-up question not found.')
  res.json(question)
})

/** Human-in-the-loop correction of a question's wording / routing. */
sessionsRouter.patch('/:id/followups/:questionId', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const body = req.body ?? {}
  const patch: FollowUpEditPatch = {}
  if ('question' in body) patch.question = readFollowUpText(body.question, 500)
  if ('category' in body) patch.category = readFollowUpCategory(body.category)
  if ('target' in body) patch.target = readFollowUpTarget(body.target)
  if ('priority' in body) {
    const priority = Number(body.priority)
    if (!Number.isInteger(priority) || priority < 1 || priority > 100) {
      throw new HttpError(400, 'priority must be an integer between 1 and 100.')
    }
    patch.priority = priority
  }
  const question = editFollowUp(session.id, req.params.questionId, patch, actorOf(user))
  if (!question) throw new HttpError(404, 'Follow-up question not found.')
  res.json(question)
})

/** Remove a follow-up question. */
sessionsRouter.delete('/:id/followups/:questionId', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const deleted = deleteFollowUp(session.id, req.params.questionId, actorOf(user))
  if (!deleted) throw new HttpError(404, 'Follow-up question not found.')
  res.status(204).end()
})

/** Draft a referral to a higher-level facility (never sent automatically). */
sessionsRouter.post('/:id/referral', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  requireNote(session)
  const note = session.note!

  const toFacility =
    typeof req.body?.toFacility === 'string' && req.body.toFacility.trim()
      ? req.body.toFacility.trim()
      : 'Community Health Centre'
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : ''
  const referralLevel = readReferralLevel(req.body?.referralLevel)
  const receivingFacilityRef =
    typeof req.body?.receivingFacilityRef === 'string' ? req.body.receivingFacilityRef.trim().slice(0, 200) : undefined
  const handoverNotes =
    typeof req.body?.handoverNotes === 'string' ? req.body.handoverNotes.trim().slice(0, 5000) : undefined

  const referral = buildReferralNote({
    session,
    note,
    actor: actorOf(user),
    toFacility,
    reasonForReferral: reason,
    ...(referralLevel ? { referralLevel } : {}),
    ...(receivingFacilityRef ? { receivingFacilityRef } : {}),
    ...(handoverNotes ? { handoverNotes } : {}),
  })

  const updated = updateSession(session.id, {
    status: 'escalated',
    referral,
    note: { ...note, status: 'escalated' },
  })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'session.escalated',
    detail: `Escalated to a human reviewer at ${toFacility}.`,
    category: 'decision',
  })
  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'referral.generated',
    detail: `Referral note drafted at ${referral.referralLevel} level (${user.role === 'doctor' ? 'clinician' : 'awaiting doctor approval'}).`,
    category: 'export',
  })

  res.status(201).json({ session: updated, structuredReferral: toStructuredReferralNote(referral) })
})

/** Read the draft referral and its structured projection. */
sessionsRouter.get('/:id/referral', (req, res) => {
  const { session } = requireSession(req, req.params.id)
  if (!session.referral) throw new HttpError(404, 'No referral has been drafted for this session.')
  res.json({ referral: session.referral, structuredReferral: toStructuredReferralNote(session.referral) })
})

/** Check / uncheck one pre-referral checklist item. */
sessionsRouter.post('/:id/referral/checklist', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  if (!session.referral) throw new HttpError(409, 'No referral has been drafted for this session.')
  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : ''
  if (!itemId) throw new HttpError(400, 'itemId is required.')
  if (typeof req.body?.checked !== 'boolean') throw new HttpError(400, 'checked must be a boolean.')

  const checklist = setChecklistEntry(
    session.referral.checklist ?? {
      level: session.referral.referralLevel ?? 'phc',
      items: [],
      entries: [],
      overridden: false,
    },
    itemId,
    req.body.checked,
    actorOf(user),
  )
  const updated = updateSession(session.id, { referral: { ...session.referral, checklist } })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'referral.checklist-updated',
    detail: `Pre-referral checklist item ${itemId} ${req.body.checked ? 'checked' : 'unchecked'}.`,
    category: 'edit',
  })

  res.json({ session: updated, checklistSatisfied: checklistSatisfied(checklist) })
})

/** Override the pre-referral checklist with a recorded reason (never silent). */
sessionsRouter.post('/:id/referral/checklist/override', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  if (!session.referral) throw new HttpError(409, 'No referral has been drafted for this session.')
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''

  const checklist = overrideChecklist(
    session.referral.checklist ?? {
      level: session.referral.referralLevel ?? 'phc',
      items: [],
      entries: [],
      overridden: false,
    },
    reason,
    actorOf(user),
  )
  const updated = updateSession(session.id, { referral: { ...session.referral, checklist } })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'referral.checklist-overridden',
    detail: `Pre-referral checklist overridden: ${checklist.overrideReason ?? ''}`,
    category: 'decision',
  })

  res.json({ session: updated })
})

/** Move the referral along its workflow status machine. */
sessionsRouter.post('/:id/referral/status', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  if (!session.referral) throw new HttpError(409, 'No referral has been drafted for this session.')

  const status = readReferralStatus(req.body?.status)
  const noteText = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : undefined
  const referral = applyReferralStatus(session.referral, status, actorOf(user), noteText)
  const updated = updateSession(session.id, { referral })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'referral.status-changed',
    detail: `Referral moved to "${status}".`,
    category: 'decision',
  })

  res.json({ session: updated })
})

/** Approve a draft referral for hand-off (doctor or admin only). */
sessionsRouter.post('/:id/referral/approve', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  if (!session.referral) throw new HttpError(409, 'No referral has been drafted for this session.')

  const referral = applyReferralStatus(session.referral, 'approved', actorOf(user))
  const updated = updateSession(session.id, { referral })

  addAudit({
    sessionId: session.id,
    actor: user.displayName,
    role: user.role,
    action: 'referral.approved',
    detail: 'Referral approved for hand-off to a higher-level facility.',
    category: 'decision',
  })

  res.json({ session: updated })
})

/* ==================================================================== */
/*  Timeline (P0-4)                                                      */
/* ==================================================================== */

/** Build (or rebuild) the AI draft from every source on the session. */
sessionsRouter.post('/:id/timeline/build', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const timeline = buildTimeline(session.id, actorOf(user))
  res.status(201).json({ timeline })
})

/** Regenerate the AI draft (previous draft is replaced, history audited). */
sessionsRouter.post('/:id/timeline/regenerate', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const timeline = regenerateTimeline(session.id, actorOf(user))
  res.status(201).json({ timeline })
})

/** Accept the draft as reviewed — the human takes ownership of the chronology. */
sessionsRouter.post('/:id/timeline/accept', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const timeline = acceptTimeline(session.id, actorOf(user))
  if (!timeline) throw new HttpError(404, 'Timeline not found. Build it first.')
  res.json({ timeline })
})

/** Read the timeline (staff + the patient who owns the session). */
sessionsRouter.get('/:id/timeline', (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const timeline = getTimelineForSession(session.id, actorOf(user))
  if (!timeline) throw new HttpError(404, 'Timeline not built yet. Build it first.')
  res.json({ timeline })
})

/** Add a clinician event to the timeline (applies the non-diagnostic guard). */
sessionsRouter.post('/:id/timeline/events', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const body = req.body ?? {}

  const eventText = typeof body.eventText === 'string' ? body.eventText.trim() : ''
  if (!eventText) throw new HttpError(400, 'eventText is required.')
  if (eventText.length > 1000) throw new HttpError(400, 'eventText must be at most 1000 characters.')

  const violation = assertTimelineTextSafe(eventText)
  if (violation) throw new HttpError(400, violation.error, { suggestion: violation.suggestion })

  const eventType: TimelineEventType =
    body.eventType === undefined
      ? 'clinician-note'
      : EVENT_TYPES.includes(body.eventType)
        ? body.eventType
        : (() => {
            throw new HttpError(400, `eventType must be one of: ${EVENT_TYPES.join(', ')}.`)
          })()
  const precision: TimePrecision =
    body.timePrecision === undefined
      ? 'unknown'
      : TIME_PRECISIONS.includes(body.timePrecision)
        ? body.timePrecision
        : (() => {
            throw new HttpError(400, `timePrecision must be one of: ${TIME_PRECISIONS.join(', ')}.`)
          })()

  const fallbackLanguage: SupportedLanguage =
    session.note?.language ?? fromIntakeLanguage(session.language)
  const eventTextLanguage: SupportedLanguage = LANG_CODES.includes(body.eventTextLanguage)
    ? body.eventTextLanguage
    : fallbackLanguage

  const input: NewTimelineEventInput = {
    eventText,
    eventTextLanguage,
    eventType,
    timeExpression: typeof body.timeExpression === 'string' ? body.timeExpression.slice(0, 200) : '',
    normalizedTime: parseNormalizedTime(body.normalizedTime),
    timePrecision: precision,
    sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef.slice(0, 120) : undefined,
  }

  const timeline = addTimelineEvent(session.id, actorOf(user), input)
  if (!timeline) throw new HttpError(404, 'Timeline not built yet. Build it first.')
  res.status(201).json({ timeline })
})

/** Edit a timeline event (human-in-the-loop correction). */
sessionsRouter.patch('/:id/timeline/events/:eventId', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const body = req.body ?? {}

  const patch: TimelineEventEdit = {}

  if ('eventText' in body) {
    const eventText = typeof body.eventText === 'string' ? body.eventText.trim() : ''
    if (!eventText || eventText.length > 1000) throw new HttpError(400, 'eventText must be 1-1000 characters.')
    const violation = assertTimelineTextSafe(eventText)
    if (violation) throw new HttpError(400, violation.error, { suggestion: violation.suggestion })
    patch.eventText = eventText
  }
  if ('eventTextLanguage' in body) {
    if (!LANG_CODES.includes(body.eventTextLanguage)) throw new HttpError(400, 'eventTextLanguage must be en, hi or or.')
    patch.eventTextLanguage = body.eventTextLanguage
  }
  if ('eventType' in body) {
    if (!EVENT_TYPES.includes(body.eventType)) throw new HttpError(400, `eventType must be one of: ${EVENT_TYPES.join(', ')}.`)
    patch.eventType = body.eventType
  }
  if ('timeExpression' in body) {
    patch.timeExpression = typeof body.timeExpression === 'string' ? body.timeExpression.slice(0, 200) : ''
  }
  if ('timePrecision' in body) {
    if (!TIME_PRECISIONS.includes(body.timePrecision)) throw new HttpError(400, `timePrecision must be one of: ${TIME_PRECISIONS.join(', ')}.`)
    patch.timePrecision = body.timePrecision
  }
  if ('normalizedTime' in body) {
    patch.normalizedTime = parseNormalizedTime(body.normalizedTime)
  }

  const timeline = editTimelineEvent(session.id, actorOf(user), req.params.eventId, patch)
  if (!timeline) throw new HttpError(404, 'Timeline event not found.')
  res.json({ timeline })
})

/** Remove a timeline event. */
sessionsRouter.delete('/:id/timeline/events/:eventId', requireRole('nurse', 'doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const timeline = removeTimelineEvent(session.id, actorOf(user), req.params.eventId)
  if (!timeline) throw new HttpError(404, 'Timeline event not found.')
  res.json({ timeline })
})

/* ==================================================================== */
/*  Consent + data retention (P0-6)                                      */
/* ==================================================================== */

/** Consent proof + retention link for one case (owner may read it). */
sessionsRouter.get('/:id/consent', (req, res) => {
  const { session } = requireSession(req, req.params.id)
  res.json({ consent: getConsentForSession(session.id) })
})

/**
 * Withdraw consent. Any authenticated caller who can see the case may do this
 * (a patient their own case); the case is erased immediately and the consent
 * proof survives as the record that processing stopped.
 */
sessionsRouter.post('/:id/consent/revoke', (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : ''
  const result = revokeConsent(session.id, user, reason)
  res.json(result)
})

/** Build a portable export of everything held about this case (doctor/admin). */
sessionsRouter.post('/:id/retention/export', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const payload = buildSessionExport(session.id, actorOf(user))
  res.status(201).json({ export: payload })
})

/** Manually erase a case (doctor/admin) — same guarantees as the sweep. */
sessionsRouter.post('/:id/retention/delete', requireRole('doctor'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim().slice(0, 500)
    : 'Manual deletion requested by a healthcare worker.'
  const result = eraseSessionData(session.id, actorOf(user), reason)
  res.json({ deleted: true, ...result })
})

/** Push a case's retention out (admin only). */
sessionsRouter.post('/:id/retention/extend', requireRole('admin'), (req, res) => {
  const { session, user } = requireSession(req, req.params.id)
  const days = Number(req.body?.days)
  const result = extendSessionRetention({ sessionId: session.id, days }, actorOf(user))
  res.json(result)
})