import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  HelpCircle,
  ListChecks,
  Loader2,
  Mic,
  Paperclip,
  ScanSearch,
  ScrollText,
  Send,
  Stethoscope,
  UserCheck,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import type { CaseRecord } from '../types'

const STAGES: Array<{ icon: React.ReactNode; label: string }> = [
  { icon: <Mic size={15} />, label: 'Patient selects Odia and speaks symptoms' },
  { icon: <FileText size={15} />, label: 'Transcript generated (original preserved)' },
  { icon: <Paperclip size={15} />, label: 'Synthetic CBC report uploaded' },
  { icon: <ScanSearch size={15} />, label: 'OCR extracted 6 fields — marked needs verification' },
  { icon: <ListChecks size={15} />, label: 'AI structured symptoms, timeline and summary' },
  { icon: <HelpCircle size={15} />, label: 'Missing information detected · follow-up questions suggested' },
  { icon: <Flag size={15} />, label: 'Rules engine raised a prompt-review workflow signal' },
  { icon: <Stethoscope size={15} />, label: 'Case entered health-worker queue' },
  { icon: <BadgeCheck size={15} />, label: 'Health worker verified AI-extracted fields' },
  { icon: <UserCheck size={15} />, label: 'Doctor reviewed original sources and decision' },
  { icon: <Send size={15} />, label: 'Referral draft prepared — awaiting doctor approval' },
  { icon: <ScrollText size={15} />, label: 'Audit trail recorded every step' },
]

const DURATION_PER_STAGE = 900

export function DemoRunner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addCase, addReport, addAudioEvent, setReviewStatus, pushToast } = useApp()
  const navigate = useNavigate()
  const [stage, setStage] = useState(0)
  const [done, setDone] = useState(false)
  const doneRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setStage(0)
    setDone(false)
    doneRef.current = 0
  }, [open])

  useEffect(() => {
    if (!open) return
    if (done) return
    const t = window.setTimeout(() => {
      const next = doneRef.current + 1
      doneRef.current = next
      if (next < STAGES.length) {
        setStage(next)
      } else {
        setDone(true)
        buildDemoCase()
      }
    }, DURATION_PER_STAGE)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, done, open])

  const buildDemoCase = () => {
    const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`
    const caseRec: CaseRecord = {
      id: 'case-demo-new',
      patientId: 'SYN-2026-100',
      language: 'Odia',
      mode: 'opd',
      chiefConcern: 'Fever for 3 days and weakness since yesterday.',
      originalTranscript: 'ମୋର ତିନି ଦିନ ହେଲା ଜ୍ୱର ଅଛି, ଏବଂ ଗତକାଲି ଠାରୁ ଦୁର୍ବଳତା ଲାଗୁଛି।',
      transcriptLanguage: 'Odia',
      translatedConcern: 'I have had fever for three days, and since yesterday I am feeling weakness.',
      symptoms: [
        { id: uid('s'), name: 'Fever', duration: '3 days', source: 'Patient voice transcript (Odia)', status: 'verified' },
        { id: uid('s'), name: 'Weakness', duration: '1 day', source: 'Patient voice transcript (Odia)', status: 'verified' },
      ],
      timeline: [
        { id: uid('t'), dayLabel: 'Day 1', text: 'Fever reported to have started (patient-reported).', source: 'Patient voice transcript' },
        { id: uid('t'), dayLabel: 'Day 3', text: 'Weakness reported since today.', source: 'Patient voice transcript' },
      ],
      reportedHistory: [],
      reportedMedications: [],
      missingInfo: ['Severity of symptoms', 'Relevant previous history', 'Medications taken'],
      completeness: 60,
      followUpQuestions: [
        { id: uid('q'), question: 'How severe does the fever feel? (mild / moderate / severe)', status: 'suggested' },
        { id: uid('q'), question: 'Has there been any cough, body ache or chills?', status: 'suggested' },
      ],
      urgencySignals: [
        {
          id: uid('u'),
          level: 'prompt',
          reason: 'Reported weakness combined with fever of 3 days maps to the configured prompt-review keyword group.',
          rule: 'RULE-FEVER-WEAKNESS-PROMPT',
          status: 'acknowledged',
        },
      ],
      reviewStatus: 'awaiting-doctor',
      consent: { status: 'granted', at: 'now', purpose: ['Symptom organisation', 'Report processing', 'Healthcare-worker review'] },
      reportIds: ['rpt-demo-new'],
      createdAt: 'just now',
      updatedAt: 'just now',
      reporter: 'Demo runner',
      corrections: [],
      referral: null,
    }
    addReport({
      id: 'rpt-demo-new',
      caseId: 'case-demo-new',
      name: 'CBC_Report_Demo.pdf',
      type: 'pdf',
      kind: 'cbc',
      date: '2026-09-18',
      ocrStatus: 'done',
      aiNote: 'OCR completed (demo). Values require human verification.',
      fields: [
        { id: uid('f'), param: 'Hemoglobin', value: '10.2', unit: 'g/dL', referenceRange: '13.0–17.0', status: 'verified' },
        { id: uid('f'), param: 'WBC Count', value: '11,400', unit: '/µL', referenceRange: '4,000–11,000', status: 'verified' },
        { id: uid('f'), param: 'Platelets', value: '1.8', unit: 'lakh/µL', referenceRange: '1.5–4.5', status: 'needs-verification' },
      ],
    })
    addCase(caseRec)
    addAudioEvent('case-demo-new', 'Demo case: full end-to-end workflow replayed')
    setReviewStatus('case-demo-new', 'awaiting-doctor')
    pushToast('success', 'Demo case created — open it to inspect the full workflow.')
    window.setTimeout(() => {
      navigate('/app/cases/case-demo-new')
    }, 1200)
  }

  if (!open) return null
  const doneCount = done ? STAGES.length : stage

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
      <div className="sf-fade-in w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-ink-900">AI Intake Demo</h3>
            <p className="text-[11px] text-ink-400">Replaying the complete human-in-the-loop workflow</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between text-[11px] font-medium text-ink-500">
            <span>
              Step {doneCount + 1} of {STAGES.length + 1}
            </span>
            {!done && <Loader2 size={14} className="animate-spin" />}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${(Math.min(doneCount + 1, STAGES.length) / STAGES.length) * 100}%` }}
            />
          </div>
          <ol className="mt-5 max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
            {STAGES.map((s, i) => {
              const isDone = i < stage || done
              const isActive = i === stage && !done
              return (
                <li
                  key={s.label}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isDone ? 'bg-emerald-50 text-emerald-800' : isActive ? 'bg-brand-50 text-ink-800' : 'text-ink-400'
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-inset ring-black/5">
                    {s.icon}
                  </span>
                  <span className="flex-1 font-medium">{s.label}</span>
                  {isDone ? (
                    <CheckCircle2 size={15} className="text-emerald-500" />
                  ) : isActive ? (
                    <Clock size={14} className="animate-pulse text-brand-500" />
                  ) : null}
                </li>
              )
            })}
            <li className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${done ? 'bg-ink-900 text-white' : 'text-ink-400'}`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-brand-300">
                <CheckCircle2 size={15} />
              </span>
              <span className="flex-1 font-medium">AI organized the information — the healthcare professional made the decision.</span>
              {done && <CheckCircle2 size={15} className="text-emerald-400" />}
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
