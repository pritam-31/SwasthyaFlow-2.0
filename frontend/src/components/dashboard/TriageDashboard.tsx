import type { GridColDef } from '@mui/x-data-grid-pro'
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Lock,
  MessageCircleQuestion,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTriage } from '../../context/TriageContext'
import { formatAuditTime, summarizeRedactions } from '../../lib/format'
import { ROLE_CAPABILITY_COPY, ROLE_DISPLAY } from '../../services/rbacService'
import { NON_DIAGNOSTIC_SHORT } from '../../services/safetyPolicy'
import { NOTE_SECTION_LABELS, type LanguageCode } from '../../types/language.types'
import type {
  NoteStatus,
  PatientSession,
  RiskScore,
  StructuredTriageNote,
} from '../../types/triage'
import { AppDataGrid } from '../AppDataGrid'
import { ReferralGenerator } from '../referral/ReferralNote'
import ReportList from '../reports/ReportList'
import { PriorityQueueBoard } from '../queue/PriorityQueueBoard'
import ReportUploader from '../reports/ReportUploader'
import VisualList from '../visuals/VisualList'
import VisualUploader from '../visuals/VisualUploader'
import TimelineSummaryCard from '../timeline/TimelineSummaryCard'
import FollowUpList from '../followups/FollowUpList'
import TimelineMiniBar from '../timeline/TimelineMiniBar'
import ConsentRetentionCard from '../retention/ConsentRetentionCard'
import { QueueRowRationale } from '../queue/QueueRowRationale'
import SessionAnonymisation from '../anonymisation/SessionAnonymisation'
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  Modal,
  PageHeader,
} from '../ui'

