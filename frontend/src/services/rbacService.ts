/**
 * Role-Based Access Control.
 *
 * Single source of truth for what each role may do in the reviewer workflow.
 * The backend enforces the same matrix server-side (see backend/src/routes) —
 * this copy only decides what the UI offers.
 *
 * One rule is absolute and encoded as a literal type so no role can ever gain
 * it: prescribing. This product is non-diagnostic by design.
 */

import type { UserRole } from '../types/triage'
import type { QueueActionType } from '../types/sync.types'

export interface Permissions {
  /** Edit the AI-prepared structured note (human-in-the-loop override). */
  canEditNote: boolean
  /** Accept the AI draft as reviewed. */
  canAcceptNote: boolean
  /** Mark the note final for this facility (doctor or admin). */
  canFinalizeNote: boolean
  /** Raise an escalation / draft a referral note. */
  canDraftReferral: boolean
  /** Approve and release a referral to a higher-level facility (doctor or admin). */
  canApproveReferral: boolean
  /** Read the audit trail. */
  canViewAudit: boolean
  /** Manage user accounts and roles (admin). */
  canManageUsers: boolean
  /** Manage users within one's own facility (facility-admin / system-admin). */
  canManageOwnFacilityUsers: boolean
  /** Manage users across every facility (system-admin only). */
  canManageAllUsers: boolean
  /** Create / edit / suspend / archive facilities (system-admin; facility-admin may edit own). */
  canManageFacilities: boolean
  /** Create a new facility (system-admin only). */
  canCreateFacility: boolean
  /** Suspend a facility (system-admin only). */
  canSuspendFacility: boolean
  /** Archive a facility (system-admin only; terminal). */
  canArchiveFacility: boolean
  /** Delete a facility (system-admin only; never the default). */
  canDeleteFacility: boolean
  /** Switch the facility in scope (system-admin only). */
  canSwitchFacility: boolean
  /** View every facility, not just one's own (system-admin only). */
  canViewAllFacilities: boolean
  /** Override a facility's retention beyond the global bounds (system-admin only). */
  canOverrideRetentionBounds: boolean
  /** Upload medical report files to a session (any role; patients only on their own session). */
  canUploadReports: boolean
  /** Verify / reject / delete extracted reports — doctor or admin only. */
  canReviewReports: boolean
  /** Upload photos to a session (any role; patients only on their own session). */
  canUploadVisuals: boolean
  /** Verify / reject / delete photos — doctor or admin only. */
  canReviewVisuals: boolean
  /** View a session's redacted photos (any authenticated role; own session for patients). */
  canViewVisuals: boolean
  /** Build / regenerate the AI-drafted timeline — clinical staff only. */
  canBuildTimeline: boolean
  /** Add, edit or delete timeline events (human-in-the-loop) — clinical staff only. */
  canEditTimeline: boolean
  /** Accept the timeline draft as reviewed — clinical staff only. */
  canAcceptTimeline: boolean
  /** Generate / regenerate the AI follow-up suggestions — clinical staff only. */
  canGenerateFollowUps: boolean
  /** Put a suggested question to the patient / team — clinical staff only. */
  canAskFollowUp: boolean
  /** Record the patient's answer (verbatim, anonymised) — clinical staff only. */
  canAnswerFollowUp: boolean
  /** Edit wording / routing / priority of a suggested question — clinical staff only. */
  canEditFollowUps: boolean
  /** Add a clinician-authored question — clinical staff only. */
  canAddClinicianFollowUp: boolean
  /** Delete a follow-up question — reviewed doctors / admins only. */
  canDeleteFollowUps: boolean
  /** Read the facility retention policy — doctors / admins. */
  canViewRetentionPolicy: boolean
  /** Edit retention rules (days / enabled) — admin only. */
  canEditRetentionPolicy: boolean
  /** Run a retention sweep now — admin only. */
  canRunRetentionJob: boolean
  /** Push a case's retention out — admin only. */
  canExtendRetention: boolean
  /** Read the retention action history — doctors / admins. */
  canViewRetentionActions: boolean
  /** Build a portable copy of a case — doctors / admins. */
  canExportData: boolean
  /** Manually erase a case — doctors / admins. */
  canDeleteData: boolean
  /** Withdraw consent — any role (patients only on their own case). */
  canRevokeConsent: boolean
  /** Preview PII redaction of free text — any authenticated role. */
  canPreviewAnonymisation: boolean
  /** Run a modality / image through the anonymisation pipeline — doctors / admins. */
  canRunAnonymisation: boolean
  /** Read stored anonymisation reports + per-case coverage — doctors / admins. */
  canViewAnonymisationReport: boolean
  /** Submit a reviewer verdict on a detected match — doctors / admins. */
  canSubmitAnonymisationFeedback: boolean
  /** Read facility-wide anonymisation metrics — admin only. */
  canViewAnonymisationMetrics: boolean
  /** Run the synthetic PII leak corpus — admin only. */
  canRunLeakTest: boolean
  /** Read the pattern inventory (counts only) — admin only. */
  canViewPatternInventory: boolean
  /** Read the review queue + its transparent priority scores. */
  canViewQueue: boolean
  /** Read the queue summary (band counts / SLA breaches). */
  canViewQueueSummary: boolean
  /** Materially override a case's priority score (doctor only). */
  canOverridePriority: boolean
  /** Clear an existing score/band override. */
  canClearPriorityOverride: boolean
  /** Pin a case to the top of the queue (doctor / facility-admin). */
  canPinCase: boolean
  /** Sink a case to the bottom of the queue (doctor / facility-admin). */
  canDeprioritiseCase: boolean
  /** Mark a case reviewed without changing its score. */
  canMarkReviewed: boolean
  /** Assign a case to a staff member in the same facility. */
  canAssignCase: boolean
  /** Unassign a case. */
  canUnassignCase: boolean
  /** Force a queue recompute — doctor / facility-admin. */
  canRecomputeQueue: boolean
  /** Edit the per-facility SLA wait-time thresholds — admin only. */
  canEditSlaConfig: boolean
  /** Read a case's confidence scores + explanations — clinical staff. */
  canViewConfidence: boolean
  /** Record a human verdict on a low-confidence item — clinical staff. */
  canReviewConfidence: boolean
  /** Force a confidence recompute for a case — clinical staff. */
  canRecomputeConfidence: boolean
  /** Read the per-facility confidence thresholds — admin. */
  canViewConfidencePolicy: boolean
  /** Edit the per-facility confidence thresholds — admin. */
  canEditConfidencePolicy: boolean
  /** Submit / read a case's clinician feedback — clinical staff. */
  canViewFeedback: boolean
  /** Record a clinician feedback verdict — clinical staff. */
  canSubmitFeedback: boolean
  /** Edit or withdraw anyone's feedback (facility-admin / system-admin). */
  canManageFeedback: boolean
  /** Read the facility feedback dashboard + aggregate — admin. */
  canViewFeedbackDashboard: boolean
  /** Build a portable feedback export — admin. */
  canExportFeedback: boolean
  /** Free-text search the facility audit trail — clinical staff. */
  canSearchAudit: boolean
  /** Recompute + verify the per-facility audit hash chain — facility-admin. */
  canVerifyAuditChain: boolean
  /** Read the audit chain head metadata (head hash / sequence) — facility-admin. */
  canViewChainMeta: boolean
  /** Build a retention-aware audit export — facility-admin. */
  canExportAudit: boolean
  /** Withdraw own consent — patients only (patient-owned, never automatic). */
  canWithdrawConsent: boolean
  /** Re-grant a withdrawn consent — patients only. */
  canReGrantConsent: boolean
  /** Upgrade a case's consent to the current policy version — patients only. */
  canUpgradeConsentVersion: boolean
  /** Read a case's consent history — any role (patients only on their own case). */
  canViewConsentHistory: boolean
  /** Read facility-wide consent coverage — facility-admin. */
  canViewConsentCoverage: boolean
  /** Read a case's data inventory — clinical staff (patients only on their own case). */
  canViewSessionInventory: boolean
  /** Read the facility's pending deletions — facility-admin. */
  canViewPendingDeletions: boolean
  /** Read a case's merged retention timeline — clinical staff (own case for patients). */
  canViewRetentionTimeline: boolean
  /** Read the facility retention SLA view — facility-admin. */
  canViewRetentionSla: boolean
  /** Read the facility vs global retention policy diff — facility-admin. */
  canViewPolicyDiff: boolean
  /** Run a bulk retention action across cases — facility-admin. */
  canRunBulkRetention: boolean
  /** Chain-preserving audit prune — system-admin only. */
  canPruneAudit: boolean
  /** Download a stored retention export — doctor / admin. */
  canDownloadRetentionExport: boolean
  /** Change own password (any signed-in account). */
  canChangePassword: boolean
  /** Enrol / disable a personal TOTP authenticator (any signed-in account). */
  canManageTwoFactor: boolean
  /** View own active sessions + devices (any signed-in account). */
  canViewOwnSessions: boolean
  /** View the effective security policy / events / lockouts / ip-blocklist. */
  canViewSecurityAdmin: boolean
  /** Edit the facility security policy and clear lockouts / blocklist entries. */
  canEditSecurityPolicy: boolean
  /** Read model cards + their failure modes (any signed-in account). */
  canViewModelCard: boolean
  /** Update a model card — version-gated, system-admin / admin. */
  canEditModelCard: boolean
  /** Read the failure-mode catalogue (any signed-in account). */
  canViewFailureModes: boolean
  /** Add / edit / delete failure modes — system-admin / admin. */
  canEditFailureModes: boolean
  /** Read bias reports + the run ledger — system-admin / admin. */
  canViewBiasReports: boolean
  /** Run the bias evaluation — system-admin / admin. */
  canRunBiasEvaluation: boolean
  /** Delete a stored bias report — system-admin / admin. */
  canDeleteBiasReports: boolean
  /** Read the dataset manifest — system-admin / admin. */
  canViewDatasetManifest: boolean
  /** Hard-coded false for every role — this system never prescribes. */
  readonly canPrescribe: false
}

