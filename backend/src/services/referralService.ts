import { randomUUID } from 'node:crypto'
import { HttpError } from '../middleware/errorHandler'
import { NON_DIAGNOSTIC_DISCLAIMER } from './nonDiagnostic'
import type {
  PatientSession,
  PreReferralChecklistItem,
  PreReferralChecklistState,
  ReferralInvestigation,
  ReferralLevel,
  ReferralNote,
  ReferralRationale,
  ReferralRationaleItem,
  ReferralStatus,
  ReferralStatusEvent,
  StructuredReferralNote,
  TriageNote,
  UserRole,
} from '../types'
import { REFERRAL_LEVELS, REFERRAL_STATUS_TRANSITIONS, TERMINAL_REFERRAL_STATUSES } from '../types'

/**
 * Structured referral domain (P2-18 items C/D/E/F/G).
 *
 * Pure, side-effect-free helpers that a route wraps with auth, facility scope
 * and audit. Nothing here diagnoses or prescribes: the referral is a handover
 * document assembled from observable signals, and its status is a WORKFLOW
 * state machine. The pre-referral checklist is a safety net, not a gate that
 * can silently block a clinician — it can be overridden with a recorded reason.
 */

/** Actor identity for a referral mutation (mirrors the timeline/route helper). */
export interface ReferralActor {
  name: string
  role: UserRole
}

/* ------------------------------------------------------------------ */
/*  F — Pre-referral checklist                                         */
/* ------------------------------------------------------------------ */

export interface PreReferralChecklistTemplate {
  id: string
  label: string
  critical: boolean
  requiredForLevels: ReferralLevel[]
  note?: string
}

const ALL_LEVELS: ReferralLevel[] = [...REFERRAL_LEVELS]

export const REFERRAL_CHECKLIST_TEMPLATE: PreReferralChecklistTemplate[] = [
  {
    id: 'PRE-01',
    label: 'Identity band and facility record attached (note itself holds no PII)',
    critical: true,
    requiredForLevels: ALL_LEVELS,
  },
  {
    id: 'PRE-02',
    label: 'Consent for referral confirmed with the patient',
    critical: true,
    requiredForLevels: ALL_LEVELS,
  },
  {
    id: 'PRE-03',
    label: 'Vital signs recorded and included in the handover',
    critical: true,
    requiredForLevels: ['district', 'tertiary', 'specialty'],
  },
  {
    id: 'PRE-04',
    label: 'Chief complaint and duration summarised',
    critical: true,
    requiredForLevels: ALL_LEVELS,
  },
  {
    id: 'PRE-05',
    label: 'Current medication and allergy list attached',
    critical: false,
    requiredForLevels: ['tertiary', 'specialty'],
  },
  {
    id: 'PRE-06',
    label: 'Available reports attached, or clearly marked as pending',
    critical: false,
    requiredForLevels: ['district', 'tertiary', 'specialty'],
  },
  {
    id: 'PRE-07',
    label: 'Transport and escort arrangement confirmed',
    critical: false,
    requiredForLevels: ['tertiary', 'specialty'],
  },
  {
    id: 'PRE-08',
    label: 'Receiving facility informed and expecting the patient',
    critical: true,
    requiredForLevels: ['district', 'tertiary', 'specialty'],
  },
  {
    id: 'PRE-09',
    label: 'Referral reason written in the receiving facility language',
    critical: false,
    requiredForLevels: ALL_LEVELS,
  },
  {
    id: 'PRE-10',
    label: 'Follow-up contact and call-back plan recorded',
    critical: false,
    requiredForLevels: ALL_LEVELS,
  },
]

export function checklistItemsForLevel(level: ReferralLevel): PreReferralChecklistItem[] {
  return REFERRAL_CHECKLIST_TEMPLATE.filter((item) => item.requiredForLevels.includes(level)).map((item) => ({
    id: item.id,
    label: item.label,
    critical: item.critical,
    requiredForLevels: [...item.requiredForLevels],
    ...(item.note ? { note: item.note } : {}),
  }))
}

export function createChecklistState(level: ReferralLevel): PreReferralChecklistState {
  return { level, items: checklistItemsForLevel(level), entries: [], overridden: false }
}

/** Check / uncheck one item. Unchecking removes the entry entirely. */
export function setChecklistEntry(
  state: PreReferralChecklistState,
  itemId: string,
  checked: boolean,
  actor: ReferralActor,
): PreReferralChecklistState {
  if (!state.items.some((item) => item.id === itemId)) {
    throw new HttpError(404, 'Checklist item not found for this referral level.')
  }
  const entries = state.entries.filter((entry) => entry.itemId !== itemId)
  if (checked) {
    entries.push({ itemId, checked: true, checkedBy: actor.name, checkedAt: new Date().toISOString() })
  }
  return { ...state, entries }
}

