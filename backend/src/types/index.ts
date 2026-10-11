/**
 * Backend domain model.
 *
 * Hard rules (mirrors the frontend contract):
 *  - Never store or return raw patient identifiers — only the redacted text.
 *  - The AI layer outputs observations, urgency signals and questions only:
 *    never a diagnosis, prescription or treatment plan.
 */

import type { ConsentRecord } from './retention.types'
import type { ExtractedReport } from './report.types'
import type { Timeline } from './timeline.types'
import type { VisualRecord } from './visual.types'
import type { SupportedLanguage } from './language.types'
import type { ConfidenceScore, SessionConfidence } from './confidence.types'
import type {
  NoteActorStamp,
  NoteRejection,
  PreReferralChecklistState,
  ReferralFollowUpAnswer,
  ReferralInvestigation,
  ReferralLevel,
  ReferralRationale,
  ReferralStatus,
  ReferralStatusEvent,
  ReturnToIntake,
  SeniorEscalation,
} from './richCoverage.types'

export type RiskScore = 'High' | 'Medium' | 'Low'

export type IntakeLanguage = 'English' | 'Hindi' | 'Odia'

export type AgeBand = '0-17' | '18-39' | '40-59' | '60+' | 'Unknown'

export type SexMarker = 'Female' | 'Male' | 'Other' | 'Not stated'

export type IntakePoint = 'OPD' | 'Health camp' | 'Follow-up' | 'Emergency triage'

/** Legacy `admin` is retained as an alias of `system-admin` for compatibility. */
export type UserRole = 'patient' | 'nurse' | 'doctor' | 'admin' | 'system-admin' | 'facility-admin'

export type RedactionCategory =
  | 'name'
  | 'phone'
  | 'id-number'
  | 'email'
  | 'address'
  | 'date-of-birth'
  | 'hospital-id'
  | 'patient-id'
  | 'aadhaar'
  | 'pan'
  | 'voter-id'
  | 'ration-card'
  | 'lab-name'

export interface Redaction {
  category: RedactionCategory
  count: number
}

export interface AnonymizationReport {
  redactedCount: number
  redactions: Redaction[]
  /** Per-language redaction tally when language-aware anonymisation ran (P0-3). */
  byLanguage?: Array<{ language: SupportedLanguage; count: number }>
}

export interface StructuredNote {
  chiefComplaint: string
  history: string
  vitals: string
}

export interface UrgencyFlag {
  id: string
  label: string
  severity: 'red' | 'amber'
  reason: string
  ruleId: string
  /** Extraction confidence (P2-14) — a workflow label, never a clinical probability. */
  confidenceScore?: ConfidenceScore
}

export interface MissingInfoItem {
  id: string
  field: string
  whyItMatters: string
  /** Extraction confidence (P2-14) — how reliably the check ran. */
  confidenceScore?: ConfidenceScore
  /** Stable check id the item came from (e.g. `CHK-05`) — P2-18. */
  ruleId?: string
  /** Who the missing field applies to — a workflow label, never clinical. */
  target?: 'patient' | 'staff' | 'either'
}

export type FollowUpStatus =
  | 'suggested'
  | 'asked'
  | 'answered'
  | 'skipped'
  | 'skipped-branch'

export type FollowUpTarget = 'patient' | 'staff'

export type FollowUpSourceType =
  | 'missing-info'
  | 'urgency-flag'
  | 'report-lab'
  | 'report-vital'
  | 'report-text'
  | 'visual'
  | 'timeline-gap'
  | 'clinician'
  | 'fallback'

/**
 * A dynamic, context-aware follow-up question (P0-5).
 *
 * Every stored question carries its language, target audience, priority, why it
 * matters, and the source it was generated from. Questions are AI-suggestions
 * that a human puts to the patient (asked → answered / skipped); the patient
 * never records a diagnosis and answers are kept verbatim (anonymised).
 */
export interface FollowUpQuestion {
  id: string
  question: string
  status: FollowUpStatus
  /** Verbatim (anonymised) answer in the patient's own words. */
  answer?: string
  /** Language of the question text (en | hi | or). */
  language: SupportedLanguage
  /** Which follow-up category this question addresses. */
  category: string
  /** Who the question is aimed at: the patient to answer, or clinical staff. */
  target: FollowUpTarget
  /** 1 = ask first … 100 = ask last. */
  priority: number
  /** Why this question matters — written in the question's language. */
  reason: string
  /** What generated this question (missing-info / urgency … / clinician). */
  sourceType: FollowUpSourceType
  /** The source this question came from (rule id / missing field / report id…). */
  sourceRef: string
  /** Extraction confidence (P2-14) — reliability of the signal that spawned it. */
  confidenceScore?: ConfidenceScore
  /** When the question was put to the patient. */
  askedAt?: string
  /** When the answer was recorded. */
  answeredAt?: string
  /** Display name of the healthcare worker who recorded the answer. */
  answeredBy?: string
  /** Language of the recorded answer (en | hi | or) — may differ from `language`. */
  answerLanguage?: SupportedLanguage
  askIf?: { questionId: string; answerIn: string[] } | null
  createdAt: string
  updatedAt: string
}

export interface NoteOverride {
  id: string
  field: string
  previousValue: string
  newValue: string
  reviewer: string
  role: UserRole
  at: string
}