/** The P1-11 queue capabilities layered on top of the base matrix below. */
type QueuePermissionKey =
  | 'canViewQueue'
  | 'canViewQueueSummary'
  | 'canOverridePriority'
  | 'canClearPriorityOverride'
  | 'canPinCase'
  | 'canDeprioritiseCase'
  | 'canMarkReviewed'
  | 'canAssignCase'
  | 'canUnassignCase'
  | 'canRecomputeQueue'
  | 'canEditSlaConfig'

/** The P2-13 model-card / bias capabilities layered on top of the base matrix. */
type ModelCardPermissionKey =
  | 'canViewModelCard'
  | 'canEditModelCard'
  | 'canViewFailureModes'
  | 'canEditFailureModes'
  | 'canViewBiasReports'
  | 'canRunBiasEvaluation'
  | 'canDeleteBiasReports'
  | 'canViewDatasetManifest'

/** The P2-14 confidence capabilities layered on top of the base matrix. */
type ConfidencePermissionKey =
  | 'canViewConfidence'
  | 'canReviewConfidence'
  | 'canRecomputeConfidence'
  | 'canViewConfidencePolicy'
  | 'canEditConfidencePolicy'

/** The P2-15 clinician feedback capabilities layered on top of the base matrix. */
type FeedbackPermissionKey =
  | 'canViewFeedback'
  | 'canSubmitFeedback'
  | 'canManageFeedback'
  | 'canViewFeedbackDashboard'
  | 'canExportFeedback'