/** Record a deliberate override of the checklist (reason required). */
export function overrideChecklist(
  state: PreReferralChecklistState,
  reason: string,
  actor: ReferralActor,
): PreReferralChecklistState {
  const trimmed = reason.trim()
  if (trimmed.length < 3) throw new HttpError(400, 'An override reason (at least 3 characters) is required.')
  return {
    ...state,
    overridden: true,
    overrideReason: trimmed.slice(0, 500),
    overriddenBy: actor.name,
    overriddenAt: new Date().toISOString(),
  }
}

export function checkedItemIds(state: PreReferralChecklistState): string[] {
  return state.entries.filter((entry) => entry.checked).map((entry) => entry.itemId)
}

export function outstandingChecklistItems(state: PreReferralChecklistState): PreReferralChecklistItem[] {
  if (state.overridden) return []
  const checked = new Set(checkedItemIds(state))
  return state.items.filter((item) => !checked.has(item.id))
}

export function checklistSatisfied(state: PreReferralChecklistState): boolean {
  return state.overridden || outstandingChecklistItems(state).length === 0
}

/* ------------------------------------------------------------------ */
/*  G — Post-referral status machine                                   */
/* ------------------------------------------------------------------ */

export function nextAllowedStatuses(status: ReferralStatus): ReferralStatus[] {
  return [...REFERRAL_STATUS_TRANSITIONS[status]]
}

export function isTerminalReferralStatus(status: ReferralStatus): boolean {
  return TERMINAL_REFERRAL_STATUSES.includes(status)
}

export function canTransition(from: ReferralStatus, to: ReferralStatus): boolean {
  return REFERRAL_STATUS_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: ReferralStatus, to: ReferralStatus): void {
  if (!canTransition(from, to)) {
    throw new HttpError(409, `Referral cannot move from "${from}" to "${to}".`)
  }
}

/** Applies a legal status change and appends the audit trail event. */
export function applyReferralStatus(
  referral: ReferralNote,
  to: ReferralStatus,
  actor: ReferralActor,
  noteText?: string,
): ReferralNote {
  const from = referral.status
  if (from === to) return referral
  assertTransition(from, to)
  const event: ReferralStatusEvent = {
    fromStatus: from,
    toStatus: to,
    actor: actor.name,
    actorRole: actor.role,
    ...(noteText && noteText.trim() ? { note: noteText.trim().slice(0, 500) } : {}),
    at: new Date().toISOString(),
  }
  return {
    ...referral,
    status: to,
    statusHistory: [...(referral.statusHistory ?? []), event],
    approvedBy: to === 'approved' ? actor.name : referral.approvedBy,
  }
}

/* ------------------------------------------------------------------ */
/*  E — "Why this referral" rationale                                  */
/* ------------------------------------------------------------------ */

export function buildReferralRationale(session: PatientSession, note: TriageNote): ReferralRationale {
  const urgencyFlags: ReferralRationaleItem[] = note.urgencyFlags.map((flag) => ({
    id: flag.id,
    label: flag.label,
    ruleId: flag.ruleId,
    severity: flag.severity,
    ...(flag.confidenceScore ? { confidence: flag.confidenceScore } : {}),
  }))
  const missingInfoItems = note.missingInformation.map((item) => ({
    id: item.id,
    label: item.field,
    whyItMatters: item.whyItMatters,
    ...(item.confidenceScore ? { confidence: item.confidenceScore } : {}),
  }))
  const vitalsSignals: string[] = []
  const vitals = note.structuredNote.vitals.trim()
  if (vitals) vitalsSignals.push(vitals)
  const reportSignals = session.reports
    .flatMap((report) => report.findings.slice(0, 3))
    .slice(0, 10)
  const visualSignals = session.visuals
    .flatMap((visual) => visual.extraction.appearance.slice(0, 2))
    .slice(0, 10)
  return {
    urgencyFlags,
    missingInfoItems,
    vitalsSignals,
    reportSignals,
    visualSignals,
    ...(note.aggregateConfidence ? { aggregateConfidence: note.aggregateConfidence } : {}),
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  }
}

/** Fallback rationale for legacy referrals drafted before P2-18. */
export function emptyRationale(): ReferralRationale {
  return {
    urgencyFlags: [],
    missingInfoItems: [],
    vitalsSignals: [],
    reportSignals: [],
    visualSignals: [],
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  }
}

