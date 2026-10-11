import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AUDIT_EVENTS, CASES, CAMPS, DEFAULT_SETTINGS, REPORTS } from '../data/demoData'
import type {
  AuditEvent,
  CaseRecord,
  Correction,
  Report,
  Role,
  UrgencySignal,
} from '../types'

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`

interface Toast {
  id: string
  kind: 'success' | 'info' | 'warning' | 'error'
  text: string
}

interface AppState {
  role: Role
  offlineMode: boolean
  cases: CaseRecord[]
  reports: Report[]
  audit: AuditEvent[]
  toasts: Toast[]
  setRole: (role: Role) => void
  setOfflineMode: (on: boolean) => void
  addCase: (input: Partial<CaseRecord>) => CaseRecord
  updateCase: (caseId: string, patch: Partial<CaseRecord>) => void
  verifyField: (caseId: string, symptomId: string, verifiedBy: string) => void
  verifyReportField: (reportId: string, fieldId: string) => void
  addCorrection: (correction: Omit<Correction, 'id'>) => void
  answerQuestion: (caseId: string, questionId: string, answer: string) => void
  acknowledgeSignal: (caseId: string, signalId: string) => void
  setReviewStatus: (caseId: string, status: CaseRecord['reviewStatus']) => void
  createReferral: (caseId: string) => void
  approveReferral: (caseId: string, approvedBy: string) => void
  patchReferral: (caseId: string, patch: Partial<CaseRecord['referral']>) => void
  addReport: (report: Report) => void
  addAudioEvent: (caseId: string, action: string) => void
  pushToast: (kind: Toast['kind'], text: string) => void
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Least privilege until a real session loads — AuthContext overwrites this
  // with the role the server issued for the signed-in user.
  const [role, setRole] = useState<Role>('patient')
  const [offlineMode, setOfflineMode] = useState(false)
  const [cases, setCases] = useState<CaseRecord[]>(CASES)
  const [reports, setReports] = useState<Report[]>(REPORTS)
  const [audit, setAudit] = useState<AuditEvent[]>(AUDIT_EVENTS)
  const [toasts, setToasts] = useState<Toast[]>([])

  const nowTime = () =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    // Dedupe consecutive identical toasts and keep a maximum of three on
    // screen. Auto-dismiss is owned by ToastStack so it can pause on hover.
    setToasts((t) => {
      const deduped = t.filter((x) => x.text !== text || x.kind !== kind)
      const trimmed = deduped.length >= 3 ? deduped.slice(deduped.length - 2) : deduped
      return [...trimmed, { id: uid('toast'), kind, text }]
    })
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const addAudit = useCallback(
    (caseId: string, actor: string, roleLabel: string, action: string) => {
      setAudit((prev) => [
        { id: uid('a'), caseId, time: nowTime(), actor, role: roleLabel, action },
        ...prev,
      ])
    },
    [],
  )

  const addCase = useCallback(
    (input: Partial<CaseRecord>): CaseRecord => {
      const existing = cases.length
      const id = `case-${String(existing + 1).padStart(4, '0')}`
      const num = new Date().getFullYear()
      const patientId = `SYN-${num}-${String(existing + 1).padStart(3, '0')}`
      const time = nowTime()
      const record: CaseRecord = {
        language: 'English',
        mode: 'opd',
        chiefConcern: '',
        symptoms: [],
        timeline: [],
        reportedHistory: [],
        reportedMedications: [],
        missingInfo: [],
        completeness: 0,
        followUpQuestions: [],
        urgencySignals: [],
        reviewStatus: 'awaiting-nurse',
        consent: { status: 'granted', at: time, purpose: ['Symptom organisation', 'Healthcare-worker review'] },
        reportIds: [],
        createdAt: time,
        updatedAt: time,
        reporter: 'Patient (self)',
        corrections: [],
        referral: null,
        ...input,
        id,
        patientId,
      }
      setCases((prev) => [record, ...prev])
      addAudit(id, 'Patient / staff', 'Patient', 'Case created · intake · consent captured')
      return record
    },
    [cases.length, addAudit],
  )

  const updateCase = useCallback(
    (caseId: string, patch: Partial<CaseRecord>) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? { ...c, ...patch, updatedAt: nowTime() }
            : c,
        ),
      )
    },
    [],
  )

  const verifyField = useCallback(
    (caseId: string, symptomId: string, verifiedBy: string) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                symptoms: c.symptoms.map((s) =>
                  s.id === symptomId ? { ...s, status: 'verified' } : s,
                ),
                updatedAt: nowTime(),
              }
            : c,
        ),
      )
      addAudit(caseId, verifiedBy, role === 'doctor' ? 'Doctor' : 'Nurse', 'Verified extracted symptom field')
    },
    [addAudit, role],
  )

  const verifyReportField = useCallback(
    (reportId: string, fieldId: string) => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                fields: r.fields.map((f) =>
                  f.id === fieldId ? { ...f, status: 'verified' } : f,
                ),
              }
            : r,
        ),
      )
    },
    [],
  )

  const addCorrection = useCallback(
    (correction: Omit<Correction, 'id'>) => {
      const c: Correction = {
        ...correction,
        id: uid('c'),
        time: correction.time || nowTime(),
      }
      setCases((prev) =>
        prev.map((x) =>
          x.id === correction.caseId
            ? { ...x, corrections: [...x.corrections, c], updatedAt: nowTime() }
            : x,
        ),
      )
      addAudit(
        correction.caseId,
        correction.reviewer,
        correction.role,
        `Correction recorded: ${correction.field} → “${correction.humanValue}”`,
      )
    },
    [addAudit],
  )

  const answerQuestion = useCallback((caseId: string, questionId: string, answer: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? {
              ...c,
              followUpQuestions: c.followUpQuestions.map((q) =>
                q.id === questionId
                  ? { ...q, status: 'answered', answer, answeredAt: nowTime() }
                  : q,
              ),
              updatedAt: nowTime(),
            }
          : c,
      ),
    )
  }, [])

  const acknowledgeSignal = useCallback((caseId: string, signalId: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? {
              ...c,
              urgencySignals: c.urgencySignals.map((s) =>
                s.id === signalId ? { ...s, status: 'acknowledged' } : s,
              ),
              updatedAt: nowTime(),
            }
          : c,
      ),
    )
  }, [])

  const setReviewStatus = useCallback(
    (caseId: string, status: CaseRecord['reviewStatus']) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId ? { ...c, reviewStatus: status, updatedAt: nowTime() } : c,
        ),
      )
      addAudit(caseId, role === 'doctor' ? 'Doctor' : 'Health Worker', role === 'doctor' ? 'Doctor' : 'Nurse', `Review status → ${status}`)
    },
    [addAudit, role],
  )

  const createReferral = useCallback(
    (caseId: string) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                referral: {
                  id: `ref-${uid('')}`,
                  caseId,
                  status: 'draft',
                  reason: 'Pending — reviewer must enter reason for referral.',
                  destinationOptions: [
                    'PHC — Routine OPD',
                    'Community Health Centre',
                    'District Hospital (General Medicine)',
                    'Specialist Facility',
                  ],
                  checklist: [
                    { label: 'Patient identifier', done: true },
                    { label: 'Chief concern', done: true },
                    { label: 'Timeline', done: true },
                    { label: 'Relevant reports', done: c.reportIds.length > 0 },
                    { label: 'Required information', done: false },
                    { label: 'Healthcare worker review', done: true },
                    { label: 'Doctor approval', done: false },
                  ],
                },
                updatedAt: nowTime(),
              }
            : c,
        ),
      )
      addAudit(caseId, 'Doctor', 'Doctor', 'Referral draft created — awaiting doctor approval')
    },
    [addAudit],
  )

  const patchReferral = useCallback(
    (caseId: string, patch: Partial<CaseRecord['referral']>) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId && c.referral
            ? { ...c, referral: { ...c.referral, ...patch }, updatedAt: nowTime() }
            : c,
        ),
      )
    },
    [],
  )

  const approveReferral = useCallback(
    (caseId: string, approvedBy: string) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId && c.referral
            ? {
                ...c,
                referral: {
                  ...c.referral,
                  status: 'approved',
                  approvedBy,
                  approvedAt: nowTime(),
                  checklist: c.referral.checklist.map((cl) => ({ ...cl, done: true })),
                },
                updatedAt: nowTime(),
              }
            : c,
        ),
      )
      addAudit(caseId, approvedBy, 'Doctor', 'Referral approved — case packet ready for hand-off')
    },
    [addAudit],
  )

  const addReport = useCallback(
    (report: Report) => {
      setReports((prev) => [report, ...prev])
    },
    [],
  )

  const addAudioEvent = useCallback(
    (caseId: string, action: string) => {
      addAudit(caseId, 'Patient / staff', 'Patient', action)
    },
    [addAudit],
  )

  const value = useMemo<AppState>(
    () => ({
      role,
      offlineMode,
      cases,
      reports,
      audit,
      toasts,
      setRole,
      setOfflineMode,
      addCase,
      updateCase,
      verifyField,
      verifyReportField,
      addCorrection,
      answerQuestion,
      acknowledgeSignal,
      setReviewStatus,
      createReferral,
      approveReferral,
      patchReferral,
      addReport,
      addAudioEvent,
      pushToast,
      dismissToast,
    }),
    [
      role,
      offlineMode,
      cases,
      reports,
      audit,
      toasts,
      addCase,
      updateCase,
      verifyField,
      verifyReportField,
      addCorrection,
      answerQuestion,
      acknowledgeSignal,
      setReviewStatus,
      createReferral,
      approveReferral,
      patchReferral,
      addReport,
      addAudioEvent,
      pushToast,
      dismissToast,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { CAMPS, DEFAULT_SETTINGS }
export type { Toast, UrgencySignal }
export const mockUid = uid