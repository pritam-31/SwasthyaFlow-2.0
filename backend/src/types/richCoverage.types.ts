/**
 * Rich PS-coverage model (P2-18).
 *
 * Data-driven urgency rules, missing-info checks, structured referrals,
 * multi-level escalation, review/accept/finalize separation, voice metrics,
 * body-region labelling, extended lab formats, branching follow-ups, the triage
 * summary PDF, the case one-pager, the shift-handover report and the in-app SLA
 * notification.
 *
 * Hard rules (mirrors every other module):
 *  - Nothing here diagnoses, prescribes or plans treatment. Urgency and every
 *    label are WORKFLOW concepts, never clinical conclusions.
 *  - All free text is anonymised before storage and is subject to the
 *    non-diagnostic guard.
 *  - Every mutation is RBAC-gated, facility-scoped and audit-logged.
 */

import type { SupportedLanguage } from './language.types'
import type { ConfidenceScore } from './confidence.types'
import type { PriorityBand } from './priority.types'

/* ------------------------------------------------------------------ */
/*  A — Urgency rules (JSON-driven)                                    */
/* ------------------------------------------------------------------ */

export type UrgencySeverity = 'red' | 'amber'

/** One workflow urgency rule as it appears in `rules/urgency/<lang>.json`. */
export interface UrgencyRuleDef {
  id: string
  label: string
  severity: UrgencySeverity
  /** Regex source strings for the language of the file they live in. */
  patterns: string[]
  /** One-line, non-diagnostic explanation of why this signal matters. */
  nonDiagnosticNote: string
}

/* ------------------------------------------------------------------ */
/*  B — Missing-info checks (JSON-driven)                              */
/* ------------------------------------------------------------------ */

export type MissingInfoTargetType = 'patient' | 'staff' | 'either'

/** One missing-information check as it appears in `rules/missingInfo/<lang>.json`. */
export interface MissingInfoCheckDef {
  id: string
  label: string
  /** Presence patterns: if none match, the field is reported as missing. */
  patterns: string[]
  whyItMatters: string
  targetType: MissingInfoTargetType
}

/* ------------------------------------------------------------------ */
/*  D — Multi-level escalation                                         */
/* ------------------------------------------------------------------ */

export type ReferralLevel = 'phc' | 'district' | 'tertiary' | 'specialty'

export const REFERRAL_LEVELS: ReferralLevel[] = ['phc', 'district', 'tertiary', 'specialty']

/* ------------------------------------------------------------------ */
/*  F — Pre-referral checklist                                         */
/* ------------------------------------------------------------------ */

export interface PreReferralChecklistItem {
  id: string
  label: string
  critical: boolean
  requiredForLevels: ReferralLevel[]
  note?: string
}

export interface PreReferralChecklistEntry {
  itemId: string
  checked: boolean
  checkedBy?: string
  checkedAt?: string
}

export interface PreReferralChecklistState {
  level: ReferralLevel
  items: PreReferralChecklistItem[]
  entries: PreReferralChecklistEntry[]
  overridden: boolean
  overrideReason?: string
  overriddenBy?: string
  overriddenAt?: string
}

/* ------------------------------------------------------------------ */
/*  G — Post-referral tracking                                         */
/* ------------------------------------------------------------------ */

export type ReferralStatus =
  | 'draft'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'arrived'
  | 'outcome-recorded'
  | 'closed'
  | 'cancelled'

export const REFERRAL_STATUSES: ReferralStatus[] = [
  'draft',
  'approved',
  'sent',
  'accepted',
  'arrived',
  'outcome-recorded',
  'closed',
  'cancelled',
]

/** Allowed status transitions (a terminal status has no outbound edges). */
export const REFERRAL_STATUS_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['accepted', 'cancelled'],
  accepted: ['arrived', 'closed'],
  arrived: ['outcome-recorded', 'closed'],
  'outcome-recorded': ['closed'],
  closed: [],
  cancelled: [],
}

export const TERMINAL_REFERRAL_STATUSES: ReferralStatus[] = ['closed', 'cancelled']

export interface ReferralStatusEvent {
  fromStatus: ReferralStatus
  toStatus: ReferralStatus
  actor: string
  actorRole: string
  note?: string
  at: string
}

/* ------------------------------------------------------------------ */
/*  E — "Why this referral" rationale                                  */
/* ------------------------------------------------------------------ */

export interface ReferralRationaleItem {
  id: string
  label: string
  ruleId: string
  severity: UrgencySeverity
  confidence?: ConfidenceScore
}

export interface ReferralRationale {
  urgencyFlags: ReferralRationaleItem[]
  missingInfoItems: Array<{ id: string; label: string; whyItMatters: string; confidence?: ConfidenceScore }>
  vitalsSignals: string[]
  reportSignals: string[]
  visualSignals: string[]
  aggregateConfidence?: ConfidenceScore
  disclaimer: string
}

/* ------------------------------------------------------------------ */
/*  C — Structured referral note                                       */
/* ------------------------------------------------------------------ */

export interface ReferralClinicalSummary {
  chiefComplaint: string
  history: string
  vitals: string
}

export interface ReferralInvestigation {
  kind: 'report' | 'visual'
  ref: string
  summary: string
}

export interface ReferralFollowUpAnswer {
  question: string
  answer: string
  language: SupportedLanguage
}