/* ------------------------------------------------------------------ */
/*  C — Structured referral note                                       */
/* ------------------------------------------------------------------ */

export function collectInvestigations(session: PatientSession): ReferralInvestigation[] {
  const reports: ReferralInvestigation[] = session.reports.map((report) => ({
    kind: 'report',
    ref: report.id,
    summary: report.findings[0] ?? `${report.type} report on file`,
  }))
  const visuals: ReferralInvestigation[] = session.visuals.map((visual) => ({
    kind: 'visual',
    ref: visual.id,
    summary: visual.extraction.appearance[0] ?? `${visual.visualType} image captured`,
  }))
  return [...reports, ...visuals].slice(0, 20)
}

export interface BuildReferralInput {
  session: PatientSession
  note: TriageNote
  actor: ReferralActor
  toFacility: string
  reasonForReferral?: string
  referralLevel?: ReferralLevel
  receivingFacilityRef?: string
  handoverNotes?: string
  investigations?: ReferralInvestigation[]
}

function defaultReason(toFacility: string): string {
  return `Reviewer requested higher-level assessment at ${toFacility} — reason to be confirmed by the receiving clinician.`
}

export function buildReferralNote(input: BuildReferralInput): ReferralNote {
  const { session, note, actor } = input
  const level: ReferralLevel =
    input.referralLevel && REFERRAL_LEVELS.includes(input.referralLevel) ? input.referralLevel : 'phc'
  const toFacility = input.toFacility.trim() || 'Community Health Centre'
  const reason = (input.reasonForReferral ?? '').trim()
  const summary = [
    note.structuredNote.chiefComplaint,
    note.structuredNote.history,
    `Reported vitals: ${note.structuredNote.vitals}`,
    `Observations: ${note.observations.join(' | ')}`,
  ].join('\n')

  return {
    id: `ref-${randomUUID()}`,
    sessionId: session.id,
    patientId: session.patientId,
    fromFacility: session.facility,
    toFacility,
    reasonForReferral: reason.length > 0 ? reason.slice(0, 500) : defaultReason(toFacility),
    urgency: note.riskScore,
    summary,
    missingInformation: note.missingInformation.map((item) => item.field),
    openQuestions: note.followUpQuestions.map((question) => question.question),
    preparedBy: actor.name,
    preparedByRole: actor.role,
    approvedBy: null,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
    referralLevel: level,
    receivingFacilityRef: (input.receivingFacilityRef ?? toFacility).trim(),
    checklist: createChecklistState(level),
    rationale: buildReferralRationale(session, note),
    statusHistory: [],
    handoverNotes: (input.handoverNotes ?? '').trim().slice(0, 5000),
    investigations: input.investigations ?? collectInvestigations(session),
    timelineSummary: session.timeline?.summary ?? '',
    followUpQuestionsAnswered: note.followUpQuestions
      .filter((question) => question.status === 'answered' && typeof question.answer === 'string')
      .map((question) => ({
        question: question.question,
        answer: question.answer as string,
        language: question.answerLanguage ?? question.language,
      })),
    pendingInvestigations: note.missingInformation
      .filter((item) => item.target === 'staff')
      .map((item) => item.field),
  }
}

/** Projects the stored referral into the canonical structured shape (item C). */
export function toStructuredReferralNote(referral: ReferralNote): StructuredReferralNote {
  const level: ReferralLevel = referral.referralLevel ?? 'phc'
  const [chiefComplaint, ...rest] = referral.summary.split('\n')
  return {
    reasonForReferral: referral.reasonForReferral,
    clinicalSummary: {
      chiefComplaint: chiefComplaint ?? '',
      history: rest.join('\n'),
      vitals: referral.rationale?.vitalsSignals.join('; ') ?? '',
    },
    timelineSummary: referral.timelineSummary ?? '',
    investigations: referral.investigations ?? [],
    followUpQuestionsAnswered: referral.followUpQuestionsAnswered ?? [],
    pendingInvestigations: referral.pendingInvestigations ?? [],
    preReferralChecklist: referral.checklist ?? createChecklistState(level),
    referralLevel: level,
    receivingFacilityRef: referral.receivingFacilityRef ?? referral.toFacility,
    handoverNotes: referral.handoverNotes ?? '',
    nonDiagnosticDisclaimer: referral.disclaimer,
    preparedBy: referral.preparedBy,
    approvedBy: referral.approvedBy,
    status: referral.status,
    rationale: referral.rationale ?? emptyRationale(),
    statusHistory: referral.statusHistory ?? [],
  }
}