/** The P2-16 audit immutability + export capabilities layered on top. */
type AuditPermissionKey =
  | 'canVerifyAuditChain'
  | 'canExportAudit'
  | 'canViewChainMeta'
  | 'canSearchAudit'

/** The P2-17 consent-withdrawal + data-privacy console capabilities. */
type RetentionUiPermissionKey =
  | 'canWithdrawConsent'
  | 'canReGrantConsent'
  | 'canUpgradeConsentVersion'
  | 'canViewConsentHistory'
  | 'canViewConsentCoverage'
  | 'canViewSessionInventory'
  | 'canViewPendingDeletions'
  | 'canViewRetentionTimeline'
  | 'canViewRetentionSla'
  | 'canViewPolicyDiff'
  | 'canRunBulkRetention'
  | 'canPruneAudit'
  | 'canDownloadRetentionExport'

const BASE_PERMISSIONS: Record<
  UserRole,
  Omit<
    Permissions,
    | QueuePermissionKey
    | ModelCardPermissionKey
    | ConfidencePermissionKey
    | FeedbackPermissionKey
    | AuditPermissionKey
    | RetentionUiPermissionKey
  >
> = {
  patient: {
    canEditNote: false,
    canAcceptNote: false,
    canFinalizeNote: false,
    canDraftReferral: false,
    canApproveReferral: false,
    canViewAudit: false,
    canManageUsers: false,
    canManageOwnFacilityUsers: false,
    canManageAllUsers: false,
    canManageFacilities: false,
    canCreateFacility: false,
    canSuspendFacility: false,
    canArchiveFacility: false,
    canDeleteFacility: false,
    canSwitchFacility: false,
    canViewAllFacilities: false,
    canOverrideRetentionBounds: false,
    canUploadReports: true,
    canReviewReports: false,
    canUploadVisuals: true,
    canReviewVisuals: false,
    canViewVisuals: true,
    canBuildTimeline: false,
    canEditTimeline: false,
    canAcceptTimeline: false,
    canGenerateFollowUps: false,
    canAskFollowUp: false,
    canAnswerFollowUp: false,
    canEditFollowUps: false,
    canAddClinicianFollowUp: false,
    canDeleteFollowUps: false,
    canViewRetentionPolicy: false,
    canEditRetentionPolicy: false,
    canRunRetentionJob: false,
    canExtendRetention: false,
    canViewRetentionActions: false,
    canExportData: false,
    canDeleteData: false,
    canRevokeConsent: true,
    canPreviewAnonymisation: true,
    canRunAnonymisation: false,
    canViewAnonymisationReport: false,
    canSubmitAnonymisationFeedback: false,
    canViewAnonymisationMetrics: false,
    canRunLeakTest: false,
    canViewPatternInventory: false,
    canChangePassword: true,
    canManageTwoFactor: true,
    canViewOwnSessions: true,
    canViewSecurityAdmin: false,
    canEditSecurityPolicy: false,
    canPrescribe: false,
  },
  nurse: {
    canEditNote: true,
    canAcceptNote: true,
    canFinalizeNote: false,
    canDraftReferral: true,
    canApproveReferral: false,
    canViewAudit: true,
    canManageUsers: false,
    canManageOwnFacilityUsers: false,
    canManageAllUsers: false,
    canManageFacilities: false,
    canCreateFacility: false,
    canSuspendFacility: false,
    canArchiveFacility: false,
    canDeleteFacility: false,
    canSwitchFacility: false,
    canViewAllFacilities: false,
    canOverrideRetentionBounds: false,
    canUploadReports: true,
    canReviewReports: false,
    canUploadVisuals: true,
    canReviewVisuals: false,
    canViewVisuals: true,
    canBuildTimeline: true,
    canEditTimeline: true,
    canAcceptTimeline: true,
    canGenerateFollowUps: true,
    canAskFollowUp: true,
    canAnswerFollowUp: true,
    canEditFollowUps: true,
    canAddClinicianFollowUp: true,
    canDeleteFollowUps: false,
    canViewRetentionPolicy: false,
    canEditRetentionPolicy: false,
    canRunRetentionJob: false,
    canExtendRetention: false,
    canViewRetentionActions: false,
    canExportData: false,
    canDeleteData: false,
    canRevokeConsent: true,
    canPreviewAnonymisation: true,
    canRunAnonymisation: false,
    canViewAnonymisationReport: false,
    canSubmitAnonymisationFeedback: false,
    canViewAnonymisationMetrics: false,
    canRunLeakTest: false,
    canViewPatternInventory: false,
    canChangePassword: true,
    canManageTwoFactor: true,
    canViewOwnSessions: true,
    canViewSecurityAdmin: false,
    canEditSecurityPolicy: false,
    canPrescribe: false,
  },
  doctor: {
    canEditNote: true,
    canAcceptNote: true,
    canFinalizeNote: true,
    canDraftReferral: true,
    canApproveReferral: true,
    canViewAudit: true,
    canManageUsers: false,
    canManageOwnFacilityUsers: false,
    canManageAllUsers: false,
    canManageFacilities: false,
    canCreateFacility: false,
    canSuspendFacility: false,
    canArchiveFacility: false,
    canDeleteFacility: false,
    canSwitchFacility: false,
    canViewAllFacilities: false,
    canOverrideRetentionBounds: false,
    canUploadReports: true,
    canReviewReports: true,
    canUploadVisuals: true,
    canReviewVisuals: true,
    canViewVisuals: true,
    canBuildTimeline: true,
    canEditTimeline: true,
    canAcceptTimeline: true,
    canGenerateFollowUps: true,
    canAskFollowUp: true,
    canAnswerFollowUp: true,
    canEditFollowUps: true,
    canAddClinicianFollowUp: true,
    canDeleteFollowUps: true,
    canViewRetentionPolicy: true,
    canEditRetentionPolicy: false,
    canRunRetentionJob: false,
    canExtendRetention: false,
    canViewRetentionActions: true,
    canExportData: true,
    canDeleteData: true,
    canRevokeConsent: true,
    canPreviewAnonymisation: true,
    canRunAnonymisation: true,
    canViewAnonymisationReport: true,
    canSubmitAnonymisationFeedback: true,
    canViewAnonymisationMetrics: false,
    canRunLeakTest: false,
    canViewPatternInventory: false,
    canChangePassword: true,
    canManageTwoFactor: true,
    canViewOwnSessions: true,
    canViewSecurityAdmin: false,
    canEditSecurityPolicy: false,
    canPrescribe: false,
  },
  admin: {
    canEditNote: true,
    canAcceptNote: true,
    canFinalizeNote: true,
    canDraftReferral: true,
    canApproveReferral: true,
    canViewAudit: true,
    canManageUsers: true,
    canManageOwnFacilityUsers: true,
    canManageAllUsers: true,
    canManageFacilities: true,
    canCreateFacility: true,
    canSuspendFacility: true,
    canArchiveFacility: true,
    canDeleteFacility: true,
    canSwitchFacility: true,
    canViewAllFacilities: true,
    canOverrideRetentionBounds: true,
    canUploadReports: true,
    canReviewReports: true,
    canUploadVisuals: true,
    canReviewVisuals: true,
    canViewVisuals: true,
    canBuildTimeline: true,
    canEditTimeline: true,
    canAcceptTimeline: true,
    canGenerateFollowUps: true,
    canAskFollowUp: true,
    canAnswerFollowUp: true,
    canEditFollowUps: true,
    canAddClinicianFollowUp: true,
    canDeleteFollowUps: true,
    canViewRetentionPolicy: true,
    canEditRetentionPolicy: true,
    canRunRetentionJob: true,
    canExtendRetention: true,
    canViewRetentionActions: true,
    canExportData: true,
    canDeleteData: true,
    canRevokeConsent: true,
    canPreviewAnonymisation: true,
    canRunAnonymisation: true,
    canViewAnonymisationReport: true,
    canSubmitAnonymisationFeedback: true,
    canViewAnonymisationMetrics: true,
    canRunLeakTest: true,
    canViewPatternInventory: true,
    canChangePassword: true,
    canManageTwoFactor: true,
    canViewOwnSessions: true,
    canViewSecurityAdmin: true,
    canEditSecurityPolicy: true,
    canPrescribe: false,
  },
  'system-admin': {
    canEditNote: true,
    canAcceptNote: true,
    canFinalizeNote: true,
    canDraftReferral: true,
    canApproveReferral: true,
    canViewAudit: true,
    canManageUsers: true,
    canManageOwnFacilityUsers: true,
    canManageAllUsers: true,
    canManageFacilities: true,
    canCreateFacility: true,
    canSuspendFacility: true,
    canArchiveFacility: true,
    canDeleteFacility: true,
    canSwitchFacility: true,
    canViewAllFacilities: true,
    canOverrideRetentionBounds: true,
    canUploadReports: true,
    canReviewReports: true,
    canUploadVisuals: true,
    canReviewVisuals: true,
    canViewVisuals: true,
    canBuildTimeline: true,
    canEditTimeline: true,
    canAcceptTimeline: true,
    canGenerateFollowUps: true,
    canAskFollowUp: true,
    canAnswerFollowUp: true,
    canEditFollowUps: true,
    canAddClinicianFollowUp: true,
    canDeleteFollowUps: true,
    canViewRetentionPolicy: true,
    canEditRetentionPolicy: true,
    canRunRetentionJob: true,
    canExtendRetention: true,
    canViewRetentionActions: true,
    canExportData: true,
    canDeleteData: true,
    canRevokeConsent: true,
    canPreviewAnonymisation: true,
    canRunAnonymisation: true,
    canViewAnonymisationReport: true,
    canSubmitAnonymisationFeedback: true,
    canViewAnonymisationMetrics: true,
    canRunLeakTest: true,
    canViewPatternInventory: true,
    canChangePassword: true,
    canManageTwoFactor: true,
    canViewOwnSessions: true,
    canViewSecurityAdmin: true,
    canEditSecurityPolicy: true,
    canPrescribe: false,
  },
  'facility-admin': {
    canEditNote: true,
    canAcceptNote: true,
    canFinalizeNote: true,
    canDraftReferral: true,
    canApproveReferral: true,
    canViewAudit: true,
    canManageUsers: true,
    canManageOwnFacilityUsers: true,
    canManageAllUsers: false,
    canManageFacilities: true,
    canCreateFacility: false,
    canSuspendFacility: false,
    canArchiveFacility: false,
    canDeleteFacility: false,
    canSwitchFacility: false,
    canViewAllFacilities: false,
    canOverrideRetentionBounds: false,
    canUploadReports: true,
    canReviewReports: true,
    canUploadVisuals: true,
    canReviewVisuals: true,
    canViewVisuals: true,
    canBuildTimeline: true,
    canEditTimeline: true,
    canAcceptTimeline: true,
    canGenerateFollowUps: true,
    canAskFollowUp: true,
    canAnswerFollowUp: true,
    canEditFollowUps: true,
    canAddClinicianFollowUp: true,
    canDeleteFollowUps: true,
    canViewRetentionPolicy: true,
    canEditRetentionPolicy: true,
    canRunRetentionJob: true,
    canExtendRetention: true,
    canViewRetentionActions: true,
    canExportData: true,
    canDeleteData: true,
    canRevokeConsent: true,
    canPreviewAnonymisation: true,
    canRunAnonymisation: true,
    canViewAnonymisationReport: true,
    canSubmitAnonymisationFeedback: true,
    canViewAnonymisationMetrics: false,
    canRunLeakTest: false,
    canViewPatternInventory: false,
    canChangePassword: true,
    canManageTwoFactor: true,
    canViewOwnSessions: true,
    canViewSecurityAdmin: true,
    canEditSecurityPolicy: true,
    canPrescribe: false,
  },
}

