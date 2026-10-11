import { HttpError } from '../middleware/errorHandler'
import type {
  EscalationReasonCode,
  NoteActorStamp,
  NoteRejectionReasonCode,
  NoteReviewAction,
  NoteReviewRecord,
  ReturnReasonCode,
  SeniorEscalation,
  TriageNote,
  UserRole,
} from '../types'

/**
 * Note review chain (P2-18 items H/P/Q/R).
 *
 * A pure workflow state machine that separates the four human steps on an AI
 * draft — review, accept, finalize, plus reject / return-to-intake and senior
 * escalation. Nothing here is clinical: the states only record who looked at
 * the draft and what they decided to do with the WORKFLOW. Roles are enforced
 * by the route; this module enforces legal transitions and required reasons.
 */

export type NoteStatus = TriageNote['status']

export interface ReviewActor {
  name: string
  role: UserRole
}

export const NOTE_REJECTION_REASON_CODES: NoteRejectionReasonCode[] = [
  'incomplete',
  'inaccurate',
  'inappropriate',
  'other',
]

export const RETURN_REASON_CODES: ReturnReasonCode[] = [
  'incomplete-history',
  'missing-vitals',
  'unclear-complaint',
  'other',
]

export const ESCALATION_REASON_CODES: EscalationReasonCode[] = [
  'clinical-complexity',
  'resource-limitation',
  'specialist-needed',
  'patient-request',
  'safety-concern',
  'other',
]

/** Allowed note-status transitions. Terminal states have no outbound edges. */
export const NOTE_STATUS_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  'ai-draft': ['reviewed', 'escalated', 'rejected', 'returned-to-intake'],
  'human-edited': ['reviewed', 'escalated', 'rejected', 'returned-to-intake'],
  reviewed: ['accepted', 'escalated', 'rejected', 'returned-to-intake'],
  accepted: ['finalized', 'escalated'],
  escalated: ['reviewed', 'accepted', 'rejected', 'returned-to-intake'],
  finalized: [],
  rejected: [],
  'returned-to-intake': [],
}

export function isTerminalNoteStatus(status: NoteStatus): boolean {
  return NOTE_STATUS_TRANSITIONS[status].length === 0
}

export function canReviewTransition(from: NoteStatus, to: NoteStatus): boolean {
  return NOTE_STATUS_TRANSITIONS[from].includes(to)
}

export function assertReviewTransition(from: NoteStatus, to: NoteStatus): void {
  if (!canReviewTransition(from, to)) {
    throw new HttpError(409, `A note cannot move from "${from}" to "${to}".`)
  }
}

function stamp(actor: ReviewActor): NoteActorStamp {
  return { by: actor.name, role: actor.role, at: new Date().toISOString() }
}

function requireReason(text: string, min = 3): string {
  const trimmed = text.trim()
  if (trimmed.length < min) throw new HttpError(400, `A reason of at least ${min} characters is required.`)
  return trimmed.slice(0, 500)
}

export function reviewRecord(
  action: NoteReviewAction,
  actor: ReviewActor,
  extra: { reasonCode?: string; reasonText?: string; targetActor?: string } = {},
): NoteReviewRecord {
  return {
    action,
    actor: actor.name,
    actorRole: actor.role,
    at: new Date().toISOString(),
    ...(extra.reasonCode ? { reasonCode: extra.reasonCode } : {}),
    ...(extra.reasonText ? { reasonText: extra.reasonText } : {}),
    ...(extra.targetActor ? { targetActor: extra.targetActor } : {}),
  }
}

/* ------------------------------------------------------------------ */
/*  Transitions                                                        */
/* ------------------------------------------------------------------ */

export function markReviewed(note: TriageNote, actor: ReviewActor): TriageNote {
  assertReviewTransition(note.status, 'reviewed')
  return { ...note, status: 'reviewed', reviewedBy: stamp(actor) }
}

export function acceptNote(note: TriageNote, actor: ReviewActor): TriageNote {
  assertReviewTransition(note.status, 'accepted')
  return { ...note, status: 'accepted', acceptedBy: stamp(actor) }
}

export function finalizeNote(note: TriageNote, actor: ReviewActor): TriageNote {
  assertReviewTransition(note.status, 'finalized')
  return { ...note, status: 'finalized', finalizedBy: stamp(actor) }
}

export function rejectNote(
  note: TriageNote,
  reasonCode: NoteRejectionReasonCode,
  reasonText: string,
  actor: ReviewActor,
): TriageNote {
  if (!NOTE_REJECTION_REASON_CODES.includes(reasonCode)) {
    throw new HttpError(400, `reasonCode must be one of: ${NOTE_REJECTION_REASON_CODES.join(', ')}.`)
  }
  assertReviewTransition(note.status, 'rejected')
  return {
    ...note,
    status: 'rejected',
    rejection: { reasonCode, reasonText: requireReason(reasonText), rejectedBy: actor.name, rejectedAt: new Date().toISOString() },
  }
}

export function returnToIntake(
  note: TriageNote,
  reasonCode: ReturnReasonCode,
  reasonText: string,
  actor: ReviewActor,
): TriageNote {
  if (!RETURN_REASON_CODES.includes(reasonCode)) {
    throw new HttpError(400, `reasonCode must be one of: ${RETURN_REASON_CODES.join(', ')}.`)
  }
  assertReviewTransition(note.status, 'returned-to-intake')
  return {
    ...note,
    status: 'returned-to-intake',
    returnToIntake: { reasonCode, reasonText: requireReason(reasonText), returnedBy: actor.name, returnedAt: new Date().toISOString() },
  }
}

export interface EscalationInput {
  escalatedTo: string
  escalatedToName: string
  reasonCode: EscalationReasonCode
  reasonText: string
}

export function escalateNote(note: TriageNote, input: EscalationInput, actor: ReviewActor): TriageNote {
  if (!ESCALATION_REASON_CODES.includes(input.reasonCode)) {
    throw new HttpError(400, `reasonCode must be one of: ${ESCALATION_REASON_CODES.join(', ')}.`)
  }
  if (!input.escalatedTo.trim()) throw new HttpError(400, 'A senior clinician must be selected.')
  assertReviewTransition(note.status, 'escalated')
  const escalation: SeniorEscalation = {
    escalatedTo: input.escalatedTo.trim(),
    escalatedToName: input.escalatedToName.trim() || input.escalatedTo.trim(),
    reason: requireReason(input.reasonText),
    reasonCode: input.reasonCode,
    escalatedBy: actor.name,
    escalatedAt: new Date().toISOString(),
    status: 'pending',
  }
  return { ...note, status: 'escalated', escalation }
}

/** A senior accepts or declines a pending escalation (the note stays escalated on decline). */
export function resolveEscalation(note: TriageNote, status: 'accepted' | 'declined', actor: ReviewActor): TriageNote {
  if (!note.escalation || note.escalation.status !== 'pending') {
    throw new HttpError(409, 'There is no pending escalation on this note.')
  }
  if (status === 'declined') {
    return { ...note, escalation: { ...note.escalation, status: 'declined' } }
  }
  assertReviewTransition(note.status, 'accepted')
  return { ...note, status: 'accepted', acceptedBy: stamp(actor), escalation: { ...note.escalation, status: 'accepted' } }
}
