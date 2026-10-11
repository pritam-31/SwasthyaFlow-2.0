import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { permissionsFor, type Permissions } from '../services/rbacService'
import * as api from '../services/api'
import * as languageApi from '../services/languageApi'
import * as reportApi from '../services/reportApi'
import * as visualApi from '../services/visualApi'
import * as timelineApi from '../services/timelineApi'
import * as followUpApi from '../services/followUpApi'
import * as retentionApi from '../services/retentionApi'
import * as anonymisationApi from '../services/anonymisationApi'
import * as confidenceApi from '../services/confidenceApi'
import * as feedbackApi from '../services/feedbackApi'
import { CONSENT_POLICY_VERSION, FEEDBACK_SECTION_LABELS, OFFLINE_SECTION_LABELS } from '../services/safetyPolicy'
import { useApp } from '../store/AppStore'
import { useAuth } from './AuthContext'
import { useOffline } from './OfflineContext'
import { isNetworkError } from '../services/syncService'
import type { EnqueueInput } from '../services/offlineQueue'
import type { ReportExtractionResult, ReportsView } from '../types/report.types'
import type { VisualExtractionResult, VisualsView } from '../types/visual.types'
import type { DetectedLanguageInfo, LanguageCode } from '../types/language.types'
import type { Timeline } from '../types/timeline.types'
import type {
  ClinicianFollowUpInput,
  FollowUpEditPatch,
  FollowUpQuestion,
} from '../types/followup.types'
import { CODE_BY_INTAKE_LANGUAGE } from '../types/language.types'
import type {
  ConsentRecord,
  RetentionAction,
  RetentionExport,
  RetentionJobResult,
  RetentionMode,
  RetentionPolicy,
  RetentionStatusRow,
  Tombstone,
} from '../types/retention.types'
import type {
  AnonymisationMetrics,
  AnonymisationPreviewResult,
  AnonymisationReport,
  HarnessResult,
  PIIModality,
  ReviewerVerdict,
} from '../types/anonymisation.types'
import type {
  ConfidencePolicy,
  ConfidenceThresholds,
  LowConfidenceItemType,
  LowConfidenceReviewAction,
  LowConfidenceVerdict,
  SessionConfidence,
} from '../types/confidence.types'
import type {
  Feedback,
  FeedbackAggregate,
  FeedbackCreateInput,
  FeedbackDashboard,
  FeedbackExport,
  FeedbackExportRequest,
  FeedbackUpdateInput,
} from '../types/feedback.types'
import type {
  AuditAction,
  AuditCategory,
  AuditLogEntry,
  IntakeLanguage,
  PatientSession,
  StructuredTriageNote,
  UserRole,
} from '../types/triage'

/** Fallback display names when no signed-in user is attached (e.g. logout). */
const ACTOR: Record<UserRole, string> = {
  patient: 'Patient (self)',
  nurse: 'R. Sharma',
  doctor: 'Dr. A. Mehta',
  admin: 'S. Kiro',
  'system-admin': 'System Administrator',
  'facility-admin': 'Facility Administrator',
}

export interface IntakeSubmission {
  /** Pre-generated anonymized surrogate shown to staff before submission. */
  patientId: string
  ageBand: PatientSession['demographics']['ageBand']
  sex: PatientSession['demographics']['sex']
  intakePoint: PatientSession['demographics']['intakePoint']
  language: PatientSession['raw']['language']
  text: string
  voice: PatientSession['raw']['voice']
  image: PatientSession['raw']['image']
  document: PatientSession['raw']['document']
  consentAcknowledged: boolean
}