/** P1-11 queue capabilities per role — mirrors the backend queue route guards. */
const QUEUE_PERMISSIONS: Record<UserRole, Pick<Permissions, QueuePermissionKey>> = {
  patient: {
    canViewQueue: false,
    canViewQueueSummary: false,
    canOverridePriority: false,
    canClearPriorityOverride: false,
    canPinCase: false,
    canDeprioritiseCase: false,
    canMarkReviewed: false,
    canAssignCase: false,
    canUnassignCase: false,
    canRecomputeQueue: false,
    canEditSlaConfig: false,
  },
  nurse: {
    canViewQueue: true,
    canViewQueueSummary: true,
    canOverridePriority: false,
    canClearPriorityOverride: false,
    canPinCase: false,
    canDeprioritiseCase: false,
    canMarkReviewed: true,
    canAssignCase: true,
    canUnassignCase: true,
    canRecomputeQueue: false,
    canEditSlaConfig: false,
  },
  doctor: {
    canViewQueue: true,
    canViewQueueSummary: true,
    canOverridePriority: true,
    canClearPriorityOverride: true,
    canPinCase: true,
    canDeprioritiseCase: true,
    canMarkReviewed: true,
    canAssignCase: true,
    canUnassignCase: true,
    canRecomputeQueue: true,
    canEditSlaConfig: false,
  },
  admin: {
    canViewQueue: true,
    canViewQueueSummary: true,
    canOverridePriority: true,
    canClearPriorityOverride: true,
    canPinCase: true,
    canDeprioritiseCase: true,
    canMarkReviewed: true,
    canAssignCase: true,
    canUnassignCase: true,
    canRecomputeQueue: true,
    canEditSlaConfig: true,
  },
  'system-admin': {
    canViewQueue: true,
    canViewQueueSummary: true,
    canOverridePriority: true,
    canClearPriorityOverride: true,
    canPinCase: true,
    canDeprioritiseCase: true,
    canMarkReviewed: true,
    canAssignCase: true,
    canUnassignCase: true,
    canRecomputeQueue: true,
    canEditSlaConfig: true,
  },
  'facility-admin': {
    canViewQueue: true,
    canViewQueueSummary: true,
    canOverridePriority: false,
    canClearPriorityOverride: false,
    canPinCase: true,
    canDeprioritiseCase: true,
    canMarkReviewed: true,
    canAssignCase: true,
    canUnassignCase: true,
    canRecomputeQueue: true,
    canEditSlaConfig: true,
  },
}