export interface StructuredReferralNote {
  reasonForReferral: string
  clinicalSummary: ReferralClinicalSummary
  timelineSummary: string
  investigations: ReferralInvestigation[]
  followUpQuestionsAnswered: ReferralFollowUpAnswer[]
  pendingInvestigations: string[]
  preReferralChecklist: PreReferralChecklistState
  referralLevel: ReferralLevel
  receivingFacilityRef: string
  handoverNotes: string
  nonDiagnosticDisclaimer: string
  preparedBy: string
  approvedBy: string | null
  status: ReferralStatus
  rationale: ReferralRationale
  statusHistory: ReferralStatusEvent[]
}

/* ------------------------------------------------------------------ */
/*  R — Senior escalation                                              */
/* ------------------------------------------------------------------ */

export type EscalationReasonCode =
  | 'clinical-complexity'
  | 'resource-limitation'
  | 'specialist-needed'
  | 'patient-request'
  | 'safety-concern'
  | 'other'

export interface EscalationReason {
  code: EscalationReasonCode
  text: string
}

export interface SeniorEscalation {
  escalatedTo: string
  escalatedToName: string
  reason: string
  reasonCode: EscalationReasonCode
  escalatedBy: string
  escalatedAt: string
  status: 'pending' | 'accepted' | 'declined'
}

/* ------------------------------------------------------------------ */
/*  P / Q — Note rejection + return to intake                          */
/* ------------------------------------------------------------------ */

export type NoteRejectionReasonCode = 'incomplete' | 'inaccurate' | 'inappropriate' | 'other'

export interface NoteRejection {
  reasonCode: NoteRejectionReasonCode
  reasonText: string
  rejectedBy: string
  rejectedAt: string
}

export type ReturnReasonCode = 'incomplete-history' | 'missing-vitals' | 'unclear-complaint' | 'other'

export interface ReturnToIntake {
  reasonCode: ReturnReasonCode
  reasonText: string
  returnedBy: string
  returnedAt: string
}

/* ------------------------------------------------------------------ */
/*  H — review / accept / finalize separation                          */
/* ------------------------------------------------------------------ */

export interface NoteActorStamp {
  /** Actor display name (already anonymised at the source). */
  by: string
  role: string
  at: string
}

/* ------------------------------------------------------------------ */
/*  I — Voice intake metrics                                           */
/* ------------------------------------------------------------------ */

export interface VoiceIntakeMetrics {
  sessionId: string
  durationMs: number
  languageDetected: SupportedLanguage
  transcriptLength: number
  confidence: number
  recordedAt: string
  recordedBy: string
}

/* ------------------------------------------------------------------ */
/*  J — Visual body-region diagram                                     */
/* ------------------------------------------------------------------ */

export interface BodyRegion {
  id: string
  label: Record<SupportedLanguage, string>
  front: boolean
  back: boolean
  x: number
  y: number
  radius: number
}

/* ------------------------------------------------------------------ */
/*  O — Triage summary PDF                                             */
/* ------------------------------------------------------------------ */

export interface TriageSummaryPdf {
  sessionId: string
  ref: string
  sizeBytes: number
  mimeType: string
  generatedAt: string
  generatedBy: string
  language: SupportedLanguage
}

/* ------------------------------------------------------------------ */
/*  W — Case summary one-pager                                         */
/* ------------------------------------------------------------------ */

export interface CaseSummaryOnePager {
  sessionId: string
  chiefComplaint: string
  timelineSummary: string
  topUrgencyFlags: Array<{ label: string; severity: UrgencySeverity }>
  topMissingInfo: Array<{ label: string; whyItMatters: string }>
  priorityBand: PriorityBand
  priorityRationale: string
  aggregateConfidence: number
  assignedTo: string | null
  generatedAt: string
  language: SupportedLanguage
  disclaimer: string
}

/* ------------------------------------------------------------------ */
/*  V — Shift handover                                                 */
/* ------------------------------------------------------------------ */

export interface ShiftHandoverCase {
  sessionId: string
  patientId: string
  priorityBand: PriorityBand
  chiefComplaint: string
  waitTimeMs: number
  assignedTo: string | null
  status: string
}

export interface ShiftHandoverFilter {
  assignedTo?: string
  band?: PriorityBand[]
  language?: SupportedLanguage
}

export interface ShiftHandoverReport {
  facilityId: string
  generatedAt: string
  generatedBy: string
  cases: ShiftHandoverCase[]
  totalCases: number
  language: SupportedLanguage
  disclaimer: string
}

/* ------------------------------------------------------------------ */
/*  U — SLA breach notification (in-app only)                          */
/* ------------------------------------------------------------------ */

export interface SlaBreachNotification {
  sessionId: string
  patientId: string
  priorityBand: PriorityBand
  breachedAt: string
  assigneeId: string
}

/* ------------------------------------------------------------------ */
/*  Audit for review chain                                             */
/* ------------------------------------------------------------------ */

export type NoteReviewAction =
  | 'reviewed'
  | 'accepted'
  | 'finalized'
  | 'rejected'
  | 'returned-to-intake'
  | 'escalated-senior'

export interface NoteReviewRecord {
  action: NoteReviewAction
  actor: string
  actorRole: string
  at: string
  reasonCode?: string
  reasonText?: string
  targetActor?: string
}