interface TriageContextValue {
  sessions: PatientSession[]
  activeSession: PatientSession | null
  activeId: string | null
  audit: AuditLogEntry[]
  permissions: Permissions
  role: UserRole
  working: boolean
  error: string | null
  booted: boolean
  /** Language selected on the intake form (resolved from Auto-detect). */
  language: IntakeLanguage
  setLanguage: (next: IntakeLanguage) => void
  /** Live script detection shown on the intake form (label only). */
  detectedLanguage: DetectedLanguageInfo | null
  setDetectedLanguage: (next: DetectedLanguageInfo | null) => void
  createSession: (input: IntakeSubmission) => Promise<string | null>
  selectSession: (id: string) => void
  clearSelection: () => void
  acceptNote: (id: string) => Promise<boolean>
  saveOverride: (id: string, next: StructuredTriageNote) => Promise<boolean>
  finalizeNote: (id: string) => Promise<boolean>
  askFollowUp: (id: string, questionId: string) => Promise<boolean>
  answerFollowUp: (id: string, questionId: string, answer: string) => Promise<boolean>
  escalateSession: (id: string, toFacility: string, reason: string) => Promise<boolean>
  approveReferral: (id: string) => Promise<boolean>
  /** Staff-only stateless analysis preview — patients are never allowed to call analyze. */
  previewNote: (text: string, language?: IntakeLanguage) => Promise<languageApi.TriageAnalyzeResult | null>
  resetError: () => void
  /** Per-session report lists + merged views, keyed by session id. */
  reportsBySession: Record<string, ReportsView>
  /** Upload staged report files to a session; returns per-file extraction results. */
  uploadReportsToSession: (
    sessionId: string,
    files: File[],
  ) => Promise<{ ok: boolean; error?: string; results: ReportExtractionResult[] }>
  refreshSessionReports: (sessionId: string) => Promise<void>
  verifyReport: (sessionId: string, reportId: string, note?: string) => Promise<boolean>
  rejectReport: (sessionId: string, reportId: string, reason: string) => Promise<boolean>
  deleteSessionReport: (sessionId: string, reportId: string) => Promise<boolean>
  /** Per-session photo lists + disclaimer, keyed by session id. */
  visualsBySession: Record<string, VisualsView>
  /** Upload staged photos to a session; returns per-file extraction results. */
  uploadVisualsToSession: (
    sessionId: string,
    files: File[],
    visualType?: string,
  ) => Promise<{ ok: boolean; error?: string; results: VisualExtractionResult[] }>
  refreshSessionVisuals: (sessionId: string) => Promise<void>
  verifyVisual: (sessionId: string, visualId: string, note?: string) => Promise<boolean>
  rejectVisual: (sessionId: string, visualId: string, reason: string) => Promise<boolean>
  deleteSessionVisual: (sessionId: string, visualId: string) => Promise<boolean>
  /** Per-session timelines. `null` = fetched but not built yet; absent = not fetched. */
  timelinesBySession: Record<string, Timeline | null>
  /** Per-session in-flight flags, keyed by session id. */
  timelineLoading: Record<string, boolean>
  /** Fetch (or 404-clear) a session's timeline. */
  refreshSessionTimeline: (sessionId: string) => Promise<Timeline | null>
  /** Staff-only build / rebuild of the AI draft. */
  buildSessionTimeline: (sessionId: string) => Promise<Timeline | null>
  /** Staff-only regenerate (replaces the previous draft). */
  regenerateSessionTimeline: (sessionId: string) => Promise<Timeline | null>
  /** Staff-only accept — the human takes ownership of the chronology. */
  acceptSessionTimeline: (sessionId: string) => Promise<Timeline | null>
  /** Staff-only add a clinician event (runs the non-diagnostic guard server-side). */
  addTimelineEvent: (sessionId: string, input: timelineApi.TimelineCreateEventInput) => Promise<Timeline | null>
  /** Staff-only edit an event (human-in-the-loop correction). */
  editTimelineEvent: (
    sessionId: string,
    eventId: string,
    patch: timelineApi.TimelineEventEditPatch,
  ) => Promise<Timeline | null>
  /** Staff-only remove an event. */
  removeTimelineEvent: (sessionId: string, eventId: string) => Promise<Timeline | null>
  /** Per-session follow-up question lists (P0-5), keyed by session id. */
  followUpsBySession: Record<string, FollowUpQuestion[]>
  /** Per-session in-flight flags for the follow-up list. */
  followUpLoading: Record<string, boolean>
  /** Fetch (or 404-clear) a session's follow-up questions. */
  refreshSessionFollowUps: (sessionId: string) => Promise<FollowUpQuestion[] | null>
  /** Staff-only generate the AI suggestions (keeps human-tracked ones). */
  generateSessionFollowUps: (sessionId: string) => Promise<FollowUpQuestion[] | null>
  /** Staff-only regenerate the AI suggestions (previous suggestions replaced). */
  regenerateSessionFollowUps: (sessionId: string) => Promise<FollowUpQuestion[] | null>
  /** Staff-only add a clinician question (runs the guards server-side). */
  addClinicianFollowUp: (sessionId: string, input: ClinicianFollowUpInput) => Promise<FollowUpQuestion | null>
  /** Staff-only record an answer verbatim in the patient's own language. */
  answerFollowUpInLanguage: (
    sessionId: string,
    questionId: string,
    answerText: string,
    answerLanguage: 'en' | 'hi' | 'or',
  ) => Promise<boolean>
  /** Staff-only skip a suggested / asked question. */
  skipSessionFollowUp: (sessionId: string, questionId: string) => Promise<boolean>
  /** Staff-only human-in-the-loop correction of a question. */
  editSessionFollowUp: (sessionId: string, questionId: string, patch: FollowUpEditPatch) => Promise<boolean>
  /** Reviewed-doctor / admin only: remove a question. */
  deleteSessionFollowUp: (sessionId: string, questionId: string) => Promise<boolean>
  /** Staff-only reorder the question list (full permutation required). */
  reorderSessionFollowUps: (sessionId: string, orderedIds: string[]) => Promise<boolean>
  /* ---------------- Data retention + consent (P0-6) ---------------- */
  /** The published retention policy (doctor / admin). */
  retentionPolicy: RetentionPolicy | null
  /** Retention history, most recent first. */
  retentionActions: RetentionAction[]
  /** Deletion proofs (admin). */
  retentionTombstones: Tombstone[]
  /** Per-category inventory + what is due (admin). */
  retentionStatus: RetentionStatusRow[]
  /** True while any retention fetch/manage call is in flight. */
  retentionLoading: boolean
  /** Reload the policy + audit history (+ tombstones/status for admins). */
  refreshRetention: () => Promise<void>
  /** Reload the retention inventory (admin). */
  refreshRetentionStatus: () => Promise<void>
  /** Reload deletion proofs (admin), optionally for one case. */
  refreshRetentionTombstones: (sessionId?: string) => Promise<Tombstone[]>
  /** Apply rule edits (admin). */
  saveRetentionPolicyRules: (rules: retentionApi.RetentionRulePatch[]) => Promise<boolean>
  /** Run a sweep now (admin). */
  runRetentionJob: (mode?: RetentionMode) => Promise<RetentionJobResult | null>
  /** Reload the session list (used after a case is erased). */
  refreshSessions: () => Promise<void>
  /** Read the consent proof for a case (owner may read their own). */
  fetchSessionConsent: (sessionId: string) => Promise<ConsentRecord | null>
  /** Withdraw consent — erases the case and reloads the queue. */
  revokeSessionConsent: (sessionId: string, reason?: string) => Promise<boolean>
  /** Manually erase a case (doctor / admin). */
  deleteSessionData: (sessionId: string, reason?: string) => Promise<boolean>
  /** Build a portable export of a case (doctor / admin). */
  exportSession: (sessionId: string) => Promise<RetentionExport | null>
  /** Push a case's retention out (admin). */
  extendSessionRetention: (sessionId: string, days: number) => Promise<boolean>
  /* ---------------- Unified anonymisation (P0-7) ---------------- */
  /** Stored anonymisation reports, newest first (doctor / admin). */
  anonymisationReports: AnonymisationReport[]
  /** Aggregated per-case coverage reports, keyed by session id. */
  sessionAnonymisationReports: Record<string, AnonymisationReport>
  /** True while an anonymisation fetch is in flight. */
  anonymisationLoading: boolean
  /** Facility-wide anonymisation metrics (admin). */
  anonymisationMetrics: AnonymisationMetrics | null
  /** Pattern inventory, counts only (admin). */
  anonymisationPatterns: Record<string, number> | null
  /** Stateless redaction preview of free text (any authenticated role). */
  previewAnonymisation: (
    text: string,
    language?: LanguageCode,
    sessionId?: string,
  ) => Promise<AnonymisationPreviewResult | null>
  /** Reload stored reports (doctor / admin); filter to one case. */
  refreshAnonymisationReports: (sessionId?: string) => Promise<void>
  /** Reload one case's aggregated coverage report (doctor / admin). */
  refreshSessionAnonymisationReport: (sessionId: string) => Promise<AnonymisationReport | null>
  /** Record a reviewer verdict on a detected match (doctor / admin). */
  submitAnonymisationFeedback: (input: {
    reportId: string
    modality: PIIModality
    matchIndex: number
    verdict: ReviewerVerdict
    note?: string
    sessionId?: string
  }) => Promise<boolean>
  /** Reload facility-wide anonymisation metrics (admin). */
  refreshAnonymisationMetrics: () => Promise<void>
  /** Reload the pattern inventory (admin). */
  refreshAnonymisationPatterns: () => Promise<void>
  /** Run the synthetic PII leak corpus (admin). */
  runAnonymisationLeakTests: () => Promise<HarnessResult | null>
  /* ---------------- Confidence + explainability (P2-14) ---------------- */
  /** Per-case confidence (aggregate + worst + low items), keyed by session id. */
  confidencesBySession: Record<string, SessionConfidence>
  /** Human review decisions recorded against a case, keyed by session id. */
  confidenceReviewActions: Record<string, LowConfidenceReviewAction[]>
  /** True while a per-case confidence fetch is in flight, keyed by session id. */
  confidenceLoading: Record<string, boolean>
  /** The effective per-facility confidence thresholds (admin). */
  confidencePolicy: ConfidencePolicy | null
  /** Load a case's confidence + review history (clinical staff). */
  refreshSessionConfidence: (sessionId: string) => Promise<SessionConfidence | null>
  /** Force a fresh recompute for a case (clinical staff). Requires a connection. */
  recomputeSessionConfidence: (sessionId: string) => Promise<SessionConfidence | null>
  /** Record a human verdict on a low-confidence item (clinical staff). */
  reviewLowConfidenceItem: (input: {
    sessionId: string
    itemType: LowConfidenceItemType
    itemId: string
    verdict: LowConfidenceVerdict
    reason?: string
  }) => Promise<boolean>
  /** Load the effective confidence thresholds (admin). */
  refreshConfidencePolicy: () => Promise<void>
  /** Update the per-facility confidence thresholds (admin). */
  saveConfidencePolicy: (patch: Partial<ConfidenceThresholds>) => Promise<boolean>

  /* ---------------- Clinician feedback (P2-15) ---------------- */
  /** Feedback recorded against a case, keyed by session id. */
  feedbackBySession: Record<string, Feedback[]>
  /** True while a per-case feedback fetch is in flight, keyed by session id. */
  feedbackLoading: Record<string, boolean>
  /** The facility-wide feedback rollup (admin). */
  feedbackDashboard: FeedbackDashboard | null
  /** The facility feedback aggregate for the current range (admin). */
  feedbackAggregate: FeedbackAggregate | null
  /** Load a case's feedback (clinical staff). Offline-aware. */
  refreshSessionFeedback: (sessionId: string) => Promise<Feedback[] | null>
  /** Record a new feedback verdict (clinical staff). Queued offline. */
  submitFeedback: (input: FeedbackCreateInput) => Promise<boolean>
  /** Edit an existing feedback verdict (owner or admin). Queued offline. */
  updateFeedback: (id: string, patch: FeedbackUpdateInput) => Promise<boolean>
  /** Withdraw a feedback verdict (owner or admin). Queued offline. */
  deleteFeedback: (id: string) => Promise<boolean>
  /** Load the facility feedback dashboard (admin). Online-only. */
  refreshFeedbackDashboard: () => Promise<FeedbackDashboard | null>
  /** Load the facility feedback aggregate for a range (admin). Online-only. */
  refreshFeedbackAggregate: (range?: { since?: string; until?: string }) => Promise<FeedbackAggregate | null>
  /** Build a portable feedback export (admin). Online-only. */
  exportFeedback: (input?: FeedbackExportRequest) => Promise<FeedbackExport | null>
}

const TriageContext = createContext<TriageContextValue | null>(null)