/**
 * P2-13 model-card / bias capabilities per role — mirrors the backend guards.
 * Read access is open to any signed-in user; editing a card, editing failure
 * modes and the whole bias console are gated by `requireRole('system-admin')`,
 * which the backend satisfies for both `system-admin` and the legacy `admin`.
 */
const MODELCARD_PERMISSIONS: Record<UserRole, Pick<Permissions, ModelCardPermissionKey>> = {
  patient: {
    canViewModelCard: true,
    canEditModelCard: false,
    canViewFailureModes: true,
    canEditFailureModes: false,
    canViewBiasReports: false,
    canRunBiasEvaluation: false,
    canDeleteBiasReports: false,
    canViewDatasetManifest: false,
  },
  nurse: {
    canViewModelCard: true,
    canEditModelCard: false,
    canViewFailureModes: true,
    canEditFailureModes: false,
    canViewBiasReports: false,
    canRunBiasEvaluation: false,
    canDeleteBiasReports: false,
    canViewDatasetManifest: false,
  },
  doctor: {
    canViewModelCard: true,
    canEditModelCard: false,
    canViewFailureModes: true,
    canEditFailureModes: false,
    canViewBiasReports: false,
    canRunBiasEvaluation: false,
    canDeleteBiasReports: false,
    canViewDatasetManifest: false,
  },
  admin: {
    canViewModelCard: true,
    canEditModelCard: true,
    canViewFailureModes: true,
    canEditFailureModes: true,
    canViewBiasReports: true,
    canRunBiasEvaluation: true,
    canDeleteBiasReports: true,
    canViewDatasetManifest: true,
  },
  'system-admin': {
    canViewModelCard: true,
    canEditModelCard: true,
    canViewFailureModes: true,
    canEditFailureModes: true,
    canViewBiasReports: true,
    canRunBiasEvaluation: true,
    canDeleteBiasReports: true,
    canViewDatasetManifest: true,
  },
  'facility-admin': {
    canViewModelCard: true,
    canEditModelCard: false,
    canViewFailureModes: true,
    canEditFailureModes: false,
    canViewBiasReports: false,
    canRunBiasEvaluation: false,
    canDeleteBiasReports: false,
    canViewDatasetManifest: false,
  },
}