export interface ReferralNote {
  id: string
  sessionId: string
  patientId: string
  fromFacility: string
  toFacility: string
  reasonForReferral: string
  urgency: RiskScore
  summary: string
  missingInformation: string[]
  openQuestions: string[]
  preparedBy: string
  preparedByRole: UserRole
  approvedBy: string | null
  status: ReferralStatus
  generatedAt: string
  disclaimer: string
  /* ---- P2-18 rich structured referral (all optional for compatibility) ---- */
  /** Which level of the referral ladder the case is heading to. */
  referralLevel?: ReferralLevel
  /** Facility the draft is addressed to (free-text ref, kept anonymised). */
  receivingFacilityRef?: string
  /** Pre-referral checklist state for the chosen level. */
  checklist?: PreReferralChecklistState
  /** "Why this referral" — the observable signals behind the decision. */
  rationale?: ReferralRationale
  /** Post-referral status trail (draft → approved → sent → … → closed). */
  statusHistory?: ReferralStatusEvent[]
  /** Structured handover free-text (anonymised). */
  handoverNotes?: string
  /** Investigation summaries carried into the referral. */
  investigations?: ReferralInvestigation[]
  /** Chronology carried into the referral. */
  timelineSummary?: string
  /** Follow-up answers carried into the referral. */
  followUpQuestionsAnswered?: ReferralFollowUpAnswer[]
  /** What is still outstanding when the referral is sent. */
  pendingInvestigations?: string[]
}

export interface TriageNote {
  structuredNote: StructuredNote
  observations: string[]
  urgencyFlags: UrgencyFlag[]
  missingInformation: MissingInfoItem[]
  followUpQuestions: FollowUpQuestion[]
  riskScore: RiskScore
  status:
    | 'ai-draft'
    | 'human-edited'
    | 'reviewed'
    | 'accepted'
    | 'finalized'
    | 'escalated'
    | 'rejected'
    | 'returned-to-intake'
  /** Language used for the analysis (P0-3). */
  language?: SupportedLanguage
  /** Aggregate extraction confidence across this note's layers (P2-14). */
  aggregateConfidence?: ConfidenceScore
  generatedAt: string
  disclaimer: string
  /* ---- P2-18 review-chain audit trail (all optional) ---- */
  /** Who reviewed (but did not necessarily accept) the draft. */
  reviewedBy?: NoteActorStamp
  /** Who accepted the draft as reviewed. */
  acceptedBy?: NoteActorStamp
  /** Who finalized the note (a medical officer). */
  finalizedBy?: NoteActorStamp
  /** Rejection record (reason required) — P2-18 item P. */
  rejection?: NoteRejection
  /** Return-to-intake record (reason required) — P2-18 item Q. */
  returnToIntake?: ReturnToIntake
  /** Active senior escalation, if any — P2-18 item R. */
  escalation?: SeniorEscalation
}

export interface PatientSession {
  id: string
  patientId: string
  language: IntakeLanguage
  ageBand: AgeBand
  sex: SexMarker
  intakePoint: IntakePoint
  /** Human-readable facility label (redacted to [FACILITY] in exports). */
  facility: string
  /** Tenant boundary (P1-10). Every scoped read/write is filtered by this. */
  facilityId: string
  /** PII-stripped narrative — this is the only text the server ever keeps. */
  displayText: string
  anonymization: AnonymizationReport
  /** Uploaded medical reports with anonymised extracted values (P0-1). */
  reports: ExtractedReport[]
  /** Captured visual inputs (P0-2) — only the PII-redacted image is kept. */
  visuals: VisualRecord[]
  note: TriageNote | null
  /** P0-4 chronology of patient-reported events (built lazily, human-editable). */
  timeline?: Timeline
  /** Worst-case + aggregate confidence across every rule-engine output (P2-14). */
  sessionConfidence?: SessionConfidence
  overrides: NoteOverride[]
  referral: ReferralNote | null
  status: 'ready' | 'accepted' | 'escalated'
  /** Authenticated user this session belongs to (what a patient account sees). */
  ownerId: string
  /** Display name of the account that created it. */
  createdBy: string
  /** Role of the account that created it. */
  createdByRole: UserRole
  createdAt: string
  updatedAt: string
  /** Set when retention, consent withdrawal or an admin erased the case (P0-6). */
  deletedAt?: string
  /** Consent record linked to this session (P0-6). */
  consentRecordId?: string
  /** Hydrated on read — the consent store stays the source of truth. */
  consentRecord?: ConsentRecord
  /** Staff account the case is assigned to for review (P1-11). */
  assignedTo?: string
  /** Display name of the assignee, stored alongside for queue display (P1-11). */
  assignedToName?: string
  /** Offline-attached report/visual metadata awaiting a bytes upload (P1-8). */
  pendingUploads?: PendingUpload[]
}

/** Metadata recorded offline for a report/visual whose bytes are still pending. */
export type PendingUploadKind = 'report' | 'visual'

export interface PendingUpload {
  id: string
  kind: PendingUploadKind
  /** Anonymised display name of the deferred file. */
  fileName: string
  mimeType: string
  /** Anonymised free-text note captured while offline. */
  note: string
  createdAt: string
  createdBy: string
}

export interface AuditEntry {
  id: string
  sessionId: string
  /** Tenant boundary of the action (P1-10). */
  facilityId: string
  actor: string
  role: UserRole
  action: string
  detail: string
  category: 'view' | 'edit' | 'decision' | 'export' | 'auth' | 'system'
  at: string
  /** Present when the action was queued offline and later synced (P1-8). */
  offlineOrigin?: boolean
  /** Client clock when the action was queued (display only). */
  queuedAt?: string
  /** Server clock when the queued action synced. */
  syncedAt?: string
}

export interface AnalyzeRequest {
  text: string
  language?: IntakeLanguage
}

export * from './report.types'
export * from './visual.types'
export * from './language.types'
export * from './timeline.types'
export * from './followup.types'
export * from './retention.types'
export * from './sync.types'
export * from './priority.types'
export * from './confidence.types'
export * from './feedback.types'
export * from './auditChain.types'
export * from './consent.types'
export * from './retentionUi.types'
export * from './richCoverage.types'