export function TriageProvider({ children }: { children: ReactNode }) {
  const { role, pushToast } = useApp()
  const { user } = useAuth()
  const { enqueue } = useOffline()
  const [sessions, setSessions] = useState<PatientSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [audit, setAudit] = useState<AuditLogEntry[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booted, setBooted] = useState(false)
  const [language, setLanguage] = useState<IntakeLanguage>('English')
  const [detectedLanguage, setDetectedLanguage] = useState<DetectedLanguageInfo | null>(null)
  const [reportsBySession, setReportsBySession] = useState<Record<string, ReportsView>>({})
  const [visualsBySession, setVisualsBySession] = useState<Record<string, VisualsView>>({})
  const [timelinesBySession, setTimelinesBySession] = useState<Record<string, Timeline | null>>({})
  const [timelineLoading, setTimelineLoading] = useState<Record<string, boolean>>({})
  const [followUpsBySession, setFollowUpsBySession] = useState<Record<string, FollowUpQuestion[]>>({})
  const [followUpLoading, setFollowUpLoading] = useState<Record<string, boolean>>({})
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy | null>(null)
  const [retentionActions, setRetentionActions] = useState<RetentionAction[]>([])
  const [retentionTombstones, setRetentionTombstones] = useState<Tombstone[]>([])
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatusRow[]>([])
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [anonymisationReports, setAnonymisationReports] = useState<AnonymisationReport[]>([])
  const [sessionAnonymisationReports, setSessionAnonymisationReports] = useState<Record<string, AnonymisationReport>>({})
  const [anonymisationLoading, setAnonymisationLoading] = useState(false)
  const [anonymisationMetrics, setAnonymisationMetrics] = useState<AnonymisationMetrics | null>(null)
  const [anonymisationPatterns, setAnonymisationPatterns] = useState<Record<string, number> | null>(null)
  const [confidencesBySession, setConfidencesBySession] = useState<Record<string, SessionConfidence>>({})
  const [confidenceReviewActions, setConfidenceReviewActions] = useState<Record<string, LowConfidenceReviewAction[]>>({})
  const [confidenceLoading, setConfidenceLoading] = useState<Record<string, boolean>>({})
  const [confidencePolicy, setConfidencePolicy] = useState<ConfidencePolicy | null>(null)
  const [feedbackBySession, setFeedbackBySession] = useState<Record<string, Feedback[]>>({})
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({})
  const [feedbackDashboard, setFeedbackDashboard] = useState<FeedbackDashboard | null>(null)
  const [feedbackAggregate, setFeedbackAggregate] = useState<FeedbackAggregate | null>(null)

  const permissions = permissionsFor(role)
  const actor = user?.displayName ?? ACTOR[role]

  /** Save an offline-capable write to the durable queue and notify the user. */
  const queueWrite = useCallback(
    async (input: EnqueueInput): Promise<void> => {
      await enqueue(input)
      pushToast('info', OFFLINE_SECTION_LABELS.en.queuedToast)
    },
    [enqueue, pushToast],
  )

  /** The version the client last saw, so the server can detect a stale write. */
  const baseVersionOf = useCallback(
    (id: string): string | undefined => sessions.find((s) => s.id === id)?.updatedAt,
    [sessions],
  )

  const refreshAudit = useCallback(() => {
    api
      .fetchAudit()
      .then((r) => setAudit(r.entries))
      .catch(() => undefined)
  }, [])

  /* ---------------- Timeline (P0-4) ---------------- */

  /** Load a session's timeline; a 404 means "not built yet" and stores null. */
  const refreshSessionTimeline = useCallback(async (sessionId: string): Promise<Timeline | null> => {
    setTimelineLoading((prev) => ({ ...prev, [sessionId]: true }))
    try {
      const timeline = await timelineApi.fetchTimeline(sessionId)
      setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
      return timeline
    } catch {
      // Non-404 failures (e.g. backend down) also render as "not built" so the
      // card never spins in an endless refetch loop.
      setTimelinesBySession((prev) => ({ ...prev, [sessionId]: null }))
      return null
    } finally {
      setTimelineLoading((prev) => ({ ...prev, [sessionId]: false }))
    }
  }, [])

  const buildSessionTimeline = useCallback(
    async (sessionId: string): Promise<Timeline | null> => {
      if (!permissions.canBuildTimeline) return null
      try {
        const timeline = await timelineApi.buildTimeline(sessionId)
        setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
        refreshAudit()
        return timeline
      } catch {
        return null
      }
    },
    [permissions.canBuildTimeline, refreshAudit],
  )

  const regenerateSessionTimeline = useCallback(
    async (sessionId: string): Promise<Timeline | null> => {
      if (!permissions.canBuildTimeline) return null
      try {
        const timeline = await timelineApi.regenerateTimeline(sessionId)
        setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
        refreshAudit()
        return timeline
      } catch {
        return null
      }
    },
    [permissions.canBuildTimeline, refreshAudit],
  )

  const acceptSessionTimeline = useCallback(
    async (sessionId: string): Promise<Timeline | null> => {
      if (!permissions.canAcceptTimeline) return null
      try {
        const timeline = await timelineApi.acceptTimeline(sessionId)
        setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
        refreshAudit()
        return timeline
      } catch {
        return null
      }
    },
    [permissions.canAcceptTimeline, refreshAudit],
  )

  const addTimelineEvent = useCallback(
    async (sessionId: string, input: timelineApi.TimelineCreateEventInput): Promise<Timeline | null> => {
      if (!permissions.canEditTimeline) return null
      try {
        const timeline = await timelineApi.addTimelineEvent(sessionId, input)
        setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
        refreshAudit()
        return timeline
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'timeline.add',
            endpoint: `/api/sessions/${sessionId}/timeline/events`,
            method: 'POST',
            sessionId,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { ...input, baseUpdatedAt: baseVersionOf(sessionId) },
          })
          return timelinesBySession[sessionId] ?? null
        }
        if (e instanceof Error) throw e
        return null
      }
    },
    [baseVersionOf, permissions.canEditTimeline, queueWrite, refreshAudit, role, timelinesBySession, user?.id],
  )

  const editTimelineEvent = useCallback(
    async (
      sessionId: string,
      eventId: string,
      patch: timelineApi.TimelineEventEditPatch,
    ): Promise<Timeline | null> => {
      if (!permissions.canEditTimeline) return null
      try {
        const timeline = await timelineApi.editTimelineEvent(sessionId, eventId, patch)
        setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
        refreshAudit()
        return timeline
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'timeline.edit',
            endpoint: `/api/sessions/${sessionId}/timeline/events/${eventId}`,
            method: 'PATCH',
            sessionId,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { eventId, patch, baseUpdatedAt: baseVersionOf(sessionId) },
          })
          return timelinesBySession[sessionId] ?? null
        }
        if (e instanceof Error) throw e
        return null
      }
    },
    [baseVersionOf, permissions.canEditTimeline, queueWrite, refreshAudit, role, timelinesBySession, user?.id],
  )

  const removeTimelineEvent = useCallback(
    async (sessionId: string, eventId: string): Promise<Timeline | null> => {
      if (!permissions.canEditTimeline) return null
      try {
        const timeline = await timelineApi.removeTimelineEvent(sessionId, eventId)
        setTimelinesBySession((prev) => ({ ...prev, [sessionId]: timeline }))
        refreshAudit()
        return timeline
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'timeline.delete',
            endpoint: `/api/sessions/${sessionId}/timeline/events/${eventId}`,
            method: 'DELETE',
            sessionId,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { eventId, baseUpdatedAt: baseVersionOf(sessionId) },
          })
          return timelinesBySession[sessionId] ?? null
        }
        return null
      }
    },
    [baseVersionOf, permissions.canEditTimeline, queueWrite, refreshAudit, role, timelinesBySession, user?.id],
  )

  /* ---------------- Dynamic follow-up questions (P0-5) ---------------- */

  const applyFollowUps = useCallback((sessionId: string, questions: FollowUpQuestion[]) => {
    setFollowUpsBySession((prev) => ({ ...prev, [sessionId]: questions }))
  }, [])

  const applyFollowUpItem = useCallback((sessionId: string, question: FollowUpQuestion) => {
    setFollowUpsBySession((prev) => {
      const list = prev[sessionId] ?? []
      const exists = list.some((q) => q.id === question.id)
      return {
        ...prev,
        [sessionId]: exists ? list.map((q) => (q.id === question.id ? question : q)) : [...list, question],
      }
    })
  }, [])

  /** Load a session's follow-up questions; a 404 clears the cache entry. */
  const refreshSessionFollowUps = useCallback(async (sessionId: string): Promise<FollowUpQuestion[] | null> => {
    setFollowUpLoading((prev) => ({ ...prev, [sessionId]: true }))
    try {
      const questions = await followUpApi.fetchSessionFollowUps(sessionId)
      setFollowUpsBySession((prev) => ({ ...prev, [sessionId]: questions ?? [] }))
      return questions
    } catch {
      setFollowUpsBySession((prev) => ({ ...prev, [sessionId]: [] }))
      return null
    } finally {
      setFollowUpLoading((prev) => ({ ...prev, [sessionId]: false }))
    }
  }, [])

  const generateSessionFollowUps = useCallback(
    async (sessionId: string): Promise<FollowUpQuestion[] | null> => {
      if (!permissions.canGenerateFollowUps) return null
      try {
        const questions = await followUpApi.generateSessionFollowUps(sessionId)
        applyFollowUps(sessionId, questions)
        refreshAudit()
        return questions
      } catch {
        return null
      }
    },
    [applyFollowUps, permissions.canGenerateFollowUps, refreshAudit],
  )

  const regenerateSessionFollowUps = useCallback(
    async (sessionId: string): Promise<FollowUpQuestion[] | null> => {
      if (!permissions.canGenerateFollowUps) return null
      try {
        const questions = await followUpApi.regenerateSessionFollowUps(sessionId)
        applyFollowUps(sessionId, questions)
        refreshAudit()
        return questions
      } catch {
        return null
      }
    },
    [applyFollowUps, permissions.canGenerateFollowUps, refreshAudit],
  )

  const addClinicianFollowUp = useCallback(
    async (sessionId: string, input: ClinicianFollowUpInput): Promise<FollowUpQuestion | null> => {
      if (!permissions.canAddClinicianFollowUp) return null
      try {
        const question = await followUpApi.addClinicianFollowUp(sessionId, input)
        applyFollowUpItem(sessionId, question)
        refreshAudit()
        return question
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'followup.add',
            endpoint: `/api/sessions/${sessionId}/followups`,
            method: 'POST',
            sessionId,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { ...input },
          })
          return null
        }
        if (e instanceof Error) throw e
        return null
      }
    },
    [applyFollowUpItem, permissions.canAddClinicianFollowUp, queueWrite, refreshAudit, role, user?.id],
  )

  const skipSessionFollowUp = useCallback(
    async (sessionId: string, questionId: string): Promise<boolean> => {
      if (!permissions.canAskFollowUp) return false
      try {
        const question = await followUpApi.skipFollowUp(sessionId, questionId)
        applyFollowUpItem(sessionId, question)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyFollowUpItem, permissions.canAskFollowUp, refreshAudit],
  )

  const editSessionFollowUp = useCallback(
    async (sessionId: string, questionId: string, patch: FollowUpEditPatch): Promise<boolean> => {
      if (!permissions.canEditFollowUps) return false
      try {
        const question = await followUpApi.editFollowUp(sessionId, questionId, patch)
        applyFollowUpItem(sessionId, question)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyFollowUpItem, permissions.canEditFollowUps, refreshAudit],
  )

  const deleteSessionFollowUp = useCallback(
    async (sessionId: string, questionId: string): Promise<boolean> => {
      if (!permissions.canDeleteFollowUps) return false
      try {
        await followUpApi.deleteFollowUp(sessionId, questionId)
        setFollowUpsBySession((prev) => ({
          ...prev,
          [sessionId]: (prev[sessionId] ?? []).filter((q) => q.id !== questionId),
        }))
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canDeleteFollowUps, refreshAudit],
  )

  const reorderSessionFollowUps = useCallback(
    async (sessionId: string, orderedIds: string[]): Promise<boolean> => {
      if (!permissions.canEditFollowUps) return false
      try {
        const questions = await followUpApi.reorderFollowUps(sessionId, orderedIds)
        applyFollowUps(sessionId, questions)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyFollowUps, permissions.canEditFollowUps, refreshAudit],
  )

  /** Legacy signature kept for the note panel — now targets the P0-5 endpoint.
   *  Ask is staff-only; the backend records the audit trail. */
  const askFollowUp = useCallback(
    async (id: string, questionId: string): Promise<boolean> => {
      if (!permissions.canAskFollowUp) return false
      try {
        const question = await followUpApi.askFollowUp(id, questionId)
        applyFollowUpItem(id, question)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyFollowUpItem, permissions.canAskFollowUp, refreshAudit],
  )

  const answerFollowUp = useCallback(
    async (id: string, questionId: string, answer: string): Promise<boolean> => {
      if (!permissions.canAnswerFollowUp) return false
      if (!answer.trim()) return false
      const defaultLanguage = (() => {
        const cached = followUpsBySession[id]?.find((q) => q.id === questionId)
        if (cached) return cached.language
        const session = sessions.find((s) => s.id === id)
        return session ? CODE_BY_INTAKE_LANGUAGE[session.raw.language] : 'en'
      })()
      try {
        const question = await followUpApi.answerFollowUp(id, questionId, answer.trim(), defaultLanguage)
        applyFollowUpItem(id, question)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'followup.answer',
            endpoint: `/api/sessions/${id}/followups/${questionId}/answer`,
            method: 'POST',
            sessionId: id,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { questionId, answerText: answer.trim(), answerLanguage: defaultLanguage, baseUpdatedAt: baseVersionOf(id) },
          })
          return true
        }
        return false
      }
    },
    [applyFollowUpItem, baseVersionOf, followUpsBySession, permissions.canAnswerFollowUp, queueWrite, refreshAudit, role, sessions, user?.id],
  )

  const answerFollowUpInLanguage = useCallback(
    async (
      sessionId: string,
      questionId: string,
      answerText: string,
      answerLanguage: 'en' | 'hi' | 'or',
    ): Promise<boolean> => {
      if (!permissions.canAnswerFollowUp) return false
      if (!answerText.trim()) return false
      try {
        const question = await followUpApi.answerFollowUp(sessionId, questionId, answerText.trim(), answerLanguage)
        applyFollowUpItem(sessionId, question)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'followup.answer',
            endpoint: `/api/sessions/${sessionId}/followups/${questionId}/answer`,
            method: 'POST',
            sessionId,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: {
              questionId,
              answerText: answerText.trim(),
              answerLanguage,
              baseUpdatedAt: baseVersionOf(sessionId),
            },
          })
          return true
        }
        if (e instanceof Error) throw e
        return false
      }
    },
    [applyFollowUpItem, baseVersionOf, permissions.canAnswerFollowUp, queueWrite, refreshAudit, role, user?.id],
  )

  const refreshSessionReports = useCallback(
    (sessionId: string) =>
      reportApi
        .fetchSessionReports(sessionId)
        .then((view) => setReportsBySession((prev) => ({ ...prev, [sessionId]: view })))
        .catch(() => undefined),
    [],
  )

  const refreshSessionVisuals = useCallback(
    (sessionId: string) =>
      visualApi
        .fetchSessionVisuals(sessionId)
        .then((view) => setVisualsBySession((prev) => ({ ...prev, [sessionId]: view })))
        .catch(() => undefined),
    [],
  )

  /** Reload the session list and per-session caches from the backend. */
  const refreshSessions = useCallback(async (): Promise<void> => {
    try {
      const list = await api.fetchSessions()
      const mapped = list.sessions.map(api.sessionFromApi)
      const [views, visualViews, timelineViews, followUpViews] = await Promise.all([
        Promise.all(list.sessions.map((s) => reportApi.fetchSessionReports(s.id).catch(() => null))),
        Promise.all(list.sessions.map((s) => visualApi.fetchSessionVisuals(s.id).catch(() => null))),
        Promise.all(list.sessions.map((s) => timelineApi.fetchTimeline(s.id).catch(() => null))),
        Promise.all(list.sessions.map((s) => followUpApi.fetchSessionFollowUps(s.id).catch(() => null))),
      ])
      setSessions(mapped)
      setActiveId((current) => (current && mapped.some((s) => s.id === current) ? current : null))
      const mergedReports: Record<string, ReportsView> = {}
      const mergedVisuals: Record<string, VisualsView> = {}
      const mergedTimelines: Record<string, Timeline | null> = {}
      const mergedFollowUps: Record<string, FollowUpQuestion[]> = {}
      list.sessions.forEach((s, i) => {
        if (views[i]) mergedReports[s.id] = views[i]!
        if (visualViews[i]) mergedVisuals[s.id] = visualViews[i]!
        mergedTimelines[s.id] = timelineViews[i]
        if (followUpViews[i]) mergedFollowUps[s.id] = followUpViews[i]!
      })
      setReportsBySession(mergedReports)
      setVisualsBySession(mergedVisuals)
      setTimelinesBySession(mergedTimelines)
      setFollowUpsBySession(mergedFollowUps)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh the session list.')
    }
  }, [])

  /* ---------------- Data retention + consent (P0-6) ---------------- */

  const refreshRetention = useCallback(async (): Promise<void> => {
    setRetentionLoading(true)
    try {
      const wantsPolicy = permissions.canViewRetentionPolicy
      const wantsActions = permissions.canViewRetentionActions
      const wantsTombstones = role === 'admin'
      const [policy, actions, tombstones] = await Promise.all([
        wantsPolicy ? retentionApi.fetchRetentionPolicy().catch(() => null) : Promise.resolve(null),
        wantsActions ? retentionApi.fetchRetentionActions().catch(() => []) : Promise.resolve([]),
        wantsTombstones ? retentionApi.fetchTombstones().catch(() => []) : Promise.resolve([]),
      ])
      if (policy) setRetentionPolicy(policy)
      setRetentionActions(actions)
      setRetentionTombstones(tombstones)
    } finally {
      setRetentionLoading(false)
    }
  }, [permissions.canViewRetentionPolicy, permissions.canViewRetentionActions, role])

  const refreshRetentionStatus = useCallback(async (): Promise<void> => {
    if (!permissions.canRunRetentionJob) return
    try {
      const { status } = await retentionApi.fetchRetentionStatus()
      setRetentionStatus(status)
    } catch {
      setRetentionStatus([])
    }
  }, [permissions.canRunRetentionJob])

  const refreshRetentionTombstones = useCallback(async (sessionId?: string): Promise<Tombstone[]> => {
    try {
      const tombstones = await retentionApi.fetchTombstones(sessionId)
      if (!sessionId) setRetentionTombstones(tombstones)
      return tombstones
    } catch {
      return []
    }
  }, [])

  const saveRetentionPolicyRules = useCallback(
    async (rules: retentionApi.RetentionRulePatch[]): Promise<boolean> => {
      if (!permissions.canEditRetentionPolicy) return false
      try {
        const policy = await retentionApi.saveRetentionPolicy(rules)
        setRetentionPolicy(policy)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canEditRetentionPolicy, refreshAudit],
  )

  const runRetentionJob = useCallback(
    async (mode: RetentionMode = 'delete'): Promise<RetentionJobResult | null> => {
      if (!permissions.canRunRetentionJob) return null
      try {
        const result = await retentionApi.runRetentionJob(mode)
        await Promise.all([refreshSessions(), refreshRetention(), refreshRetentionStatus()])
        refreshAudit()
        return result
      } catch {
        return null
      }
    },
    [permissions.canRunRetentionJob, refreshAudit, refreshRetention, refreshRetentionStatus, refreshSessions],
  )

  const fetchSessionConsent = useCallback(async (sessionId: string): Promise<ConsentRecord | null> => {
    try {
      return await retentionApi.fetchSessionConsent(sessionId)
    } catch {
      return null
    }
  }, [])

  const revokeSessionConsent = useCallback(
    async (sessionId: string, reason?: string): Promise<boolean> => {
      if (!permissions.canRevokeConsent) return false
      try {
        await retentionApi.revokeSessionConsent(sessionId, reason)
        await refreshSessions()
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'consent.revoke',
            endpoint: `/api/sessions/${sessionId}/consent/revoke`,
            method: 'POST',
            sessionId,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { reason: reason ?? '' },
          })
          return true
        }
        return false
      }
    },
    [permissions.canRevokeConsent, queueWrite, refreshAudit, refreshSessions, role, user?.id],
  )

  const deleteSessionData = useCallback(
    async (sessionId: string, reason?: string): Promise<boolean> => {
      if (!permissions.canDeleteData) return false
      try {
        await retentionApi.deleteSessionData(sessionId, reason)
        await refreshSessions()
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canDeleteData, refreshAudit, refreshSessions],
  )

  const exportSession = useCallback(
    async (sessionId: string): Promise<RetentionExport | null> => {
      if (!permissions.canExportData) return null
      try {
        const payload = await retentionApi.exportSessionRetention(sessionId)
        refreshAudit()
        return payload
      } catch {
        return null
      }
    },
    [permissions.canExportData, refreshAudit],
  )

  const extendSessionRetention = useCallback(
    async (sessionId: string, days: number): Promise<boolean> => {
      if (!permissions.canExtendRetention) return false
      try {
        await retentionApi.extendSessionRetention(sessionId, days)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canExtendRetention, refreshAudit],
  )

  /* ---------------- Unified anonymisation (P0-7) ---------------- */

  const previewAnonymisation = useCallback(
    async (text: string, language?: LanguageCode, sessionId?: string): Promise<AnonymisationPreviewResult | null> => {
      if (!permissions.canPreviewAnonymisation) return null
      try {
        return await anonymisationApi.previewText({ text, language, sessionId })
      } catch {
        return null
      }
    },
    [permissions.canPreviewAnonymisation],
  )

  const refreshAnonymisationReports = useCallback(
    async (sessionId?: string): Promise<void> => {
      if (!permissions.canViewAnonymisationReport) return
      setAnonymisationLoading(true)
      try {
        setAnonymisationReports(await anonymisationApi.fetchReports(sessionId))
      } catch {
        setAnonymisationReports([])
      } finally {
        setAnonymisationLoading(false)
      }
    },
    [permissions.canViewAnonymisationReport],
  )

  const refreshSessionAnonymisationReport = useCallback(
    async (sessionId: string): Promise<AnonymisationReport | null> => {
      if (!permissions.canViewAnonymisationReport) return null
      try {
        const report = await anonymisationApi.fetchSessionReport(sessionId)
        setSessionAnonymisationReports((prev) => ({ ...prev, [sessionId]: report }))
        return report
      } catch {
        return null
      }
    },
    [permissions.canViewAnonymisationReport],
  )

  const submitAnonymisationFeedback = useCallback(
    async (input: {
      reportId: string
      modality: PIIModality
      matchIndex: number
      verdict: ReviewerVerdict
      note?: string
      sessionId?: string
    }): Promise<boolean> => {
      if (!permissions.canSubmitAnonymisationFeedback) return false
      try {
        await anonymisationApi.submitFeedback(input)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canSubmitAnonymisationFeedback, refreshAudit],
  )

  const refreshAnonymisationMetrics = useCallback(async (): Promise<void> => {
    if (!permissions.canViewAnonymisationMetrics) return
    try {
      setAnonymisationMetrics(await anonymisationApi.fetchMetrics())
    } catch {
      setAnonymisationMetrics(null)
    }
  }, [permissions.canViewAnonymisationMetrics])

  const refreshAnonymisationPatterns = useCallback(async (): Promise<void> => {
    if (!permissions.canViewPatternInventory) return
    try {
      setAnonymisationPatterns(await anonymisationApi.fetchPatternInventory())
    } catch {
      setAnonymisationPatterns(null)
    }
  }, [permissions.canViewPatternInventory])

  const runAnonymisationLeakTests = useCallback(async (): Promise<HarnessResult | null> => {
    if (!permissions.canRunLeakTest) return null
    try {
      return await anonymisationApi.runLeakTests()
    } catch {
      return null
    }
  }, [permissions.canRunLeakTest])

  const refreshSessionConfidence = useCallback(
    async (sessionId: string): Promise<SessionConfidence | null> => {
      if (!permissions.canViewConfidence) return null
      setConfidenceLoading((prev) => ({ ...prev, [sessionId]: true }))
      try {
        const [confidence, actions] = await Promise.all([
          confidenceApi.fetchSessionConfidence(sessionId),
          confidenceApi.fetchReviewActions(sessionId),
        ])
        setConfidencesBySession((prev) => ({ ...prev, [sessionId]: confidence }))
        setConfidenceReviewActions((prev) => ({ ...prev, [sessionId]: actions }))
        return confidence
      } catch {
        return null
      } finally {
        setConfidenceLoading((prev) => ({ ...prev, [sessionId]: false }))
      }
    },
    [permissions.canViewConfidence],
  )

  const recomputeSessionConfidence = useCallback(
    async (sessionId: string): Promise<SessionConfidence | null> => {
      if (!permissions.canRecomputeConfidence) return null
      setConfidenceLoading((prev) => ({ ...prev, [sessionId]: true }))
      try {
        const confidence = await confidenceApi.recomputeSessionConfidence(sessionId)
        setConfidencesBySession((prev) => ({ ...prev, [sessionId]: confidence }))
        refreshAudit()
        return confidence
      } catch {
        return null
      } finally {
        setConfidenceLoading((prev) => ({ ...prev, [sessionId]: false }))
      }
    },
    [permissions.canRecomputeConfidence, refreshAudit],
  )

  const reviewLowConfidenceItem = useCallback(
    async (input: {
      sessionId: string
      itemType: LowConfidenceItemType
      itemId: string
      verdict: LowConfidenceVerdict
      reason?: string
    }): Promise<boolean> => {
      if (!permissions.canReviewConfidence) return false
      try {
        await confidenceApi.reviewLowConfidenceItem(input)
        const actions = await confidenceApi.fetchReviewActions(input.sessionId)
        setConfidenceReviewActions((prev) => ({ ...prev, [input.sessionId]: actions }))
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canReviewConfidence, refreshAudit],
  )

  const refreshConfidencePolicy = useCallback(async (): Promise<void> => {
    if (!permissions.canViewConfidencePolicy) return
    try {
      setConfidencePolicy(await confidenceApi.fetchPolicy())
    } catch {
      setConfidencePolicy(null)
    }
  }, [permissions.canViewConfidencePolicy])

  const saveConfidencePolicy = useCallback(
    async (patch: Partial<ConfidenceThresholds>): Promise<boolean> => {
      if (!permissions.canEditConfidencePolicy) return false
      try {
        const policy = await confidenceApi.updatePolicy(patch)
        setConfidencePolicy(policy)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canEditConfidencePolicy, refreshAudit],
  )

  /* ---------------- Clinician feedback (P2-15) ---------------- */

  const refreshSessionFeedback = useCallback(
    async (sessionId: string): Promise<Feedback[] | null> => {
      if (!permissions.canViewFeedback) return null
      setFeedbackLoading((prev) => ({ ...prev, [sessionId]: true }))
      try {
        const list = await feedbackApi.fetchFeedbackForSession(sessionId)
        setFeedbackBySession((prev) => ({ ...prev, [sessionId]: list }))
        return list
      } catch {
        return null
      } finally {
        setFeedbackLoading((prev) => ({ ...prev, [sessionId]: false }))
      }
    },
    [permissions.canViewFeedback],
  )

  const submitFeedback = useCallback(
    async (input: FeedbackCreateInput): Promise<boolean> => {
      if (!permissions.canSubmitFeedback) return false
      const sessionId = input.sessionId ?? null
      try {
        await feedbackApi.submitFeedback(input)
        if (sessionId) await refreshSessionFeedback(sessionId)
        refreshAudit()
        pushToast('success', FEEDBACK_SECTION_LABELS.en.recorded)
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'feedback.create',
            endpoint: '/api/feedback',
            method: 'POST',
            sessionId: sessionId ?? undefined,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { ...input },
          })
          return true
        }
        return false
      }
    },
    [permissions.canSubmitFeedback, pushToast, queueWrite, refreshAudit, refreshSessionFeedback, role, user?.id],
  )

  const updateFeedback = useCallback(
    async (id: string, patch: FeedbackUpdateInput): Promise<boolean> => {
      if (!permissions.canSubmitFeedback) return false
      try {
        const updated = await feedbackApi.updateFeedback(id, patch)
        if (updated.sessionId) await refreshSessionFeedback(updated.sessionId)
        refreshAudit()
        pushToast('success', FEEDBACK_SECTION_LABELS.en.updated)
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'feedback.update',
            endpoint: `/api/feedback/${encodeURIComponent(id)}`,
            method: 'PATCH',
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { feedbackId: id, ...patch },
          })
          return true
        }
        return false
      }
    },
    [permissions.canSubmitFeedback, pushToast, queueWrite, refreshAudit, refreshSessionFeedback, role, user?.id],
  )

  const deleteFeedback = useCallback(
    async (id: string): Promise<boolean> => {
      if (!permissions.canSubmitFeedback) return false
      try {
        const removed = await feedbackApi.deleteFeedback(id)
        if (removed.sessionId) await refreshSessionFeedback(removed.sessionId)
        refreshAudit()
        pushToast('success', FEEDBACK_SECTION_LABELS.en.deleted)
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'feedback.delete',
            endpoint: `/api/feedback/${encodeURIComponent(id)}`,
            method: 'DELETE',
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { feedbackId: id },
          })
          return true
        }
        return false
      }
    },
    [permissions.canSubmitFeedback, pushToast, queueWrite, refreshAudit, refreshSessionFeedback, role, user?.id],
  )

  const refreshFeedbackDashboard = useCallback(async (): Promise<FeedbackDashboard | null> => {
    if (!permissions.canViewFeedbackDashboard) return null
    try {
      const dashboard = await feedbackApi.fetchDashboard()
      setFeedbackDashboard(dashboard)
      return dashboard
    } catch {
      return null
    }
  }, [permissions.canViewFeedbackDashboard])

  const refreshFeedbackAggregate = useCallback(
    async (range: { since?: string; until?: string } = {}): Promise<FeedbackAggregate | null> => {
      if (!permissions.canViewFeedbackDashboard) return null
      try {
        const aggregate = await feedbackApi.fetchAggregate(range)
        setFeedbackAggregate(aggregate)
        return aggregate
      } catch {
        return null
      }
    },
    [permissions.canViewFeedbackDashboard],
  )

  const exportFeedback = useCallback(
    async (input: FeedbackExportRequest = {}): Promise<FeedbackExport | null> => {
      if (!permissions.canExportFeedback) return null
      try {
        const result = await feedbackApi.exportFeedback(input)
        refreshAudit()
        return result
      } catch {
        return null
      }
    },
    [permissions.canExportFeedback, refreshAudit],
  )

  // Initial load: sessions + audit trail + per-session reports from the backend.
  useEffect(() => {
    let alive = true
    api
      .fetchSessions()
      .then(async (list) => {
        if (!alive) return
        setSessions(list.sessions.map(api.sessionFromApi))
        const views = await Promise.all(list.sessions.map((s) => reportApi.fetchSessionReports(s.id).catch(() => null)))
        const visualViews = await Promise.all(list.sessions.map((s) => visualApi.fetchSessionVisuals(s.id).catch(() => null)))
        const timelineViews = await Promise.all(
          list.sessions.map((s) => timelineApi.fetchTimeline(s.id).catch(() => null)),
        )
        const followUpViews = await Promise.all(
          list.sessions.map((s) => followUpApi.fetchSessionFollowUps(s.id).catch(() => null)),
        )
        if (!alive) return
        const merged: Record<string, ReportsView> = {}
        list.sessions.forEach((s, i) => {
          const view = views[i]
          if (view) merged[s.id] = view
        })
        setReportsBySession(merged)
        const mergedVisuals: Record<string, VisualsView> = {}
        list.sessions.forEach((s, i) => {
          const view = visualViews[i]
          if (view) mergedVisuals[s.id] = view
        })
        setVisualsBySession(mergedVisuals)
        const mergedTimelines: Record<string, Timeline | null> = {}
        list.sessions.forEach((s, i) => {
          mergedTimelines[s.id] = timelineViews[i]
        })
        setTimelinesBySession(mergedTimelines)
        const mergedFollowUps: Record<string, FollowUpQuestion[]> = {}
        list.sessions.forEach((s, i) => {
          const questions = followUpViews[i]
          if (questions) mergedFollowUps[s.id] = questions
        })
        setFollowUpsBySession(mergedFollowUps)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not reach the backend.')
      })
      .finally(() => {
        if (alive) setBooted(true)
      })
    api
      .fetchAudit()
      .then((log) => {
        if (alive) setAudit(log.entries)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // Retention policy + history load for staff once the role is known.
  useEffect(() => {
    if (role === 'doctor' || role === 'admin') void refreshRetention()
  }, [role, refreshRetention])

  /** Apply a fresh reports view for a session, whatever its source. */
  const applyReportsView = useCallback((sessionId: string, view: ReportsView) => {
    setReportsBySession((prev) => ({ ...prev, [sessionId]: view }))
  }, [])

  /** Apply a fresh visuals view for a session, whatever its source. */
  const applyVisualsView = useCallback((sessionId: string, view: VisualsView) => {
    setVisualsBySession((prev) => ({ ...prev, [sessionId]: view }))
  }, [])

  /** Client-only events (viewing, role switch, consent) are logged by the frontend. */
  const record = useCallback(
    (action: AuditAction, detail: string, sessionId: string, category: AuditCategory) => {
      api
        .postAudit({ sessionId, actor, role, action, detail, category })
        .then(refreshAudit)
        .catch((e: unknown) => {
          if (isNetworkError(e)) {
            void queueWrite({
              actionType: 'audit.log',
              endpoint: '/api/audit',
              method: 'POST',
              sessionId,
              actorId: user?.id ?? 'anonymous',
              actorRole: role,
              payload: { action, detail, sessionId, category },
            })
          }
        })
    },
    [actor, queueWrite, refreshAudit, role, user?.id],
  )

  /** Replace a session with the server's version, keeping client-only inputs. */
  const applyServerSession = useCallback((server: api.ApiSession) => {
    setSessions((prev) => {
      const next = api.sessionFromApi(server)
      const existing = prev.find((s) => s.id === server.id)
      if (!existing) return [next, ...prev]
      return prev.map((s) =>
        s.id === server.id
          ? {
              ...next,
              raw: { ...next.raw, voice: s.raw.voice, image: s.raw.image, document: s.raw.document },
              consent: s.consent,
            }
          : s,
      )
    })
  }, [])

  const selectSession = useCallback(
    (id: string) => {
      setActiveId((current) => {
        if (current !== id) record('session.viewed', 'Opened session detail (source material + AI draft note).', id, 'view')
        return id
      })
    },
    [record],
  )

  const clearSelection = useCallback(() => setActiveId(null), [])

  const createSession = useCallback(
    async (input: IntakeSubmission): Promise<string | null> => {
      setWorking(true)
      setError(null)
      try {
        if (!input.consentAcknowledged) {
          throw new api.ApiError('Consent and the non-diagnostic acknowledgement are required before processing.', 400)
        }
        const { session } = await api.createSession({
          patientId: input.patientId,
          text: input.text,
          language: input.language,
          ageBand: input.ageBand,
          sex: input.sex,
          intakePoint: input.intakePoint,
          consentAcknowledged: input.consentAcknowledged,
          role,
          actor,
        })

        const mapped = api.sessionFromApi(session)
        const withInputs: PatientSession = {
          ...mapped,
          raw: { ...mapped.raw, voice: input.voice, image: input.image, document: input.document },
          consent: {
            granted: true,
            nonDiagnosticAcknowledged: true,
            purposes: ['Symptom organisation', 'Report processing', 'Healthcare-worker review'],
            at: new Date().toISOString(),
            policyVersion: CONSENT_POLICY_VERSION,
          },
        }
        setSessions((prev) => [withInputs, ...prev])
        setActiveId(withInputs.id)
        setReportsBySession((prev) => ({
          ...prev,
          [withInputs.id]: { reports: [], merged: null },
        }))
        setVisualsBySession((prev) => ({
          ...prev,
          [withInputs.id]: { visuals: [], disclaimer: '' },
        }))
        // P0-4: the backend auto-builds the timeline draft at intake; load it so
        // the done screen and review queue can show it right away.
        refreshSessionTimeline(withInputs.id)
        // P0-5: the backend auto-generates follow-up questions at intake too.
        refreshSessionFollowUps(withInputs.id)

        record('consent.granted', `Consent captured · non-diagnostic policy ${CONSENT_POLICY_VERSION} acknowledged.`, withInputs.id, 'auth')
        record(
          'session.created',
          `Session created via API · ${mapped.anonymization.redactedCount} PII marker(s) stripped · risk ${mapped.triageNote?.riskScore ?? '—'}.`,
          withInputs.id,
          'system',
        )
        return withInputs.id
      } catch (e) {
        if (isNetworkError(e)) {
          // Offline intake: show an optimistic, clearly-pending local session and
          // queue the write. The backend runs anonymisation + analysis on sync.
          const tempId = `offline-${Date.now().toString(36)}`
          const now = new Date().toISOString()
          const optimistic: PatientSession = {
            id: tempId,
            patientId: input.patientId,
            demographics: {
              patientId: input.patientId,
              ageBand: input.ageBand,
              sex: input.sex,
              facility: 'Pending sync',
              intakePoint: input.intakePoint,
            },
            raw: { text: input.text, voice: input.voice, image: input.image, document: input.document, language: input.language },
            displayText: input.text,
            anonymization: { redactedCount: 0, redactions: [], appliedAt: now },
            triageNote: null,
            referral: null,
            status: 'processing',
            consent: {
              granted: true,
              nonDiagnosticAcknowledged: true,
              purposes: ['Symptom organisation', 'Report processing', 'Healthcare-worker review'],
              at: now,
              policyVersion: CONSENT_POLICY_VERSION,
            },
            overrides: [],
            createdBy: actor,
            createdAt: now,
            updatedAt: now,
          }
          setSessions((prev) => [optimistic, ...prev])
          setActiveId(tempId)
          setReportsBySession((prev) => ({ ...prev, [tempId]: { reports: [], merged: null } }))
          setVisualsBySession((prev) => ({ ...prev, [tempId]: { visuals: [], disclaimer: '' } }))
          await queueWrite({
            actionType: input.voice?.transcript ? 'intake.create-voice' : 'intake.create-text',
            endpoint: '/api/sessions',
            method: 'POST',
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: {
              patientId: input.patientId,
              text: input.text,
              language: input.language,
              ageBand: input.ageBand,
              sex: input.sex,
              intakePoint: input.intakePoint,
              consentAcknowledged: input.consentAcknowledged,
              role,
              actor,
            },
          })
          return tempId
        }
        setError(e instanceof Error ? e.message : 'The backend could not process this intake.')
        return null
      } finally {
        setWorking(false)
      }
    },
    [actor, queueWrite, record, refreshSessionFollowUps, refreshSessionTimeline, role, user?.id],
  )

  const acceptNote = useCallback(
    async (id: string): Promise<boolean> => {
      if (!permissions.canAcceptNote) return false
      try {
        const { session } = await api.setStatus(id, { status: 'accepted', role, actor })
        applyServerSession(session)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'note.accept',
            endpoint: `/api/sessions/${id}/status`,
            method: 'POST',
            sessionId: id,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { status: 'accepted', role, actor, baseUpdatedAt: baseVersionOf(id) },
          })
          return true
        }
        return false
      }
    },
    [actor, applyServerSession, baseVersionOf, permissions.canAcceptNote, queueWrite, refreshAudit, role, user?.id],
  )

  const saveOverride = useCallback(
    async (id: string, next: StructuredTriageNote): Promise<boolean> => {
      if (!permissions.canEditNote) return false
      try {
        const { session, changed } = await api.updateNote(id, { structuredNote: next, role, actor })
        if (changed.length === 0) return false
        applyServerSession(session)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'note.edit',
            endpoint: `/api/sessions/${id}/note`,
            method: 'PATCH',
            sessionId: id,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { structuredNote: next, role, actor, baseUpdatedAt: baseVersionOf(id) },
          })
          return true
        }
        return false
      }
    },
    [actor, applyServerSession, baseVersionOf, permissions.canEditNote, queueWrite, refreshAudit, role, user?.id],
  )

  const finalizeNote = useCallback(
    async (id: string): Promise<boolean> => {
      if (!permissions.canFinalizeNote) return false
      try {
        const { session } = await api.setStatus(id, { status: 'accepted', role, actor, action: 'finalized' })
        applyServerSession(session)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'note.finalize',
            endpoint: `/api/sessions/${id}/status`,
            method: 'POST',
            sessionId: id,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { status: 'accepted', role, actor, action: 'finalized', baseUpdatedAt: baseVersionOf(id) },
          })
          return true
        }
        return false
      }
    },
    [actor, applyServerSession, baseVersionOf, permissions.canFinalizeNote, queueWrite, refreshAudit, role, user?.id],
  )

  const escalateSession = useCallback(
    async (id: string, toFacility: string, reason: string): Promise<boolean> => {
      if (!permissions.canDraftReferral) return false
      try {
        const { session } = await api.createReferral(id, { toFacility, reason, role, actor })
        applyServerSession(session)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'referral.draft',
            endpoint: `/api/sessions/${id}/referral`,
            method: 'POST',
            sessionId: id,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { toFacility, reason, role, actor, baseUpdatedAt: baseVersionOf(id) },
          })
          return true
        }
        return false
      }
    },
    [actor, applyServerSession, baseVersionOf, permissions.canDraftReferral, queueWrite, refreshAudit, role, user?.id],
  )

  const approveReferral = useCallback(
    async (id: string): Promise<boolean> => {
      if (!permissions.canApproveReferral) return false
      try {
        const { session } = await api.approveReferral(id, { role, actor })
        applyServerSession(session)
        refreshAudit()
        return true
      } catch (e) {
        if (isNetworkError(e)) {
          await queueWrite({
            actionType: 'referral.approve',
            endpoint: `/api/sessions/${id}/referral/approve`,
            method: 'POST',
            sessionId: id,
            actorId: user?.id ?? 'anonymous',
            actorRole: role,
            payload: { role, actor, baseUpdatedAt: baseVersionOf(id) },
          })
          return true
        }
        return false
      }
    },
    [actor, applyServerSession, baseVersionOf, permissions.canApproveReferral, queueWrite, refreshAudit, role, user?.id],
  )

  const resetError = useCallback(() => setError(null), [])

  /** Staff-only live draft preview: analyze is a nurse/doctor endpoint. */
  const previewNote = useCallback(
    async (text: string, analyzeLanguage?: IntakeLanguage): Promise<languageApi.TriageAnalyzeResult | null> => {
      if (!permissions.canEditNote) return null
      try {
        return await languageApi.analyzeText(text, analyzeLanguage ?? language)
      } catch {
        return null
      }
    },
    [permissions.canEditNote, language],
  )

  /** Upload reports to a session: on success stores the session view + results, on failure returns the backend message. */
  const uploadReportsToSession = useCallback(
    async (
      sessionId: string,
      files: File[],
    ): Promise<{ ok: boolean; error?: string; results: ReportExtractionResult[] }> => {
      if (!permissions.canUploadReports) return { ok: false, error: 'Your role cannot upload reports.', results: [] }
      try {
        const response = await reportApi.uploadSessionReports(sessionId, files)
        applyReportsView(sessionId, { reports: response.reports, merged: response.merged })
        refreshAudit()
        return { ok: true, results: response.processing }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'The backend could not process the upload.',
          results: [],
        }
      }
    },
    [applyReportsView, permissions.canUploadReports, refreshAudit],
  )

  const verifyReport = useCallback(
    async (sessionId: string, reportId: string, note?: string): Promise<boolean> => {
      if (!permissions.canReviewReports) return false
      try {
        const { report, merged } = await reportApi.verifyReport(reportId, note)
        const { reports } = await reportApi.fetchSessionReports(sessionId)
        applyReportsView(sessionId, { reports, merged })
        refreshAudit()
        return report.status === 'verified'
      } catch {
        return false
      }
    },
    [applyReportsView, permissions.canReviewReports, refreshAudit],
  )

  const rejectReport = useCallback(
    async (sessionId: string, reportId: string, reason: string): Promise<boolean> => {
      if (!permissions.canReviewReports) return false
      try {
        const { merged } = await reportApi.rejectReport(reportId, reason)
        const reports = await reportApi.fetchSessionReports(sessionId).then((r) => r.reports)
        applyReportsView(sessionId, { reports, merged })
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyReportsView, permissions.canReviewReports, refreshAudit],
  )

  const deleteSessionReport = useCallback(
    async (sessionId: string, reportId: string): Promise<boolean> => {
      if (!permissions.canReviewReports) return false
      try {
        const { reports, merged } = await reportApi.deleteReport(reportId)
        applyReportsView(sessionId, { reports, merged })
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyReportsView, permissions.canReviewReports, refreshAudit],
  )

  /** Upload photos to a session: on success stores the session view + results, on failure returns the backend message. */
  const uploadVisualsToSession = useCallback(
    async (
      sessionId: string,
      files: File[],
      visualType?: string,
    ): Promise<{ ok: boolean; error?: string; results: VisualExtractionResult[] }> => {
      if (!permissions.canUploadVisuals) return { ok: false, error: 'Your role cannot upload photos.', results: [] }
      try {
        const response = await visualApi.uploadSessionVisuals(sessionId, files, visualType)
        applyVisualsView(sessionId, { visuals: response.visuals, disclaimer: response.disclaimer })
        refreshAudit()
        return { ok: true, results: response.processing }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'The backend could not process the upload.',
          results: [],
        }
      }
    },
    [applyVisualsView, permissions.canUploadVisuals, refreshAudit],
  )

  const verifyVisual = useCallback(
    async (sessionId: string, visualId: string, note?: string): Promise<boolean> => {
      if (!permissions.canReviewVisuals) return false
      try {
        const { visual } = await visualApi.verifyVisual(visualId, note)
        await refreshSessionVisuals(sessionId)
        refreshAudit()
        return visual.status === 'verified'
      } catch {
        return false
      }
    },
    [permissions.canReviewVisuals, refreshAudit, refreshSessionVisuals],
  )

  const rejectVisual = useCallback(
    async (sessionId: string, visualId: string, reason: string): Promise<boolean> => {
      if (!permissions.canReviewVisuals) return false
      try {
        await visualApi.rejectVisual(visualId, reason)
        await refreshSessionVisuals(sessionId)
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [permissions.canReviewVisuals, refreshAudit, refreshSessionVisuals],
  )

  const deleteSessionVisual = useCallback(
    async (sessionId: string, visualId: string): Promise<boolean> => {
      if (!permissions.canReviewVisuals) return false
      try {
        const { visuals, disclaimer } = await visualApi.deleteVisual(visualId)
        applyVisualsView(sessionId, { visuals, disclaimer })
        refreshAudit()
        return true
      } catch {
        return false
      }
    },
    [applyVisualsView, permissions.canReviewVisuals, refreshAudit],
  )

  const activeSession = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId])

  const value = useMemo<TriageContextValue>(
    () => ({
      sessions,
      activeSession,
      activeId,
      audit,
      permissions,
      role,
      working,
      error,
      booted,
      language,
      setLanguage,
      detectedLanguage,
      setDetectedLanguage,
      createSession,
      selectSession,
      clearSelection,
      acceptNote,
      saveOverride,
      finalizeNote,
      askFollowUp,
      answerFollowUp,
      escalateSession,
      approveReferral,
      previewNote,
      resetError,
      reportsBySession,
      uploadReportsToSession,
      refreshSessionReports,
      verifyReport,
      rejectReport,
      deleteSessionReport,
      visualsBySession,
      uploadVisualsToSession,
      refreshSessionVisuals,
      verifyVisual,
      rejectVisual,
      deleteSessionVisual,
      timelinesBySession,
      timelineLoading,
      refreshSessionTimeline,
      buildSessionTimeline,
      regenerateSessionTimeline,
      acceptSessionTimeline,
      addTimelineEvent,
      editTimelineEvent,
      removeTimelineEvent,
      followUpsBySession,
      followUpLoading,
      refreshSessionFollowUps,
      generateSessionFollowUps,
      regenerateSessionFollowUps,
      addClinicianFollowUp,
      answerFollowUpInLanguage,
      skipSessionFollowUp,
      editSessionFollowUp,
      deleteSessionFollowUp,
      reorderSessionFollowUps,
      retentionPolicy,
      retentionActions,
      retentionTombstones,
      retentionStatus,
      retentionLoading,
      refreshRetention,
      refreshRetentionStatus,
      refreshRetentionTombstones,
      saveRetentionPolicyRules,
      runRetentionJob,
      refreshSessions,
      fetchSessionConsent,
      revokeSessionConsent,
      deleteSessionData,
      exportSession,
      extendSessionRetention,
      anonymisationReports,
      sessionAnonymisationReports,
      anonymisationLoading,
      anonymisationMetrics,
      anonymisationPatterns,
      previewAnonymisation,
      refreshAnonymisationReports,
      refreshSessionAnonymisationReport,
      submitAnonymisationFeedback,
      refreshAnonymisationMetrics,
      refreshAnonymisationPatterns,
      runAnonymisationLeakTests,
      confidencesBySession,
      confidenceReviewActions,
      confidenceLoading,
      confidencePolicy,
      refreshSessionConfidence,
      recomputeSessionConfidence,
      reviewLowConfidenceItem,
      refreshConfidencePolicy,
      saveConfidencePolicy,
      feedbackBySession,
      feedbackLoading,
      feedbackDashboard,
      feedbackAggregate,
      refreshSessionFeedback,
      submitFeedback,
      updateFeedback,
      deleteFeedback,
      refreshFeedbackDashboard,
      refreshFeedbackAggregate,
      exportFeedback,
    }),
    [
      sessions,
      activeSession,
      activeId,
      audit,
      permissions,
      role,
      working,
      error,
      booted,
      language,
      setLanguage,
      detectedLanguage,
      setDetectedLanguage,
      createSession,
      selectSession,
      clearSelection,
      acceptNote,
      saveOverride,
      finalizeNote,
      askFollowUp,
      answerFollowUp,
      escalateSession,
      approveReferral,
      previewNote,
      resetError,
      reportsBySession,
      uploadReportsToSession,
      refreshSessionReports,
      verifyReport,
      rejectReport,
      deleteSessionReport,
      visualsBySession,
      uploadVisualsToSession,
      refreshSessionVisuals,
      verifyVisual,
      rejectVisual,
      deleteSessionVisual,
      timelinesBySession,
      timelineLoading,
      refreshSessionTimeline,
      buildSessionTimeline,
      regenerateSessionTimeline,
      acceptSessionTimeline,
      addTimelineEvent,
      editTimelineEvent,
      removeTimelineEvent,
      followUpsBySession,
      followUpLoading,
      refreshSessionFollowUps,
      generateSessionFollowUps,
      regenerateSessionFollowUps,
      addClinicianFollowUp,
      answerFollowUpInLanguage,
      skipSessionFollowUp,
      editSessionFollowUp,
      deleteSessionFollowUp,
      reorderSessionFollowUps,
      retentionPolicy,
      retentionActions,
      retentionTombstones,
      retentionStatus,
      retentionLoading,
      refreshRetention,
      refreshRetentionStatus,
      refreshRetentionTombstones,
      saveRetentionPolicyRules,
      runRetentionJob,
      refreshSessions,
      fetchSessionConsent,
      revokeSessionConsent,
      deleteSessionData,
      exportSession,
      extendSessionRetention,
      anonymisationReports,
      sessionAnonymisationReports,
      anonymisationLoading,
      anonymisationMetrics,
      anonymisationPatterns,
      previewAnonymisation,
      refreshAnonymisationReports,
      refreshSessionAnonymisationReport,
      submitAnonymisationFeedback,
      refreshAnonymisationMetrics,
      refreshAnonymisationPatterns,
      runAnonymisationLeakTests,
      confidencesBySession,
      confidenceReviewActions,
      confidenceLoading,
      confidencePolicy,
      refreshSessionConfidence,
      recomputeSessionConfidence,
      reviewLowConfidenceItem,
      refreshConfidencePolicy,
      saveConfidencePolicy,
      feedbackBySession,
      feedbackLoading,
      feedbackDashboard,
      feedbackAggregate,
      refreshSessionFeedback,
      submitFeedback,
      updateFeedback,
      deleteFeedback,
      refreshFeedbackDashboard,
      refreshFeedbackAggregate,
      exportFeedback,
    ],
  )

  return <TriageContext.Provider value={value}>{children}</TriageContext.Provider>
}

export function useTriage(): TriageContextValue {
  const ctx = useContext(TriageContext)
  if (!ctx) throw new Error('useTriage must be used within TriageProvider')
  return ctx
}