/**
 * P2-14 confidence capabilities per role — mirrors the backend guards.
 * Clinical staff (nurse / doctor / facility-admin) may read a case's confidence,
 * record HITL verdicts and force a recompute. The policy read/write routes are
 * gated by `requireRole('facility-admin')`, which the backend also satisfies for
 * `admin` and `system-admin` (system admins bypass every role guard).
 */
const CONFIDENCE_PERMISSIONS: Record<UserRole, Pick<Permissions, ConfidencePermissionKey>> = {
  patient: {
    canViewConfidence: false,
    canReviewConfidence: false,
    canRecomputeConfidence: false,
    canViewConfidencePolicy: false,
    canEditConfidencePolicy: false,
  },
  nurse: {
    canViewConfidence: true,
    canReviewConfidence: true,
    canRecomputeConfidence: true,
    canViewConfidencePolicy: false,
    canEditConfidencePolicy: false,
  },
  doctor: {
    canViewConfidence: true,
    canReviewConfidence: true,
    canRecomputeConfidence: true,
    canViewConfidencePolicy: false,
    canEditConfidencePolicy: false,
  },
  admin: {
    canViewConfidence: true,
    canReviewConfidence: true,
    canRecomputeConfidence: true,
    canViewConfidencePolicy: true,
    canEditConfidencePolicy: true,
  },
  'system-admin': {
    canViewConfidence: true,
    canReviewConfidence: true,
    canRecomputeConfidence: true,
    canViewConfidencePolicy: true,
    canEditConfidencePolicy: true,
  },
  'facility-admin': {
    canViewConfidence: true,
    canReviewConfidence: true,
    canRecomputeConfidence: true,
    canViewConfidencePolicy: true,
    canEditConfidencePolicy: true,
  },
}

/**
 * P2-15 clinician feedback capabilities per role — mirrors the backend guards.
 * Clinical staff (nurse / doctor / facility-admin) read a case's feedback and
 * record verdicts. Editing/withdrawing someone else's feedback and the
 * dashboard / aggregate / export are gated by `requireRole('facility-admin')`,
 * which the backend also satisfies for `admin` and `system-admin`.
 */
const FEEDBACK_PERMISSIONS: Record<UserRole, Pick<Permissions, FeedbackPermissionKey>> = {
  patient: {
    canViewFeedback: false,
    canSubmitFeedback: false,
    canManageFeedback: false,
    canViewFeedbackDashboard: false,
    canExportFeedback: false,
  },
  nurse: {
    canViewFeedback: true,
    canSubmitFeedback: true,
    canManageFeedback: false,
    canViewFeedbackDashboard: false,
    canExportFeedback: false,
  },
  doctor: {
    canViewFeedback: true,
    canSubmitFeedback: true,
    canManageFeedback: false,
    canViewFeedbackDashboard: false,
    canExportFeedback: false,
  },
  admin: {
    canViewFeedback: true,
    canSubmitFeedback: true,
    canManageFeedback: true,
    canViewFeedbackDashboard: true,
    canExportFeedback: true,
  },
  'system-admin': {
    canViewFeedback: true,
    canSubmitFeedback: true,
    canManageFeedback: true,
    canViewFeedbackDashboard: true,
    canExportFeedback: true,
  },
  'facility-admin': {
    canViewFeedback: true,
    canSubmitFeedback: true,
    canManageFeedback: true,
    canViewFeedbackDashboard: true,
    canExportFeedback: true,
  },
}

