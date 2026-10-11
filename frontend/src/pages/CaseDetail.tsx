import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  Languages,
  Mic,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTriage } from '../context/TriageContext'
import { AppDataGrid } from '../components/AppDataGrid'
import { Badge, Button, Card, cx, InfoBanner, Modal, ProgressBar, SourceRef, Stagger, StaggerItem } from '../components/ui'
import TimelineSummaryCard from '../components/timeline/TimelineSummaryCard'
import FollowUpList from '../components/followups/FollowUpList'
import ConsentRetentionCard from '../components/retention/ConsentRetentionCard'
import SessionAnonymisation from '../components/anonymisation/SessionAnonymisation'
import SessionConfidenceSummary from '../components/confidence/SessionConfidenceSummary'
import FeedbackSummaryCard from '../components/feedback/FeedbackSummaryCard'
import { reviewMeta, urgentMeta } from '../lib/format'
import { useApp } from '../store/AppStore'
import type { CaseRecord, Report } from '../types'

const SECTION_LINK = [
  { id: 'concern', label: 'Concerns' },
  { id: 'ai-summary', label: 'AI Summary' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'reports', label: 'Reports' },
  { id: 'missing', label: 'Missing info' },
  { id: 'questions', label: 'Questions' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'sources', label: 'Sources' },
  { id: 'verification', label: 'Verification' },
  { id: 'referral', label: 'Referral' },
  { id: 'retention', label: 'Consent & retention' },
  { id: 'audit', label: 'Audit' },
]

