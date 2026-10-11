export type Role = 'patient' | 'nurse' | 'doctor' | 'admin' | 'system-admin' | 'facility-admin'

export type ReviewStatus =
  | 'awaiting-nurse'
  | 'awaiting-doctor'
  | 'reviewed'
  | 'closed'

export type UrgencyLabel = 'routine' | 'prompt' | 'urgent'

export type CaseMode =
  | 'opd'
  | 'camp'
  | 'occupational'
  | 'maternal'
  | 'followup'

export type ReferralStatus =
  | 'none'
  | 'draft'
  | 'pending-approval'
  | 'approved'
  | 'closed'

export interface AuditEvent {
  id: string
  caseId: string
  time: string
  actor: string
  role: string
  action: string
}

export interface Symptom {
  id: string
  name: string
  duration?: string
  severity?: string
  onset?: string
  source: string
  status: 'ai-extracted' | 'verified' | 'needs-verification'
}

export interface TimelineEvent {
  id: string
  dayLabel: string
  text: string
  source: string
}

export interface ReportField {
  id: string
  param: string
  value: string
  unit?: string
  referenceRange?: string
  status: 'needs-verification' | 'verified' | 'ai-extracted'
}

export type ReportKind =
  | 'cbc'
  | 'xray'
  | 'blood-sugar'
  | 'urine'
  | 'scanned-doc'

export interface Report {
  id: string
  caseId: string
  name: string
  type: 'pdf' | 'image'
  kind: ReportKind
  date?: string
  ocrStatus: 'done' | 'failed' | 'low-quality'
  aiNote: string
  fields: ReportField[]
}

export interface UrgencySignal {
  id: string
  level: UrgencyLabel
  reason: string
  rule: string
  status: 'active' | 'acknowledged' | 'reviewed'
}

export interface FollowUpQuestion {
  id: string
  question: string
  status: 'suggested' | 'asked' | 'answered' | 'skipped'
  answer?: string
  answeredAt?: string
}

export interface Correction {
  id: string
  caseId: string
  field: string
  aiValue: string
  humanValue: string
  reviewer: string
  role: string
  time: string
}

export interface ChecklistItem {
  label: string
  done: boolean
}

export interface Referral {
  id: string
  caseId: string
  status: ReferralStatus
  reason: string
  targetFacility?: string
  destinationOptions: string[]
  reviewerNotes?: string
  approvedBy?: string
  approvedAt?: string
  checklist: ChecklistItem[]
}

export interface Consent {
  status: 'granted' | 'not-granted'
  at?: string
  purpose: string[]
}

export interface CaseRecord {
  id: string
  patientId: string
  language: 'English' | 'Hindi' | 'Odia'
  mode: CaseMode
  chiefConcern: string
  translatedConcern?: string
  originalTranscript?: string
  transcriptLanguage?: string
  symptoms: Symptom[]
  timeline: TimelineEvent[]
  reportedHistory: string[]
  reportedMedications: string[]
  missingInfo: string[]
  completeness: number
  followUpQuestions: FollowUpQuestion[]
  urgencySignals: UrgencySignal[]
  reviewStatus: ReviewStatus
  consent: Consent
  reportIds: string[]
  createdAt: string
  updatedAt: string
  reporter: string
  corrections: Correction[]
  referral: Referral | null
}

export interface CampRecord {
  id: string
  campName: string
  date: string
  location: string
  screened: number
  pendingReview: number
  reviewed: number
  referred: number
  language: 'English' | 'Hindi' | 'Odia'
}

export interface AnalyticRow {
  metric: string
  english: number
  hindi: number
  odia: number
}

export interface FacilitySettings {
  facilityName: string
  facilityType: string
  state: string
  languages: string[]
  retentionHours: number
  waitingThresholdMins: number
  urgencyKeywords: string[]
  aiProvider: string
  offlineMode: boolean
}