/**
 * P2-16 audit immutability + export capabilities per role — mirrors the
 * backend guards. Verification, chain metadata and export are gated by
 * `requireRole('facility-admin')` (satisfied for `admin`/`system-admin` too);
 * paged/search reads are open to clinical staff (nurse / doctor / admin).
 */
const AUDIT_PERMISSIONS: Record<UserRole, Pick<Permissions, AuditPermissionKey>> = {
  patient: {
    canVerifyAuditChain: false,
    canExportAudit: false,
    canViewChainMeta: false,
    canSearchAudit: false,
  },
  nurse: {
    canVerifyAuditChain: false,
    canExportAudit: false,
    canViewChainMeta: false,
    canSearchAudit: true,
  },
  doctor: {
    canVerifyAuditChain: false,
    canExportAudit: false,
    canViewChainMeta: false,
    canSearchAudit: true,
  },
  admin: {
    canVerifyAuditChain: true,
    canExportAudit: true,
    canViewChainMeta: true,
    canSearchAudit: true,
  },
  'system-admin': {
    canVerifyAuditChain: true,
    canExportAudit: true,
    canViewChainMeta: true,
    canSearchAudit: true,
  },
  'facility-admin': {
    canVerifyAuditChain: true,
    canExportAudit: true,
    canViewChainMeta: true,
    canSearchAudit: true,
  },
}

/**
 * P2-17 consent-withdrawal + data-privacy console capabilities per role —
 * mirrors the backend guards. Withdrawal / re-grant / version upgrade are
 * patient-owned (never any other role). The console projections (coverage,
 * pending, SLA, policy diff, bulk) are gated by `requireRole('facility-admin')`;
 * audit pruning is system-admin only; export download is doctor / admin.
 */
const RETENTION_UI_PERMISSIONS: Record<UserRole, Pick<Permissions, RetentionUiPermissionKey>> = {
  patient: {
    canWithdrawConsent: true,
    canReGrantConsent: true,
    canUpgradeConsentVersion: true,
    canViewConsentHistory: true,
    canViewConsentCoverage: false,
    canViewSessionInventory: true,
    canViewPendingDeletions: false,
    canViewRetentionTimeline: true,
    canViewRetentionSla: false,
    canViewPolicyDiff: false,
    canRunBulkRetention: false,
    canPruneAudit: false,
    canDownloadRetentionExport: false,
  },
  nurse: {
    canWithdrawConsent: false,
    canReGrantConsent: false,
    canUpgradeConsentVersion: false,
    canViewConsentHistory: true,
    canViewConsentCoverage: false,
    canViewSessionInventory: true,
    canViewPendingDeletions: false,
    canViewRetentionTimeline: true,
    canViewRetentionSla: false,
    canViewPolicyDiff: false,
    canRunBulkRetention: false,
    canPruneAudit: false,
    canDownloadRetentionExport: false,
  },
  doctor: {
    canWithdrawConsent: false,
    canReGrantConsent: false,
    canUpgradeConsentVersion: false,
    canViewConsentHistory: true,
    canViewConsentCoverage: false,
    canViewSessionInventory: true,
    canViewPendingDeletions: false,
    canViewRetentionTimeline: true,
    canViewRetentionSla: false,
    canViewPolicyDiff: false,
    canRunBulkRetention: false,
    canPruneAudit: false,
    canDownloadRetentionExport: true,
  },
  admin: {
    canWithdrawConsent: false,
    canReGrantConsent: false,
    canUpgradeConsentVersion: false,
    canViewConsentHistory: true,
    canViewConsentCoverage: true,
    canViewSessionInventory: true,
    canViewPendingDeletions: true,
    canViewRetentionTimeline: true,
    canViewRetentionSla: true,
    canViewPolicyDiff: true,
    canRunBulkRetention: true,
    canPruneAudit: true,
    canDownloadRetentionExport: true,
  },
  'system-admin': {
    canWithdrawConsent: false,
    canReGrantConsent: false,
    canUpgradeConsentVersion: false,
    canViewConsentHistory: true,
    canViewConsentCoverage: true,
    canViewSessionInventory: true,
    canViewPendingDeletions: true,
    canViewRetentionTimeline: true,
    canViewRetentionSla: true,
    canViewPolicyDiff: true,
    canRunBulkRetention: true,
    canPruneAudit: true,
    canDownloadRetentionExport: true,
  },
  'facility-admin': {
    canWithdrawConsent: false,
    canReGrantConsent: false,
    canUpgradeConsentVersion: false,
    canViewConsentHistory: true,
    canViewConsentCoverage: true,
    canViewSessionInventory: true,
    canViewPendingDeletions: true,
    canViewRetentionTimeline: true,
    canViewRetentionSla: true,
    canViewPolicyDiff: true,
    canRunBulkRetention: true,
    canPruneAudit: false,
    canDownloadRetentionExport: true,
  },
}