export default function CaseDetail() {
  const { caseId } = useParams()
  const { cases } = useApp()
  const c = cases.find((x) => x.id === caseId)

  if (!c) return <p className="text-sm text-ink-500">Case not found.</p>

  return (
    <div className="space-y-5">
      <CaseHeader c={c} />
      <LinkedSessionBanner patientId={c.patientId} />
      <div className="sticky top-[118px] z-20 flex gap-1.5 overflow-x-auto rounded-xl border border-ink-200 bg-white/95 p-1.5 shadow-[var(--shadow-card)] backdrop-blur">
        {SECTION_LINK.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            {s.label}
          </a>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <ConcernSection c={c} />
          <SummarySection c={c} />
          <TimelineSection c={c} />
          <ReportsSection c={c} />
          <MissingSection c={c} />
          <QuestionsSection c={c} />
          <UrgencySection c={c} />
          <VerificationSection c={c} />
          <ReferralSection c={c} />
        </div>
        <div className="space-y-5">
          <SourcePanel c={c} />
          <CompletenessPanel c={c} />
          <AuditPanel c={c} />
        </div>
      </div>
    </div>
  )
}

/* Live backend session linked to this demo case (matched by anonymized patientId). */
function LinkedSessionBanner({ patientId }: { patientId: string }) {
  const { sessions, activeSession, reportsBySession, visualsBySession } = useTriage()
  const navigate = useNavigate()
  const linked = sessions.find((s) => s.patientId === patientId) ?? activeSession ?? null
  if (!linked) return null
  const view = reportsBySession[linked.id]
  const reportCount = view?.reports.length ?? 0
  const verified = (view?.reports ?? []).filter((r) => r.status === 'verified').length
  const visualCount = visualsBySession[linked.id]?.visuals.length ?? 0
  return (
    <div id="retention" className="space-y-3">
      <InfoBanner tone="sky">
        A live triage session exists for this anonymized patient (
        <strong className="font-bold">{linked.patientId}</strong>) recorded in{' '}
        <strong className="font-bold">{linked.raw.language}</strong>, with{' '}
        <strong className="font-bold">{reportCount} report(s)</strong> on record ({verified} verified) and{' '}
        <strong className="font-bold">{visualCount} clinical photo(s)</strong> (redacted). Report values and photo
        descriptions live in the review queue for human verification.
        <button
          type="button"
          onClick={() => navigate('/app/review')}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-700"
        >
          Open review queue <ExternalLink size={12} />
        </button>
      </InfoBanner>
      <TimelineSummaryCard session={linked} readOnly compact />
      {/* Live follow-up questions for the linked session — staff can ask / answer here. */}
      <FollowUpList session={linked} compact />
      {/* Consent proof + retention controls for the linked session (P0-6). */}
      <ConsentRetentionCard session={linked} />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate(`/app/data-privacy?session=${encodeURIComponent(linked.id)}`)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-bold text-ink-600 hover:bg-ink-50"
        >
          Open in Data &amp; Privacy <ExternalLink size={12} />
        </button>
      </div>
      {/* Unified anonymisation preview + per-case coverage report (P0-7). */}
      <SessionAnonymisation sessionId={linked.id} language={linked.raw.language} />
      {/* Per-case confidence, explanations + low-confidence review (P2-14). */}
          <SessionConfidenceSummary session={linked} />
          {/* Clinician feedback on this case's AI outputs (P2-15). */}
          <FeedbackSummaryCard session={linked} />
    </div>
  )
}

function CaseHeader({ c }: { c: CaseRecord }) {
  return (
    <div className="sf-fade-in overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)]">
      <div className="h-1.5 w-full bg-gradient-to-r from-brand-700 via-brand-500 to-emerald-400" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-extrabold text-white shadow-lg shadow-brand-900/25">
              {c.patientId.slice(-3)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold leading-tight tracking-tight text-ink-900">{c.patientId}</h1>
                <Badge className="bg-white text-ink-600 ring-ink-200">{c.language}</Badge>
                <Badge className="bg-white text-ink-600 ring-ink-200">{c.mode} mode</Badge>
                <Badge className={reviewMeta[c.reviewStatus].classes}>{reviewMeta[c.reviewStatus].label}</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
                <span className="font-bold text-ink-800">Chief concern:</span> {c.chiefConcern}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-ink-400">
                <span className="inline-flex items-center gap-1"><Timer size={12} /> Created {c.createdAt}</span>
                <span>Updated {c.updatedAt}</span>
                <span>Reported by {c.reporter} · facility intake</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2.5 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5 sm:items-end">
            <div className="flex flex-wrap gap-1.5">
              {c.urgencySignals.length > 0 ? (
                c.urgencySignals.map((s) => (
                  <Badge key={s.id} className={urgentMeta[s.level].classes}>
                    <span className={cx('h-1.5 w-1.5 rounded-full', urgentMeta[s.level].dot)} />
                    {urgentMeta[s.level].label}
                  </Badge>
                ))
              ) : (
                <Badge className={urgentMeta.routine.classes}>Routine review</Badge>
              )}
            </div>
            <p className="text-[10px] font-medium text-ink-400">
              AI-generated workflow signal · final assessment by qualified staff
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConcernSection({ c }: { c: CaseRecord }) {
  const [openSource, setOpenSource] = useState(false)
  return (
    <Card id="concern" title="Patient-reported concerns" subtitle="Original input is always preserved and never silently modified.">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-ink-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            <Languages size={12} /> Original ({c.transcriptLanguage ?? c.language})
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-800">
            {c.originalTranscript ?? c.chiefConcern}
          </p>
          {c.originalTranscript && (
            <p className="mt-2 text-[11px] text-ink-400">Transcript status: preserved · confirmed by patient</p>
          )}
        </div>
        <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
            <Sparkles size={12} /> Translated (English)
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-800">
            {c.translatedConcern ?? c.chiefConcern}
          </p>
          <p className="mt-2 text-[11px] text-ink-400">Translation is machine-generated. Original retained at left.</p>
        </div>
      </div>
      {c.symptoms.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink-600">Structured symptoms</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {c.symptoms.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg bg-ink-50 p-2.5">
                <div>
                  <p className="text-sm font-medium text-ink-800">{s.name}</p>
                  <p className="text-[11px] text-ink-500">
                    Duration: {s.duration ?? 'Unknown'} {s.severity ? `· Severity: ${s.severity}` : ''}
                  </p>
                </div>
                <SourceRef label={s.source} />
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-400">
            <Timer size={12} />
            Unprovided details stay <strong>Unknown / Not provided</strong> — never assumed as “No”.
          </p>
        </div>
      )}
      {c.originalTranscript && (
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setOpenSource(true)}>
            <Mic size={13} /> View voice transcript
          </Button>
        </div>
      )}
      <Modal open={openSource} onClose={() => setOpenSource(false)} title="Original voice transcript">
        <div className="space-y-3 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Original transcript</p>
          <div className="rounded-lg bg-ink-50 p-3 leading-relaxed text-ink-800">{c.originalTranscript}</div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">English translation</p>
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 leading-relaxed text-ink-800">
            {c.translatedConcern}
          </div>
          <p className="text-[11px] text-ink-400">
            If speech recognition failed, the system would not fabricate a transcript — it would ask the patient to
            retry or enter the information manually.
          </p>
        </div>
      </Modal>
    </Card>
  )
}

function SummarySection({ c }: { c: CaseRecord }) {
  return (
    <Card id="ai-summary" title="AI Summary" subtitle="AI organizes patient-provided facts. It does not decide.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
            <Sparkles size={12} className="text-brand-500" /> AI structured summary
          </p>
          <Stagger className="mt-2 space-y-1.5 text-sm text-ink-700" gap={0.05}>
            <StaggerItem>
              <p>
                • Patient reports: <strong>{c.symptoms.map((s) => s.name).join(' and ') || 'no symptom recorded'}</strong>.
              </p>
            </StaggerItem>
            {c.symptoms.map((s) => (
              <StaggerItem key={s.id}>
                <p>
                  • <strong>{s.name}</strong> duration: <strong>{s.duration ?? 'Unknown'}</strong>.
                </p>
              </StaggerItem>
            ))}
            <StaggerItem>
              <p>• Reported history: {c.reportedHistory.length ? c.reportedHistory.join('; ') : 'Not provided'}.</p>
            </StaggerItem>
            <StaggerItem>
              <p>
                • Reported medications: {c.reportedMedications.length ? c.reportedMedications.join('; ') : 'Not provided'}.
              </p>
            </StaggerItem>
            <StaggerItem>
              <p>• {c.reportIds.length} report(s) processed by OCR.</p>
            </StaggerItem>
          </Stagger>
          <p className="mt-3 rounded-lg bg-gradient-to-r from-brand-500 to-emerald-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">
            <Sparkles size={11} className="mr-1 inline" />
            ai-synthesized · source-backed · never asserts beyond patient input
          </p>
          <p className="mt-2 text-[11px] text-ink-400">
            Nothing beyond patient-provided or OCR-extracted information is asserted.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Original patient input</p>
          <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm leading-relaxed text-ink-800">{c.chiefConcern}</div>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm">
              <PenLine size={13} /> Edit summary
            </Button>
            <Button variant="ghost" size="sm">
              Reject suggestion
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            Health workers can edit or reject AI output; corrections are logged for audit.
          </p>
        </div>
      </div>
    </Card>
  )
}

function TimelineSection({ c }: { c: CaseRecord }) {
  return (
    <Card id="timeline" title="Timeline" subtitle="Patient-reported relative timeline — dates are never invented.">
      <ol className="relative ml-3 space-y-5 border-l border-ink-200 pl-6">
        {c.timeline.map((t) => (
          <li key={t.id} className="relative">
            <span className="absolute -left-[31px] flex h-4 w-4 items-center justify-center rounded-full border border-brand-200 bg-white">
              <CircleDot size={10} className="text-brand-600" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">{t.dayLabel}</p>
            <p className="mt-0.5 text-sm text-ink-700">{t.text}</p>
            <SourceRef label={t.source} />
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
        Patient-reported relative timeline (no invented calendar dates).
      </p>
    </Card>
  )
}

function ReportsSection({ c }: { c: CaseRecord }) {
  const { reports, verifyReportField } = useApp()
  const list = reports.filter((r) => c.reportIds.includes(r.id))
  return (
    <Card
      id="reports"
      title="Extracted report information"
      subtitle="OCR values carry a source reference and 'needs verification' status."
    >
      {list.length === 0 && <p className="text-sm text-ink-500">No reports uploaded for this case.</p>}
      {list.map((r) => (
        <div key={r.id} className="mb-4 last:mb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
              <FileText size={14} className="text-ink-400" /> {r.name}
            </p>
            <div className="flex items-center gap-1.5">
              <Badge
                className={
                  r.ocrStatus === 'done'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-rose-50 text-rose-700 ring-rose-200'
                }
              >
                {r.ocrStatus === 'done' ? 'OCR completed' : 'OCR failed / low quality'}
              </Badge>
              <Badge className="bg-white text-ink-500 ring-ink-200">{r.kind}</Badge>
            </div>
          </div>
          <p className="mt-1.5 rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-600">{r.aiNote}</p>
          {r.fields.length > 0 && (
            <div className="mt-2">
              <AppDataGrid<Report['fields'][number]>
                rows={r.fields}
                ariaLabel={`Extracted values for ${r.name}`}
                getRowId={(f) => f.id}
                hideToolbar
                hideFooter
                defaultDensity="compact"
                columns={[
                  {
                    field: 'param',
                    headerName: 'Parameter',
                    flex: 1,
                    renderCell: (p) => <span className="font-medium text-ink-800">{p.row.param}</span>,
                  },
                  {
                    field: 'value',
                    headerName: 'Value',
                    flex: 1,
                    renderCell: (p) => (
                      <span>
                        {p.row.value}
                        {p.row.unit ? ` ${p.row.unit}` : ''}
                      </span>
                    ),
                  },
                  { field: 'referenceRange', headerName: 'Reference range', flex: 1.2, renderCell: (p) => <span className="text-ink-500">{p.row.referenceRange}</span> },
                  {
                    field: 'status',
                    headerName: 'Status',
                    width: 160,
                    renderCell: (p) => (
                      <Badge
                        className={
                          p.row.status === 'verified'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-amber-200'
                        }
                      >
                        {p.row.status === 'verified' ? 'Verified' : 'Needs verification'}
                      </Badge>
                    ),
                  },
                  {
                    field: 'actions',
                    headerName: 'Action',
                    width: 130,
                    sortable: false,
                    filterable: false,
                    disableColumnMenu: true,
                    renderCell: (p) =>
                      p.row.status !== 'verified' ? (
                        <Button variant="secondary" size="sm" onClick={() => verifyReportField(r.id, p.row.id)}>
                          <CheckCircle2 size={12} /> Verify
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-ink-400">
            Source: {r.name} · AI does not convert any OCR value into a diagnosis.
          </p>
        </div>
      ))}
    </Card>
  )
}

function MissingSection({ c }: { c: CaseRecord }) {
  return (
    <Card id="missing" title="Missing information" subtitle="Information completeness — not a health or disease score.">
      <div className="grid gap-3 sm:grid-cols-2">
        {c.missingInfo.length > 0 ? (
          c.missingInfo.map((m) => (
            <div
              key={m}
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm text-ink-700"
            >
              <AlertTriangle size={14} className="shrink-0 text-amber-500" />
              {m}
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-500">All expected information fields are present for this prototype case.</p>
        )}
      </div>
      <p className="mt-3 text-[11px] text-ink-400">
        {c.missingInfo.length} important information field{c.missingInfo.length === 1 ? '' : 's'} missing across the
        case. This is a completeness flag for staff, not a medical score.
      </p>
    </Card>
  )
}

function QuestionsSection({ c }: { c: CaseRecord }) {
  const { answerQuestion, role, pushToast } = useApp()
  const pending = c.followUpQuestions.filter((q) => q.status === 'suggested')
  return (
    <Card
      id="questions"
      title="Suggested follow-up questions"
      subtitle="Information-gathering only — never diagnosis questions."
      action={
        <Button variant="secondary" size="sm" onClick={() => pushToast('info', 'Custom question added (demo)')}>
          <Plus size={13} /> Add custom
        </Button>
      }
    >
      <div className="space-y-2.5">
        {pending.length === 0 && c.followUpQuestions.length === 0 && (
          <p className="text-sm text-ink-500">No follow-up questions suggested for this case.</p>
        )}
        {pending.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-800">{q.question}</p>
              <SourceRef label="AI-suggested from missing information" />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                answerQuestion(c.id, q.id, 'Answered by patient — recorded in this case.')
                pushToast('success', 'Answer recorded and added to the case.')
                if (role === 'doctor') {
                  // doctors may add notes, nurses ask — answer comes from patient
                }
              }}
            >
              Ask Question
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {c.followUpQuestions
          .filter((q) => q.status === 'answered')
          .map((q) => (
            <div key={q.id} className="rounded-lg bg-emerald-50/70 px-3 py-2 text-sm">
              <p className="font-medium text-ink-800">{q.question}</p>
              <p className="mt-0.5 text-emerald-800">→ {q.answer}</p>
              <p className="mt-1 text-[10px] text-ink-400">Source: patient response · {q.answeredAt}</p>
            </div>
          ))}
      </div>
    </Card>
  )
}

function UrgencySection({ c }: { c: CaseRecord }) {
  const { acknowledgeSignal } = useApp()
  if (c.urgencySignals.length === 0) {
    return (
      <Card id="urgency" title="Urgency signals" subtitle="Rules-based workflow labels — not medical diagnoses.">
        <div className="flex items-center gap-2 text-sm text-ink-600">
          <ShieldCheck size={16} className="text-emerald-500" />
          No configured urgency signal generated from reported information.
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Routine review does not mean “safe”. Qualified staff still assess every case.
        </p>
      </Card>
    )
  }
  return (
    <Card id="urgency" title="Urgency signals" subtitle="Transparent rules engine — inspectable and logged.">
      <div className="space-y-3">
        {c.urgencySignals.map((s) => (
          <div key={s.id} className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle size={16} className="text-rose-500" />
              <Badge className={'bg-rose-100 text-rose-700 ring-rose-200'}>{urgentMeta[s.level].label}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-700">{s.reason}</p>
            <p className="mt-1.5 rounded-md bg-white/70 px-2 py-1 font-mono text-[10px] text-ink-500">{s.rule}</p>
            <p className="mt-2 text-[11px] text-ink-500">
              Qualified healthcare professional review recommended. “Emergency confirmed” is never stated by the system.
            </p>
            {s.status === 'active' && (
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => acknowledgeSignal(c.id, s.id)}>
                <CheckCircle2 size={13} /> Acknowledge signal
              </Button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-400">
        AI-generated workflow signal. Final assessment must be made by qualified healthcare staff.
      </p>
    </Card>
  )
}

function SourcePanel({ c }: { c: CaseRecord }) {
  const { reports } = useApp()
  const list = reports.filter((r) => c.reportIds.includes(r.id))
  return (
    <Card id="sources" title="Original sources" subtitle="Every AI statement can be traced back to source material.">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 p-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-800">Voice / text input</p>
            <p className="truncate text-[11px] text-ink-400">{c.originalTranscript ?? c.chiefConcern}</p>
          </div>
          <ExternalLink size={14} className="shrink-0 text-ink-400" />
        </div>
        {list.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 p-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-800">{r.name}</p>
              <p className="text-[11px] text-ink-400">{r.kind} · OCR {r.ocrStatus}</p>
            </div>
            <ExternalLink size={14} className="shrink-0 text-ink-400" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-400">
        Clicking a source shows the original document/transcript beside the AI output for comparison.
      </p>
    </Card>
  )
}

function CompletenessPanel({ c }: { c: CaseRecord }) {
  const checks = [
    { label: 'Symptoms', ok: c.symptoms.length > 0 },
    { label: 'Duration', ok: c.symptoms.some((s) => s.duration) },
    { label: 'Severity', ok: c.symptoms.some((s) => s.severity) },
    { label: 'Relevant history', ok: c.reportedHistory.length > 0 },
    { label: 'Reports', ok: c.reportIds.length > 0 },
    { label: 'Language', ok: true },
  ]
  return (
    <Card title="Information completeness" subtitle="Not a health score — a data-completeness flag for staff.">
      <div className="flex items-end justify-between">
        <p className="text-3xl font-extrabold text-ink-900">{c.completeness}%</p>
        <div className="w-24">
          <ProgressBar
            value={c.completeness}
            tone={c.completeness >= 70 ? 'brand' : c.completeness >= 40 ? 'amber' : 'rose'}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {checks.map((x) => (
          <span key={x.label} className="flex items-center gap-1.5 text-[11px] text-ink-600">
            {x.ok ? (
              <CheckCircle2 size={12} className="text-emerald-500" />
            ) : (
              <CircleDot size={12} className="text-amber-400" />
            )}
            {x.label}
          </span>
        ))}
      </div>
    </Card>
  )
}

function AuditPanel({ c }: { c: CaseRecord }) {
  const { audit } = useApp()
  const events = audit.filter((a) => a.caseId === c.id).slice(0, 8)
  return (
    <Card id="audit" title="Audit trail" subtitle="Actor · action · timestamp · case">
      <ol className="relative space-y-3 border-l border-ink-200 pl-4">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <p className="text-xs font-medium text-ink-800">{e.action}</p>
            <p className="text-[10px] text-ink-400">
              {e.time} · {e.actor} ({e.role})
            </p>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function VerificationSection({ c }: { c: CaseRecord }) {
  const { verifyField, addCorrection, role, pushToast, setReviewStatus } = useApp()
  const reviewer = role === 'doctor' ? 'Dr. A. Mehta' : 'R. Sharma'
  const unverified = c.symptoms.filter((s) => s.status !== 'verified')

  const recordCorrection = (_symptomId: string, fieldName: string, aiValue: string, humanValue: string) => {
    addCorrection({
      caseId: c.id,
      field: fieldName,
      aiValue,
      humanValue,
      reviewer,
      role: role === 'doctor' ? 'Doctor' : 'Nurse',
      time: '',
    })
    pushToast('success', `Correction logged: ${fieldName} → ${humanValue} (stored for audit).`)
  }

  return (
    <Card
      id="verification"
      title="Human verification & corrections"
      subtitle="Every AI-extracted field can be accepted, edited or rejected. Corrections are never used to silently retrain."
    >
      <div className="grid gap-2 lg:grid-cols-2">
        {unverified.length > 0 ? (
          unverified.map((s) => (
            <div key={s.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-800">
                  {s.name} — {s.duration ?? 'Unknown'}
                </p>
                <Badge className="bg-amber-100 text-amber-700 ring-amber-200">AI extracted</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => {
                    verifyField(c.id, s.id, reviewer)
                    pushToast('success', `${s.name} verified by health worker.`)
                  }}
                >
                  <CheckCircle2 size={13} /> Verify
                </Button>
                <Button variant="secondary" size="sm" onClick={() => recordCorrection(s.id, `${s.name} duration`, s.duration ?? 'Unknown', `${s.duration ?? '3 days'} (corrected)`)}>
                  <PenLine size={13} /> Edit
                </Button>
                <Button variant="ghost" size="sm">
                  Reject
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-ink-400">
                AI: “{s.name} — {s.duration ?? 'Unknown'}” · Source: {s.source}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800 lg:col-span-2">
            <CheckCircle2 size={15} className="inline" /> All extracted symptom fields have been verified by staff.
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">AI vs original input</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-ink-200 p-3 text-sm">
            <p className="mb-1 text-[10px] font-bold uppercase text-brand-700">AI structured</p>
            {c.symptoms.map((s) => (
              <p key={s.id} className="text-ink-700">
                “{s.name} — {s.duration ?? 'Unknown'}”
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-ink-200 p-3 text-sm">
            <p className="mb-1 text-[10px] font-bold uppercase text-ink-400">Original input</p>
            <p className="leading-relaxed text-ink-700">{c.chiefConcern}</p>
          </div>
        </div>
      </div>

      {c.corrections.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Correction log</p>
          <div className="mt-2 space-y-2">
            {c.corrections.map((co) => (
              <div key={co.id} className="rounded-lg bg-ink-50 p-3 text-xs">
                <p className="font-semibold text-ink-800">{co.field}</p>
                <p className="mt-1 text-ink-500">
                  AI: <span className="text-ink-400 line-through">{co.aiValue}</span> → Human:{' '}
                  <span className="font-semibold text-emerald-700">{co.humanValue}</span>
                </p>
                <p className="mt-1 text-[10px] text-ink-400">
                  {co.reviewer} ({co.role}) · stored for evaluation; never used to train on patient data
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => pushToast('info', 'Additional information requested from patient (demo)')}>
          Request more information
        </Button>
        {c.reviewStatus === 'awaiting-nurse' && role === 'nurse' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setReviewStatus(c.id, 'awaiting-doctor')
              pushToast('success', 'Case escalated to doctor review.')
            }}
          >
            Escalate to Doctor
          </Button>
        )}
      </div>
    </Card>
  )
}

function ReferralSection({ c }: { c: CaseRecord }) {
  const { createReferral, approveReferral, patchReferral, role, pushToast, setReviewStatus } = useApp()
  const ref = c.referral

  return (
    <Card id="referral" title="Referral" subtitle="AI drafts the referral note. Only qualified staff approve and send it.">
      {!ref && (
        <div>
          <p className="text-sm text-ink-600">
            No referral drafted yet. The system never autonomously decides or sends a referral.
          </p>
          {role !== 'nurse' && (
            <Button className="mt-3" onClick={() => { createReferral(c.id); pushToast('info', 'Referral draft created — requires doctor approval.') }}>
              <Plus size={15} /> Prepare referral draft
            </Button>
          )}
        </div>
      )}
      {ref && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white text-ink-600 ring-ink-200">Draft {ref.id}</Badge>
            <Badge
              className={
                ref.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-amber-200'
              }
            >
              {ref.status}
            </Badge>
            {ref.approvedAt && (
              <span className="text-[11px] text-ink-400">
                Approved by {ref.approvedBy} at {ref.approvedAt}
              </span>
            )}
          </div>
          <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{ref.reason}</p>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Referral checklist</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {ref.checklist.map((cl) => (
                <span key={cl.label} className="flex items-center gap-1.5 text-xs text-ink-600">
                  {cl.done ? <CheckCircle2 size={13} className="text-emerald-500" /> : <CircleDot size={13} className="text-ink-300" />}
                  {cl.label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={ref.targetFacility ?? ''}
              onChange={(e) => patchReferral(c.id, { targetFacility: e.target.value })}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 outline-none focus:border-brand-500"
            >
              <option value="" disabled>
                Select destination (staff decides)
              </option>
              {ref.destinationOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input
              value={ref.reviewerNotes ?? ''}
              onChange={(e) => patchReferral(c.id, { reviewerNotes: e.target.value })}
              placeholder="Reviewer notes…"
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 outline-none focus:border-brand-500"
            />
          </div>
          <p className="rounded-md border border-brand-200 bg-brand-50/60 px-3 py-2 text-[11px] font-medium text-brand-800">
            AI-generated draft — requires doctor/medical-officer review and approval. Never autonomously submitted.
          </p>
          <div className="flex flex-wrap gap-2">
            {(ref.status === 'draft' || ref.status === 'pending-approval') && role === 'doctor' && (
              <Button
                variant="primary"
                onClick={() => {
                  approveReferral(c.id, 'Dr. A. Mehta')
                  setReviewStatus(c.id, 'closed')
                  pushToast('success', 'Referral approved. Case packet marked for hand-off.')
                }}
              >
                <ShieldCheck size={15} /> Approve Referral
              </Button>
            )}
            <CasePacketExport c={c} />
          </div>
        </div>
      )}
    </Card>
  )
}

function CasePacketExport({ c }: { c: CaseRecord }) {
  const [open, setOpen] = useState(false)
  const { reports } = useApp()
  const packet = useMemo(() => {
    return {
      facility: 'Model PHC — Triage Unit',
      exportedAt: new Date().toISOString(),
      patientId: c.patientId,
      caseId: c.id,
      language: c.language,
      mode: c.mode,
      chiefConcern: c.chiefConcern,
      translatedConcern: c.translatedConcern,
      symptoms: c.symptoms,
      timeline: c.timeline,
      reports: reports.filter((r) => c.reportIds.includes(r.id)) as Report[],
      missingInfo: c.missingInfo,
      completeness: c.completeness,
      urgencySignals: c.urgencySignals,
      corrections: c.corrections,
      reviewer: c.reporter,
      referral: c.referral,
    }
  }, [c, reports])
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Download size={14} /> Export case summary
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Case packet export" wide>
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            The packet contains the synthetic patient ID, case summary, timeline, reports, extracted fields, missing
            information, urgency signals, human corrections, reviewer information, referral information and audit
            events.
          </p>
          <pre className="max-h-80 overflow-auto rounded-lg bg-ink-900 p-4 text-[11px] leading-relaxed text-emerald-300">
            {JSON.stringify(packet, null, 2)}
          </pre>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${c.patientId}-case-packet.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download size={14} /> Download .json
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
