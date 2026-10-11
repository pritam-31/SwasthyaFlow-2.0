/**
 * Strict domain model for the Human-in-the-Loop Multimodal Triage Assistant.
 *
 * Hard rules encoded by these types:
 *  - Nothing in this model may carry a diagnosis, prescription or treatment plan.
 *  - Every AI-authored field is a *draft* until a human (UserRole) accepts it.
 *  - Patient identity is always an anonymized surrogate (patientId), never a name.
 */

export type UserRole = 'patient' | 'nurse' | 'doctor' | 'admin' | 'system-admin' | 'facility-admin'

export type RiskScore = 'High' | 'Medium' | 'Low'

export type IntakeLanguage = 'English' | 'Hindi' | 'Odia'

export type AgeBand = '0-17' | '18-39' | '40-59' | '60+' | 'Unknown'

export type SexMarker = 'Female' | 'Male' | 'Other' | 'Not stated'

export type IntakePoint = 'OPD' | 'Health camp' | 'Follow-up' | 'Emergency triage'

/* ------------------------------------------------------------------ */
/*  Patient (anonymized)                                               */
/* ------------------------------------------------------------------ */

export interface PatientDemographics {
  /** Opaque surrogate identifier generated client-side. Never a real name. */
  patientId: string
  ageBand: AgeBand
  sex: SexMarker
  facility: string
  intakePoint: IntakePoint
}

/* ------------------------------------------------------------------ */
/*  Raw multimodal inputs                                              */
/* ------------------------------------------------------------------ */

export interface VoiceInput {
  blob: Blob | null
  /** Object URL for in-app playback. Never leaves the browser. */
  objectUrl: string | null
  transcript: string
  language: IntakeLanguage
  source: 'microphone' | 'file' | 'none'
}

export interface ImageInput {
  file: File | null
  objectUrl: string | null
  caption: string
  kind: 'clinical-photo' | 'report-scan'
}

export interface DocumentInput {
  file: File | null
  name: string
  extractedText: string
  ocrStatus: 'not-run' | 'processing' | 'done' | 'failed'
}

export interface RawInputs {
  text: string
  voice: VoiceInput | null
  image: ImageInput | null
  document: DocumentInput | null
  language: IntakeLanguage
}

export interface Redaction {
  category: 'name' | 'phone' | 'id-number' | 'email' | 'address' | 'date-of-birth'
  count: number
}

export interface AnonymizationReport {
  redactedCount: number
  redactions: Redaction[]
  appliedAt: string
  /** Per-language replacement counts when the authoring text was multilingual. */
  byLanguage?: Array<{ language: 'en' | 'hi' | 'or'; count: number }>
}

/* ------------------------------------------------------------------ */
/*  Structured triage note (AI draft + human edits)                    */
/* ------------------------------------------------------------------ */

export interface StructuredTriageNote {
  chiefComplaint: string
  history: string
  vitals: string
}

export type UrgencySeverity = 'red' | 'amber'

export interface UrgencyFlag {
  id: string
  /** Human-readable observation label, e.g. "Chest pain". Never a diagnosis. */
  label: string
  severity: UrgencySeverity
  reason: string
  ruleId: string
  status: 'active' | 'acknowledged' | 'cleared'
}

export interface MissingInfoItem {
  id: string
  field: string
  whyItMatters: string
}

export interface FollowUpQuestionItem {
  id: string
  question: string
  status: 'suggested' | 'asked' | 'answered' | 'skipped'
  answer?: string
}

export type NoteStatus = 'ai-draft' | 'human-edited' | 'accepted' | 'finalized' | 'escalated'

export type TimelineEvent = {
  eventId: string
  eventType: TimelineEventType
  eventText: string
  timeExpression?: string
  normalizedTime?: { kind: 'absolute' | 'relative' | 'unknown'; iso?: string; daysFromIntake?: number; hoursFromIntake?: number }
}

export type TimelineEventType = 'symptom-onset' | 'symptom-change' | 'past-medical-event' | 'current-state' | 'report' | 'visual' | 'follow-up-answer' | 'clinician-note' | 'other'

export interface TriageNote {
  structuredNote: StructuredTriageNote
  observations: string[]
  urgencyFlags: UrgencyFlag[]
  missingInformation: MissingInfoItem[]
  followUpQuestions: FollowUpQuestionItem[]
  riskScore: RiskScore
  status: NoteStatus
  generatedAt: string
  lastEditedAt: string | null
  editedBy: string | null
  disclaimer: string
  /** Analysis language (filled when known by the analysis layer). */
  language?: 'en' | 'hi' | 'or'
  /** Timeline events for the mini-bar. */
  timeline: TimelineEvent[]
  /** Whether SLA has been breached for this session. */
  slaBreached: boolean
  /** Whether the note has been through non-diagnostic re-check. */
  nonDiagnostic: boolean
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

/* ------------------------------------------------------------------ */
/*  Consent, referral, session                                         */
/* ------------------------------------------------------------------ */

export interface ConsentRecord {
  granted: boolean
  nonDiagnosticAcknowledged: boolean
  purposes: string[]
  at: string
  policyVersion: string
}

export type SessionStatus = 'processing' | 'ready' | 'accepted' | 'escalated'

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
  status: 'draft' | 'approved'
  generatedAt: string
  disclaimer: string
}

export interface PatientSession {
  id: string
  patientId: string
  demographics: PatientDemographics
  raw: RawInputs
  /** PII-stripped narrative actually handed to the AI layer and to reviewers. */
  displayText: string
  anonymization: AnonymizationReport
  triageNote: TriageNote | null
  referral: ReferralNote | null
  status: SessionStatus
  consent: ConsentRecord
  overrides: NoteOverride[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  Audit                                                              */
/* ------------------------------------------------------------------ */

export type AuditAction =
  | 'consent.granted'
  | 'session.created'
  | 'session.viewed'
  | 'note.accepted'
  | 'note.overridden'
  | 'note.finalized'
  | 'followup.asked'
  | 'followup.answered'
  | 'followup.generated'
  | 'followup.regenerated'
  | 'followup.skipped'
  | 'followup.added'
  | 'followup.edited'
  | 'followup.deleted'
  | 'followup.reordered'
  | 'session.escalated'
  | 'referral.generated'
  | 'referral.approved'
  | 'role.switched'
  | 'language.detected'
  | 'language.transliterated'
  | 'triage.analyzed'
  | 'triage.anonymized'
  | 'timeline.generated'
  | 'timeline.regenerated'
  | 'timeline.accepted'
  | 'timeline.viewed'
  | 'timeline.edited'

export type AuditCategory = 'view' | 'edit' | 'decision' | 'export' | 'auth' | 'system'

export interface AuditLogEntry {
  id: string
  sessionId: string
  actor: string
  role: UserRole
  action: AuditAction
  detail: string
  category: AuditCategory
  at: string
}