export const PERMISSIONS: Record<UserRole, Permissions> = {
  patient: {
    ...BASE_PERMISSIONS.patient,
    ...QUEUE_PERMISSIONS.patient,
    ...MODELCARD_PERMISSIONS.patient,
    ...CONFIDENCE_PERMISSIONS.patient,
    ...FEEDBACK_PERMISSIONS.patient,
    ...AUDIT_PERMISSIONS.patient,
    ...RETENTION_UI_PERMISSIONS.patient,
  },
  nurse: {
    ...BASE_PERMISSIONS.nurse,
    ...QUEUE_PERMISSIONS.nurse,
    ...MODELCARD_PERMISSIONS.nurse,
    ...CONFIDENCE_PERMISSIONS.nurse,
    ...FEEDBACK_PERMISSIONS.nurse,
    ...AUDIT_PERMISSIONS.nurse,
    ...RETENTION_UI_PERMISSIONS.nurse,
  },
  doctor: {
    ...BASE_PERMISSIONS.doctor,
    ...QUEUE_PERMISSIONS.doctor,
    ...MODELCARD_PERMISSIONS.doctor,
    ...CONFIDENCE_PERMISSIONS.doctor,
    ...FEEDBACK_PERMISSIONS.doctor,
    ...AUDIT_PERMISSIONS.doctor,
    ...RETENTION_UI_PERMISSIONS.doctor,
  },
  admin: {
    ...BASE_PERMISSIONS.admin,
    ...QUEUE_PERMISSIONS.admin,
    ...MODELCARD_PERMISSIONS.admin,
    ...CONFIDENCE_PERMISSIONS.admin,
    ...FEEDBACK_PERMISSIONS.admin,
    ...AUDIT_PERMISSIONS.admin,
    ...RETENTION_UI_PERMISSIONS.admin,
  },
  'system-admin': {
    ...BASE_PERMISSIONS['system-admin'],
    ...QUEUE_PERMISSIONS['system-admin'],
    ...MODELCARD_PERMISSIONS['system-admin'],
    ...CONFIDENCE_PERMISSIONS['system-admin'],
    ...FEEDBACK_PERMISSIONS['system-admin'],
    ...AUDIT_PERMISSIONS['system-admin'],
    ...RETENTION_UI_PERMISSIONS['system-admin'],
  },
  'facility-admin': {
    ...BASE_PERMISSIONS['facility-admin'],
    ...QUEUE_PERMISSIONS['facility-admin'],
    ...MODELCARD_PERMISSIONS['facility-admin'],
    ...CONFIDENCE_PERMISSIONS['facility-admin'],
    ...FEEDBACK_PERMISSIONS['facility-admin'],
    ...AUDIT_PERMISSIONS['facility-admin'],
    ...RETENTION_UI_PERMISSIONS['facility-admin'],
  },
}

export const ROLE_DISPLAY: Record<UserRole, string> = {
  patient: 'Patient (self service)',
  nurse: 'Nurse / Health Worker',
  doctor: 'Doctor / Medical Officer',
  admin: 'Facility Administrator',
  'system-admin': 'System Administrator',
  'facility-admin': 'Facility Administrator',
}

export const ROLE_CAPABILITY_COPY: Record<UserRole, string> = {
  patient: 'Can submit your own intake and answer follow-up questions. Records stay read-only for you.',
  nurse: 'Can capture, edit and accept notes. Cannot finalize or approve referrals.',
  doctor: 'Can edit, finalize and approve referrals for a higher-level facility.',
  admin: 'Full access — clinical actions, referrals, audit and user management.',
  'system-admin':
    'Manages every facility, switches facility scope, and has full clinical, audit and user access.',
  'facility-admin':
    'Manages users and settings for the current facility, with full clinical and audit access.',
}

export function permissionsFor(role: UserRole): Permissions {
  return PERMISSIONS[role]
}

/**
 * Which permission gates each offline-capable write. `null` means any
 * authenticated user may queue it (intake + audit notes). This is a
 * client-side guard only — the backend re-checks RBAC on every synced item.
 */
const QUEUE_ACTION_PERMISSION: Record<QueueActionType, keyof Permissions | null> = {
  'intake.create-text': null,
  'intake.create-voice': null,
  'report.attach-metadata': 'canUploadReports',
  'visual.attach-metadata': 'canUploadVisuals',
  'followup.add': 'canAddClinicianFollowUp',
  'followup.answer': 'canAnswerFollowUp',
  'note.edit': 'canEditNote',
  'note.accept': 'canAcceptNote',
  'note.finalize': 'canFinalizeNote',
  'timeline.add': 'canEditTimeline',
  'timeline.edit': 'canEditTimeline',
  'timeline.delete': 'canEditTimeline',
  'referral.draft': 'canDraftReferral',
  'referral.approve': 'canApproveReferral',
  'consent.revoke': 'canRevokeConsent',
  'audit.log': null,
  'feedback.create': 'canSubmitFeedback',
  'feedback.update': 'canSubmitFeedback',
  'feedback.delete': 'canSubmitFeedback',
}

/** True when `role` is allowed to queue this offline write. */
export function canEnqueueOfflineWrite(role: UserRole, actionType: QueueActionType): boolean {
  const gate = QUEUE_ACTION_PERMISSION[actionType]
  return gate === null ? true : permissionsFor(role)[gate] === true
}