const RISK_META: Record<RiskScore, { label: string; classes: string; dot: string; rank: number }> = {
  High: { label: 'High priority', classes: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', rank: 0 },
  Medium: { label: 'Medium priority', classes: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', rank: 1 },
  Low: { label: 'Low priority', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', rank: 2 },
}

const NOTE_META: Record<NoteStatus, { label: string; classes: string }> = {
  'ai-draft': { label: 'AI draft — not yet reviewed', classes: 'bg-sky-50 text-sky-700 ring-sky-200' },
  'human-edited': { label: 'Edited by a human', classes: 'bg-violet-50 text-violet-700 ring-violet-200' },
  accepted: { label: 'Accepted by reviewer', classes: 'bg-brand-50 text-brand-700 ring-brand-200' },
  finalized: { label: 'Finalized by medical officer', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  escalated: { label: 'Escalated for referral', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
}

const QUEUE_COLUMNS: GridColDef<PatientSession>[] = [
  {
    field: 'patientId',
    headerName: 'Patient',
    flex: 1.2,
    minWidth: 220,
    renderCell: (p) => (
      <div className="flex flex-col">
        <span className="flex items-center gap-2.5 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-[11px] font-extrabold text-white">
            {p.row.patientId.slice(-3)}
          </span>
          <span>
            <span className="block font-bold text-ink-800">{p.row.patientId}</span>
            <span className="block text-[11px] text-ink-400">
              {p.row.demographics.ageBand} · {p.row.demographics.sex} · {p.row.raw.language}
            </span>
          </span>
        </span>
        <TimelineMiniBar events={p.row.triageNote?.timeline ?? []} />
      </div>
    ),
  },
  {
    field: 'risk',
    headerName: 'Review priority',
    width: 170,
    valueGetter: (_value, row) => RISK_META[row.triageNote?.riskScore ?? 'Low'].rank,
    renderCell: (p) => {
      const meta = RISK_META[p.row.triageNote?.riskScore ?? 'Low']
      return (
        <Badge className={meta.classes}>
          <span className={cx('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </Badge>
      )
    },
  },
  {
    field: 'rationale',
    headerName: 'Rationale',
    width: 220,
    sortable: false,
    filterable: false,
    renderCell: (p) => (
      <QueueRowRationale
        risk={p.row.triageNote?.riskScore ?? 'Low'}
        overrides={p.row.overrides ?? []}
        slaBreached={p.row.triageNote?.slaBreached ?? false}
      />
    ),
  },
  {
    field: 'chiefComplaint',
    headerName: 'Chief complaint (AI draft)',
    flex: 1,
    minWidth: 200,
    valueGetter: (_value, row) => row.triageNote?.structuredNote.chiefComplaint ?? '',
    renderCell: (p) => <p className="truncate text-[13px] text-ink-700">{p.row.triageNote?.structuredNote.chiefComplaint ?? '—'}</p>,
  },
  {
    field: 'flags',
    headerName: 'Flags',
    width: 90,
    align: 'left',
    headerAlign: 'left',
    valueGetter: (_value, row) => row.triageNote?.urgencyFlags.length ?? 0,
    renderCell: (p) => <span className="text-xs font-semibold text-ink-600">{p.row.triageNote?.urgencyFlags.length ?? 0}</span>,
  },
  {
    field: 'missing',
    headerName: 'Missing',
    width: 100,
    valueGetter: (_value, row) => row.triageNote?.missingInformation.length ?? 0,
    renderCell: (p) => <span className="text-xs font-semibold text-ink-600">{p.row.triageNote?.missingInformation.length ?? 0}</span>,
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 220,
    valueGetter: (_value, row) => row.status,
    renderCell: (p) => {
      const meta = NOTE_META[p.row.triageNote?.status ?? 'ai-draft']
      return <Badge className={meta.classes}>{meta.label}</Badge>
    },
  },
  {
    field: 'updatedAt',
    headerName: 'Updated',
    width: 160,
    renderCell: (p) => <span className="whitespace-nowrap text-[11px] text-ink-500">{formatAuditTime(p.row.updatedAt)}</span>,
  },
  {
    field: 'open',
    headerName: 'Open',
    width: 60,
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    renderHeader: () => <span className="sr-only">Open</span>,
    renderCell: () => <ChevronRight size={16} className="text-ink-300" />,
  },
]

export default function TriageDashboard() {
  const { sessions, activeSession, activeId, selectSession, clearSelection, permissions, role } = useTriage()
  const navigate = useNavigate()

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Human-in-the-loop review"
        title="Reviewer Dashboard"
        subtitle="Queue prioritized by review urgency, then a split view of the original inputs beside the AI-prepared note. Every action below is logged."
        action={
          <Badge className="bg-ink-100 text-ink-700 ring-ink-200" icon={<ShieldCheck size={12} />}>
            {ROLE_DISPLAY[role]}
          </Badge>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[11px] text-ink-500">
        <Lock size={13} className="shrink-0 text-brand-600" />
        <span className="font-bold text-ink-700">{ROLE_DISPLAY[role]}:</span>
        <span>{ROLE_CAPABILITY_COPY[role]}</span>
        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
          Prescribing disabled for all roles
        </span>
      </div>

      {/* ---------------- Transparent priority queue (P1-11) ---------------- */}
      <PriorityQueueBoard enabled={permissions.canViewQueue} selectedSessionId={activeId} onSelectSession={selectSession} />

      {/* ---------------- Queue ---------------- */}
      <Card
        pad={false}
        title="Queue"
        subtitle="Sorted by review priority — this ranking is a workflow label, not a diagnosis."
      >
        {sessions.length === 0 ? (
          <EmptyState
            icon={<Stethoscope size={20} />}
            title="No sessions yet"
            hint="Create one from Multimodal Intake — it will appear here with an AI-prepared draft."
          />
        ) : (
          <AppDataGrid<PatientSession>
            rows={sessions}
            columns={QUEUE_COLUMNS}
            ariaLabel="Review queue"
            getRowId={(s) => s.id}
            onRowClick={(s) => selectSession(s.id)}
            getRowClassName={(s) => (s.id === activeId ? 'bg-brand-50/60' : '')}
            hideToolbar
            hideFooter
            defaultDensity="compact"
          />
        )}
        <div className="border-t border-ink-100 px-5 py-2.5 text-[11px] text-ink-500">
          {permissions.canFinalizeNote
            ? 'You can edit, accept, finalize and approve referrals. Nothing is prescribed by this system.'
            : 'You can capture, edit and accept notes, and draft an escalation. Finalization and referral approval need a doctor.'}
        </div>
      </Card>

      {/* ---------------- Split-screen detail ---------------- */}
      {activeSession ? (
        <SessionDetail key={activeSession.id} session={activeSession} onClose={clearSelection} />
      ) : (
        <Card>
          <EmptyState
            icon={<ClipboardCheck size={20} />}
            title="Select a patient from the queue"
            hint="The split review view shows the original inputs on the left and the AI-prepared, non-diagnostic note on the right."
          />
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => navigate('/app/new-intake')}>
              <Sparkles size={15} /> Start a new intake
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail (source material + note + action bar)                       */
/* ------------------------------------------------------------------ */

function SessionDetail({ session, onClose }: { session: PatientSession; onClose: () => void }) {
  const { permissions, saveOverride, acceptNote, finalizeNote, role, reportsBySession, visualsBySession } = useTriage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StructuredTriageNote | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const timelineEvents = session.triageNote?.timeline ?? []
  const [referralOpen, setReferralOpen] = useState(false)
  const note = session.triageNote
  const reportsView = reportsBySession[session.id]
  const visualsView = visualsBySession[session.id]

  const startEdit = () => {
    if (!note) return
    setDraft({ ...note.structuredNote })
    setEditing(true)
    setNotice(null)
  }

  const saveEdit = async () => {
    if (!draft || !note) return
    const changed = (['chiefComplaint', 'history', 'vitals'] as Array<keyof StructuredTriageNote>).some(
      (k) => draft[k] !== note.structuredNote[k],
    )
    if (!changed) {
      setEditing(false)
      setNotice('Nothing changed — the AI draft was kept as-is.')
      return
    }
    const ok = await saveOverride(session.id, draft)
    setEditing(false)
    setNotice(ok ? 'Override saved. The original AI draft stays in the change log.' : 'Your role cannot edit this note.')
  }

  const jumpToQuestions = () => {
    const el = document.getElementById('followup-questions')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SourcePanel session={session} />
        <NotePanel
          session={session}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          notice={notice}
          onStartEdit={startEdit}
          onCancelEdit={() => setEditing(false)}
          onSaveEdit={saveEdit}
        />
      </div>

      {/* Horizontal mini-timeline (P2-18-L) */}
      <TimelineMiniBar events={timelineEvents} />

      {/* Medical reports — uploaded values are suggestions for a human to verify. */}
      <ReportList reports={reportsView?.reports ?? []} merged={reportsView?.merged ?? null} />

      {permissions.canUploadReports && <ReportUploader sessionId={session.id} />}

      {/* Clinical photos — redacted, non-diagnostic descriptions for a human to verify. */}
      <VisualList visuals={visualsView?.visuals ?? []} />

      {permissions.canUploadVisuals && <VisualUploader sessionId={session.id} />}

      {/* Chronological timeline — AI draft, human-accepted, never a diagnosis. */}
      <TimelineSummaryCard session={session} />

      {/* Dynamic follow-up questions — context-aware, per-language, human-tracked (P0-5). */}
      <FollowUpList session={session} />

      {/* Consent proof + retention controls (P0-6). */}
      <ConsentRetentionCard session={session} />

      {/* Unified anonymisation preview + per-case coverage report (P0-7). */}
      <SessionAnonymisation sessionId={session.id} language={session.raw.language} />

      {/* Sticky action bar */}
      <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white/95 p-3 shadow-[var(--shadow-lift)] backdrop-blur">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X size={14} /> Close detail
        </Button>
        <span className="hidden h-5 w-px bg-ink-200 sm:block" />
        <Button
          variant="success"
          size="sm"
          disabled={!permissions.canAcceptNote || note?.status === 'accepted' || note?.status === 'finalized'}
          onClick={async () => setNotice((await acceptNote(session.id)) ? 'Note accepted as reviewed.' : 'Your role cannot accept notes.')}
        >
          <CheckCircle2 size={14} /> Accept note
        </Button>
        <Button variant="secondary" size="sm" disabled={editing || !permissions.canEditNote} onClick={startEdit}>
          <Pencil size={14} /> Override AI
        </Button>
        <Button variant="secondary" size="sm" onClick={jumpToQuestions}>
          <MessageCircleQuestion size={14} /> Ask follow-up
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!permissions.canDraftReferral}
          title={permissions.canDraftReferral ? 'Draft a referral for a higher-level facility' : 'Referrals are disabled for this role'}
          onClick={() => setReferralOpen(true)}
        >
          <Upload size={14} /> Escalate to human
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!permissions.canFinalizeNote}
          title={permissions.canFinalizeNote ? 'Finalize for this facility' : 'Doctor role required'}
          onClick={async () => setNotice((await finalizeNote(session.id)) ? 'Note finalized for this facility.' : 'Doctor role required.')}
        >
          <ClipboardCheck size={14} /> Finalize
        </Button>

        <p className="ml-auto text-right text-[11px] leading-tight text-ink-400">
          Signed in as {ROLE_DISPLAY[role]} · no prescription is ever issued
          <br />
          {permissions.canApproveReferral ? 'you can approve referrals' : 'referral approval needs a doctor'}
        </p>
      </div>

      <ReferralGenerator open={referralOpen} onClose={() => setReferralOpen(false)} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Left: original source material                                     */
/* ------------------------------------------------------------------ */

function SourcePanel({ session }: { session: PatientSession }) {
  const [zoom, setZoom] = useState(false)
  const raw = session.raw

  return (
    <Card
      title="Original patient inputs"
      subtitle="Exactly what was captured — identifiers were stripped before processing."
      action={
        <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
          {session.anonymization.redactedCount} PII stripped
        </Badge>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge className="bg-white text-ink-600 ring-ink-200">{raw.language}</Badge>
          <Badge className="bg-white text-ink-600 ring-ink-200">{session.demographics.intakePoint}</Badge>
          <Badge className="bg-white text-ink-600 ring-ink-200">{session.demographics.facility}</Badge>
          <Badge className={session.consent.granted ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}>
            Consent {session.consent.granted ? 'granted' : 'missing'}
          </Badge>
        </div>

        <section>
          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
            <FileText size={12} /> Narrative
          </h4>
          <p className="mt-1.5 whitespace-pre-line rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 text-sm leading-relaxed text-ink-700">
            {session.displayText || 'No typed narrative was provided.'}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-400">{summarizeRedactions(session.anonymization)}</p>
        </section>

        {raw.voice && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Voice</h4>
            {raw.voice.objectUrl ? (
              <audio controls src={raw.voice.objectUrl} className="mt-2 w-full" aria-label="Patient voice recording" />
            ) : (
              <p className="mt-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Live transcript captured in {raw.voice.language}.
              </p>
            )}
            {raw.voice.transcript && <p className="mt-1.5 text-xs text-ink-600">{raw.voice.transcript}</p>}
          </section>
        )}

        {raw.image && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Photograph</h4>
            <div className="mt-2 flex items-start gap-3">
              <button type="button" onClick={() => setZoom(true)} className="shrink-0" aria-label="Open photograph full size">
                <img
                  src={raw.image.objectUrl ?? ''}
                  alt={raw.image.caption || 'Clinical photograph'}
                  className="h-24 w-24 rounded-lg border border-ink-200 object-cover transition hover:opacity-90"
                />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink-700">{raw.image.caption || 'No caption provided'}</p>
                <p className="mt-1 text-[11px] text-ink-400">
                  Descriptive caption only — the image is not interpreted by the system.
                </p>
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => setZoom(true)}>
                  <ImageIcon size={13} /> View
                </Button>
              </div>
            </div>
          </section>
        )}

        {raw.document && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Report / document</h4>
            <p className="mt-1.5 text-xs font-semibold text-ink-700">{raw.document.name}</p>
            <pre className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-200 bg-white p-3 text-[11px] leading-relaxed text-ink-600">
              {raw.document.extractedText || `OCR status: ${raw.document.ocrStatus}`}
            </pre>
            <p className="mt-1 text-[11px] text-amber-700">Extracted values require manual verification.</p>
          </section>
        )}

        <section>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Consent record</h4>
          <p className="mt-1.5 text-xs text-ink-600">
            Granted {new Date(session.consent.at).toLocaleString('en-IN')} · policy {session.consent.policyVersion} ·
            non-diagnostic acknowledgement {session.consent.nonDiagnosticAcknowledged ? 'signed' : 'missing'}
          </p>
        </section>

        <Modal open={zoom} onClose={() => setZoom(false)} title="Clinical photograph" wide>
          <img
            src={raw.image?.objectUrl ?? ''}
            alt={raw.image?.caption || 'Clinical photograph'}
            className="max-h-[70vh] w-full rounded-xl object-contain"
          />
          <p className="mt-3 text-xs text-ink-500">{raw.image?.caption || 'No caption provided'}</p>
        </Modal>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Right: AI-prepared note                                            */
/* ------------------------------------------------------------------ */

interface NotePanelProps {
  session: PatientSession
  editing: boolean
  draft: StructuredTriageNote | null
  setDraft: (next: StructuredTriageNote) => void
  notice: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
}

function NotePanel({
  session,
  editing,
  draft,
  setDraft,
  notice,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: NotePanelProps) {
  const { permissions, askFollowUp, answerFollowUp } = useTriage()
  const note = session.triageNote
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  // View-only toggle: relabels note sections for staff orientation. The note
  // content is never altered — an English draft stays English.
  const [labelLang, setLabelLang] = useState<LanguageCode>('en')
  const labels = NOTE_SECTION_LABELS[labelLang]

  if (!note) {
    return (
      <Card title="AI-prepared note">
        <EmptyState
          icon={<Sparkles size={20} />}
          title="No note generated"
          hint="This session has no analysed note yet."
        />
      </Card>
    )
  }

  const risk = note.riskScore

  return (
    <Card
      title="AI-prepared triage note (draft)"
      subtitle={NON_DIAGNOSTIC_SHORT}
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Badge className={RISK_META[risk].classes}>
            <span className={cx('h-1.5 w-1.5 rounded-full', RISK_META[risk].dot)} />
            {risk} priority
          </Badge>
          <Badge className={NOTE_META[note.status].classes}>{NOTE_META[note.status].label}</Badge>
        </div>
      }
    >
      <div className="space-y-4">
        {notice && (
          <p role="status" className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
            {notice}
          </p>
        )}

        {/* Structured fields */}
        <div className="rounded-xl border border-ink-200">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-ink-50/70 px-3.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">Structured note</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-400">Labels:</span>
              <button
                type="button"
                onClick={() => setLabelLang(labelLang === 'en' ? 'hi' : 'en')}
                className={cx(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-bold transition',
                  labelLang === 'hi' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-200/60',
                )}
                aria-pressed={labelLang === 'hi'}
              >
                हिन्दी
              </button>
              <button
                type="button"
                onClick={() => setLabelLang(labelLang === 'or' ? 'en' : 'or')}
                className={cx(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-bold transition',
                  labelLang === 'or' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:bg-ink-200/60',
                )}
                aria-pressed={labelLang === 'or'}
              >
                ଓଡ଼ିଆ
              </button>
            </div>
            {!editing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onStartEdit}
                disabled={!permissions.canEditNote}
                title={permissions.canEditNote ? 'Override the AI' : 'Read-only for this role'}
              >
                <Pencil size={13} /> Override AI
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" variant="success" onClick={onSaveEdit}>
                  <CheckCircle2 size={13} /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                  <X size={13} /> Cancel
                </Button>
              </div>
            )}
          </div>
          <div className="divide-y divide-ink-100">
            <Field
              label={labels.chiefComplaint}
              value={note.structuredNote.chiefComplaint}
              editing={editing}
              draft={draft}
              setDraft={setDraft}
              field="chiefComplaint"
            />
            <Field
              label={labels.history}
              value={note.structuredNote.history}
              editing={editing}
              draft={draft}
              setDraft={setDraft}
              field="history"
            />
            <Field
              label={labels.vitals}
              value={note.structuredNote.vitals}
              editing={editing}
              draft={draft}
              setDraft={setDraft}
              field="vitals"
            />
          </div>
        </div>

        {/* Urgency flags */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
            <ShieldAlert size={12} /> {labels.urgencySignals}
          </h4>
          {note.urgencyFlags.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-500">No configured urgency keyword matched this intake.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {note.urgencyFlags.map((f) => (
                <li
                  key={f.id}
                  className={cx(
                    'rounded-lg border px-3 py-2 text-xs',
                    f.severity === 'red'
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-amber-300 bg-amber-50 text-amber-800',
                  )}
                >
                  <p className="font-bold">
                    {f.severity === 'red' ? 'Urgent review · ' : 'Prompt review · '}
                    {f.label}
                  </p>
                  <p className="mt-0.5 opacity-90">{f.reason}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{f.ruleId}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Observations */}
        <section>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{labels.observations}</h4>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {note.observations.map((o) => (
              <li key={o} className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[11px] text-ink-600">
                {o}
              </li>
            ))}
          </ul>
        </section>

        {/* Missing information */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
            <HelpCircle size={12} /> {labels.missingInformation} ({note.missingInformation.length})
          </h4>
          {note.missingInformation.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-500">All configured checklist items are present in the intake.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {note.missingInformation.map((m) => (
                <li key={m.id} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs">
                  <p className="font-bold text-ink-800">{m.field}</p>
                  <p className="mt-0.5 text-[11px] text-ink-500">{m.whyItMatters}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Follow-up questions */}
        <section id="followup-questions" tabIndex={-1} className="scroll-mt-24 outline-none">
          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
            <MessageCircleQuestion size={12} /> {labels.followUpQuestions}
          </h4>
          <ul className="mt-1.5 space-y-2">
            {note.followUpQuestions.map((q) => (
              <li key={q.id} className="rounded-xl border border-ink-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-ink-700">{q.question}</p>
                  <Badge
                    className={cx(
                      'shrink-0',
                      q.status === 'suggested' && 'bg-ink-100 text-ink-500 ring-ink-200',
                      q.status === 'asked' && 'bg-sky-50 text-sky-700 ring-sky-200',
                      q.status === 'answered' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                    )}
                  >
                    {q.status}
                  </Badge>
                </div>
                {q.answer && (
                  <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                    Answer: {q.answer}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.status === 'suggested' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!permissions.canEditNote}
                      onClick={async () => {
                        await askFollowUp(session.id, q.id)
                      }}
                    >
                      Ask this question
                    </Button>
                  )}
                  {q.status !== 'answered' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!permissions.canEditNote}
                      onClick={() => {
                        setAnsweringId(q.id)
                        setAnswerText(q.answer ?? '')
                      }}
                    >
                      Record answer
                    </Button>
                  )}
                </div>
                {answeringId === q.id && (
                  <form
                    className="mt-2 flex gap-1.5"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const ok = await answerFollowUp(session.id, q.id, answerText)
                      if (ok) setAnsweringId(null)
                    }}
                  >
                    <label htmlFor={`answer-${q.id}`} className="sr-only">
                      Answer for {q.question}
                    </label>
                    <input
                      id={`answer-${q.id}`}
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Patient's answer, verbatim"
                      className="inp"
                      autoFocus
                    />
                    <Button size="sm" type="submit">
                      Save
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Human overrides */}
        {session.overrides.length > 0 && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Human overrides</h4>
            <ul className="mt-1.5 space-y-1">
              {session.overrides.map((o) => (
                <li key={o.id} className="rounded-lg bg-violet-50 px-3 py-2 text-[11px] text-violet-800">
                  <span className="font-bold">{o.field}</span> · {o.reviewer} ({o.role}) · {formatAuditTime(o.at)}
                  <p className="mt-0.5 break-words opacity-90">
                    “{o.previousValue.slice(0, 90)}” → “{o.newValue.slice(0, 90)}”
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SessionAudit sessionId={session.id} />
      </div>
    </Card>
  )
}

function Field({
  label,
  value,
  editing,
  draft,
  setDraft,
  field,
}: {
  label: string
  value: string
  editing: boolean
  draft: StructuredTriageNote | null
  setDraft: (next: StructuredTriageNote) => void
  field: keyof StructuredTriageNote
}) {
  if (editing && draft) {
    return (
      <div className="p-3.5">
        <label htmlFor={`edit-${field}`} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
          {label}
        </label>
        <textarea
          id={`edit-${field}`}
          rows={field === 'chiefComplaint' ? 2 : 4}
          value={draft[field]}
          onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
          className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        />
      </div>
    )
  }
  return (
    <div className="p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-700">{value}</p>
    </div>
  )
}

function SessionAudit({ sessionId }: { sessionId: string }) {
  const { audit } = useTriage()
  const entries = useMemo(() => audit.filter((e) => e.sessionId === sessionId).slice(0, 6), [audit, sessionId])
  if (entries.length === 0) return null
  return (
    <section>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Audit trail (this session)</h4>
      <ul className="mt-1.5 space-y-1">
        {entries.map((e) => (
          <li key={e.id} className="rounded-lg bg-ink-50 px-3 py-1.5 text-[11px] text-ink-600">
            <span className="font-bold text-ink-700">{e.action}</span> · {e.actor} ({e.role}) · {formatAuditTime(e.at)}
            <p className="text-ink-400">{e.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
