import { AlertTriangle, CheckCircle2, FileText, Image as ImageIcon, Keyboard, Loader2, Mic, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppDataGrid } from '../components/AppDataGrid'
import { Badge, Button, Card, cx, InfoBanner, Modal, PageHeader, ProgressBar } from '../components/ui'
import { useApp } from '../store/AppStore'
import type { CaseRecord, Report, ReportField, ReportKind, Symptom } from '../types'

type SampleField = Pick<ReportField, 'param' | 'value' | 'unit' | 'referenceRange'>

interface SampleReport {
  id: string
  name: string
  kind: ReportKind
  descriptor: string
  failure?: boolean
  note: string
  fields: SampleField[]
}

const SAMPLES: SampleReport[] = [
  {
    id: 's-cbc',
    name: 'CBC_Report_01.pdf',
    kind: 'cbc',
    descriptor: 'Complete blood count — 4 fields',
    note: 'OCR completed. Field values require human verification.',
    fields: [
      { param: 'Hemoglobin', value: '10.2', unit: 'g/dL', referenceRange: '13.0–17.0' },
      { param: 'WBC Count', value: '11,400', unit: '/µL', referenceRange: '4,000–11,000' },
      { param: 'Platelets', value: '1.8', unit: 'lakh/µL', referenceRange: '1.5–4.5' },
      { param: 'MCV', value: '76', unit: 'fL', referenceRange: '80–100' },
    ],
  },
  {
    id: 's-sugar',
    name: 'BloodSugar_Current.pdf',
    kind: 'blood-sugar',
    descriptor: 'Blood sugar — 2 fields',
    note: 'OCR completed. Values shown as neutral changes, no clinical interpretation.',
    fields: [
      { param: 'Fasting Glucose', value: '141', unit: 'mg/dL', referenceRange: '70–100' },
      { param: 'Postprandial Glucose', value: '198', unit: 'mg/dL', referenceRange: '< 140' },
    ],
  },
  {
    id: 's-xray',
    name: 'ChestXR_Sample.jpg',
    kind: 'xray',
    descriptor: 'Chest radiograph (image understanding)',
    note: 'Uploaded image contains a chest radiograph. Human clinical review required. No diagnosis generated.',
    fields: [],
  },
  {
    id: 's-blur',
    name: 'Blurry_Scan.jpg',
    kind: 'scanned-doc',
    descriptor: 'Low-quality scan — OCR failure demo',
    failure: true,
    note: 'Unable to reliably extract information. Reason: image quality insufficient. No values were invented.',
    fields: [],
  },
]

const LANGUAGES = ['English', 'Hindi', 'Odia'] as const
type Language = (typeof LANGUAGES)[number]

const SAMPLE_TRANSCRIPTS: Record<Language, { original: string; translated: string; chips: string[] }> = {
  English: {
    original: 'I have had fever for three days and weakness since yesterday.',
    translated: 'I have had fever for three days and weakness since yesterday.',
    chips: ['Fever', 'Weakness', 'Headache', 'Body ache', 'Cough'],
  },
  Hindi: {
    original: 'मुझे तीन दिनों से बुखार है और कल से कमजोरी है।',
    translated: 'I have had a fever for three days and weakness since yesterday.',
    chips: ['Fever', 'Weakness', 'Headache', 'Body ache', 'Cough'],
  },
  Odia: {
    original: 'ମୋର ତିନି ଦିନ ହେଲା ଜ୍ୱର ଅଛି, ଏବଂ ଗତକାଲି ଠାରୁ ଦୁର୍ବଳତା ଲାଗୁଛି।',
    translated: 'I have had a fever for three days and weakness since yesterday.',
    chips: ['Fever', 'Weakness', 'Headache', 'Body ache', 'Cough'],
  },
}

const SYMPTOM_CHIPS = ['Fever', 'Headache', 'Cough', 'Weakness', 'Body ache', 'Sore throat', 'Breathing difficulty', 'Dizziness']
const DURATION_OPTIONS = ['Less than a day', '1 day', '2 days', '3 days', '1 week', 'Unknown']

function mockDetect(text: string): Symptom[] {
  const lower = text.toLowerCase()
  const detect = (kw: string[], name: string): Symptom | null => {
    if (kw.some((k) => lower.includes(k))) {
      const dur = lower.includes('three days') || lower.includes('3 days') ? '3 days' : lower.includes('two days') || lower.includes('2 days') ? '2 days' : lower.includes('yesterday') ? '1 day' : 'Unknown'
      return { id: `s-${Math.random().toString(36).slice(2, 7)}`, name, duration: dur, source: 'Patient input (mock extractor)', status: 'ai-extracted' }
    }
    return null
  }
  const out: Symptom[] = []
  for (const s of [detect(['fever', 'bukhar', 'ଜ୍ୱର', 'ଜ୍ବର'], 'Fever'), detect(['weakness', 'kamzori', 'durbalta', 'ଦୁର୍ବଳତା'], 'Weakness'), detect(['headache', 'sir dard', 'sirdard', 'ମୁଣ୍ଡ ବିନ୍ଧା'], 'Headache'), detect(['cough', 'khansi', 'କାଶ'], 'Cough'), detect(['body ache', 'badan dard', 'ଶରୀର ଯନ୍ତ୍ରଣା'], 'Body ache'), detect(['breathing difficulty', 'saans', 'ଶ୍ୱାସ କଷ୍ଟ'], 'Breathing difficulty')]) {
    if (s) out.push(s)
  }
  return out
}

export default function NewIntake() {
  const navigate = useNavigate()
  const { addCase, addReport, pushToast, offlineMode } = useApp()

  // Step 1 — language & consent
  const [language, setLanguage] = useState<Language>('Odia')
  const [consent, setConsent] = useState(false)
  // Step 2 — composition
  const [mode, setMode] = useState<'type' | 'voice' | 'questionnaire'>('voice')
  const [statement, setStatement] = useState('')
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'done' | 'failed'>('idle')
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [queryDone, setQueryDone] = useState(false)
  // Step 3 — report
  const [selectedSample, setSelectedSample] = useState<SampleReport | null>(null)
  const [ocrState, setOcrState] = useState<'idle' | 'processing' | 'done' | 'failed'>('idle')
  // Step 4 — processing overlay
  const [processing, setProcessing] = useState<string[]>([])

  const statementConfirmed = useMemo(() => {
    if (mode === 'questionnaire') return queryDone || selectedChips.length > 0
    if (mode === 'voice') return voiceState === 'done'
    return statement.trim().length > 0
  }, [mode, voiceState, statement, queryDone, selectedChips])

const parsedSymptoms = useMemo(() => {
    const detected = statement ? mockDetect(statement) : []
    const fromChips = selectedChips.map((name) => ({
      id: `s-${Math.random().toString(36).slice(2, 7)}`,
      name,
      duration: 'Unknown',
      source: 'Structured questionnaire',
      status: 'ai-extracted' as const,
    }))
    const seen = new Set<string>()
    return [...fromChips, ...detected].filter((s) => {
      if (seen.has(s.name)) return false
      seen.add(s.name)
      return true
    })
  }, [statement, selectedChips])

  const startRecording = () => {
    setMode('voice')
    setVoiceState('recording')
    window.setTimeout(() => setVoiceState('done'), 2600)
    window.setTimeout(() => setStatement(SAMPLE_TRANSCRIPTS[language].original), 2600)
  }

  const simulateFailure = () => {
    setMode('voice')
    setVoiceState('failed')
    setStatement('')
  }

  const runOcr = () => {
    if (!selectedSample) return
    setOcrState('processing')
    window.setTimeout(() => setOcrState(selectedSample.failure ? 'failed' : 'done'), 2400)
  }

  const submit = () => {
    setProcessing([])
    const steps = [
      'Recording transcript adopted (original preserved)',
      'Translation generated to English',
      'Structured symptom extraction',
      'Timeline generation',
      'Rules engine scan for configured urgency keywords',
      'Missing-information detection',
      'Follow-up questions prepared',
    ]
    let i = 0
    const tick = () => {
      i += 1
      setProcessing((p) => [...p, steps[i - 1] as string])
      if (i >= steps.length) {
        buildCase()
      } else {
        window.setTimeout(tick, 700)
      }
    }
    window.setTimeout(tick, 500)
  }

  const buildCase = () => {
    const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`
    const report = selectedSample && !selectedSample.failure
    const detectedSymptoms = parsedSymptoms.length > 0 ? parsedSymptoms : [{ id: uid('s'), name: 'Symptom reported', duration: 'Unknown', source: 'Patient input', status: 'ai-extracted' as const }]
    const hasUrgent = detectedSymptoms.some((s) => /breathing/i.test(s.name))
    const hasPrompt = detectedSymptoms.some((s) => /fever/i.test(s.name)) && detectedSymptoms.some((s) => /weakness/i.test(s.name))
    const concern = statement || (selectedChips.length ? `${selectedChips.join(', ')} selected in questionnaire` : 'Symptoms reported')
    const concernForChips = selectedChips.length ? `${selectedChips.join(', ')} — duration to be confirmed` : ''

    const sampleReportId = report ? `rpt-intake-${uid('')}` : null
    const caseRec: CaseRecord = {
      id: `case-intake-${uid('')}`,
      patientId: 'SYN-2026-' + Math.floor(100 + Math.random() * 900),
      language,
      mode: 'opd',
      chiefConcern: concern,
      originalTranscript: mode === 'voice' ? SAMPLE_TRANSCRIPTS[language].original + (selectedChips.length ? `\n+ ${selectedChips.join(', ')}` : '') : mode === 'questionnaire' ? concernForChips : statement,
      transcriptLanguage: mode === 'voice' ? language : undefined,
      translatedConcern: mode === 'voice' ? SAMPLE_TRANSCRIPTS[language].translated : statement,
      symptoms: hasPrompt ? [...detectedSymptoms, { id: uid('s'), name: 'Fever duration', duration: '3 days', source: 'Patient input (mock extractor)', status: 'ai-extracted' as const }] : detectedSymptoms,
      timeline: [
        { id: uid('t'), dayLabel: 'Day 1', text: 'Symptoms reported by patient.', source: mode === 'voice' ? 'Voice transcript' : 'Patient input' },
      ],
      reportedHistory: [],
      reportedMedications: [],
      missingInfo: ['Severity', 'Relevant previous history', 'Associated symptoms'],
      completeness: 50,
      followUpQuestions: [
        { id: uid('q'), question: 'How long has each symptom lasted?', status: 'suggested' },
        { id: uid('q'), question: 'How severe are the symptoms?', status: 'suggested' },
        { id: uid('q'), question: 'Any relevant previous history or medications?', status: 'suggested' },
      ],
      urgencySignals: hasUrgent
        ? [{ id: uid('u'), level: 'urgent', reason: 'Reported "breathing difficulty" matched a configured urgent-review keyword group.', rule: 'RULE-BREATHING-URGENT', status: 'active' }]
        : hasPrompt
          ? [{ id: uid('u'), level: 'prompt', reason: 'Reported weakness combined with fever maps to the configured prompt-review keyword group.', rule: 'RULE-FEVER-WEAKNESS-PROMPT', status: 'active' }]
          : [],
      reviewStatus: 'awaiting-nurse',
      consent: { status: 'granted', at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), purpose: ['Symptom organisation', 'Report processing', 'Healthcare-worker review'] },
      reportIds: sampleReportId ? [sampleReportId] : [],
      createdAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      updatedAt: '',
      reporter: 'Patient (self)',
      corrections: [],
      referral: null,
    }

    if (sampleReportId && selectedSample) {
      const rep: Report = {
        id: sampleReportId,
        caseId: caseRec.id,
        name: selectedSample.name,
        type: selectedSample.kind === 'cbc' || selectedSample.kind === 'blood-sugar' ? 'pdf' : 'image',
        kind: selectedSample.kind,
        date: '2026-09-18',
        ocrStatus: 'done',
        aiNote: selectedSample.note,
        fields: selectedSample.fields.map((f) => ({ ...f, id: uid('f'), status: 'needs-verification' as const })),
      }
      addReport(rep)
    }

    addCase(caseRec)
    pushToast('success', `Case ${caseRec.patientId} created and added to the triage queue.`)
    window.setTimeout(() => navigate(`/app/cases/${caseRec.id}`), 900)
  }

  const processingDone = false
  const canSubmit = consent && (statementConfirmed || parsedSymptoms.length > 0)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New Patient Intake" subtitle="Capture the patient's story — by voice, text, questionnaire or report. AI organizes; staff decide." />

      <InfoBanner tone="rose">
        <strong className="font-extrabold">Patient safety warning.</strong> This is an educational triage-support
        prototype. It does not provide diagnosis or treatment. If you are experiencing a medical emergency, seek
        immediate help from qualified healthcare professionals or local emergency services.
      </InfoBanner>

      {/* workflow progress */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white p-2.5 shadow-[var(--shadow-card)]">
        {[
          { label: 'Language & consent', done: consent },
          { label: 'Symptoms', done: statementConfirmed || parsedSymptoms.length > 0 },
          { label: 'Reports (optional)', done: ocrState === 'done' },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex flex-1 items-center gap-2">
            <div className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold', s.done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-400')}>
              {s.done ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span className={cx('text-[11px] font-bold', s.done ? 'text-emerald-700' : 'text-ink-500')}>{s.label}</span>
            {i < arr.length - 1 && <span className="hidden h-px flex-1 bg-ink-200 sm:block" />}
          </div>
        ))}
      </div>

      {/* Step 1 - language + consent */}
      <Card title="1 · Language & consent">
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              className={cx(
                'rounded-xl px-4 py-2 text-sm font-bold transition-all',
                language === l
                  ? 'bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm shadow-brand-900/20 ring-1 ring-inset ring-brand-700'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-ink-200 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
            <ShieldCheck size={15} className="text-brand-600" />
            Information is used for:
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-ink-600">
            <li>Symptom organisation and timeline preparation</li>
            <li>Report (OCR) processing</li>
            <li>Healthcare-worker and doctor review</li>
          </ul>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4 accent-brand-700" />
            <span>
              I give consent to process this synthetic/sample information for the above purposes.
            </span>
          </label>
        </div>
        {!consent && <p className="mt-2 text-[11px] text-amber-600">Consent is required before submission.</p>}
      </Card>

      {/* Step 2 - composition */}
      <Card title="2 · Describe symptoms">
        <div className="grid grid-cols-3 gap-2">
          <ModeBtn active={mode === 'voice'} icon={<Mic size={17} />} label="Speak" onClick={() => setMode('voice')} />
          <ModeBtn active={mode === 'type'} icon={<Keyboard size={17} />} label="Type" onClick={() => setMode('type')} />
          <ModeBtn active={mode === 'questionnaire'} icon={<FileText size={17} />} label="Quick select" onClick={() => setMode('questionnaire')} />
        </div>

        {mode === 'voice' && (
          <div className="mt-4 flex flex-col items-center rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 p-6">
            {voiceState === 'recording' && (
              <div className="sf-recording flex h-20 w-20 items-center justify-center rounded-full bg-rose-500 text-white">
                <Mic size={30} />
              </div>
            )}
            {voiceState !== 'recording' && (
              <button onClick={startRecording} className={cx('flex h-20 w-20 items-center justify-center rounded-full text-white transition-colors', voiceState === 'done' ? 'bg-emerald-500' : 'bg-brand-700 hover:bg-brand-800')} style={{ minHeight: 80 }}>
                <Mic size={30} />
              </button>
            )}
            <p className="mt-3 text-sm font-medium text-ink-700">
              {voiceState === 'idle' && 'Tap the microphone and speak your symptoms'}
              {voiceState === 'recording' && 'Listening…'}
              {voiceState === 'done' && 'Transcript ready — please confirm or correct below'}
              {voiceState === 'failed' && 'Unable to reliably transcribe this recording.'}
            </p>
            {voiceState === 'recording' && (
              <div className="mt-3 flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="sf-pulse-dot h-2.5 w-2.5 rounded-full bg-rose-500" style={{ animationDelay: `${i * 0.25}s` }} />
                ))}
              </div>
            )}
            {voiceState === 'failed' && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={startRecording}>Retry recording</Button>
                <Button variant="secondary" size="sm" onClick={() => setMode('type')}>Enter manually</Button>
              </div>
            )}
            {voiceState === 'done' && (
              <div className="mt-3 w-full">
                <textarea
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  className="w-full rounded-lg border border-ink-200 bg-white p-3 text-sm outline-none focus:border-brand-500"
                  rows={2}
                />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-ink-50 p-2 text-[11px] text-ink-500">
                    Original: {SAMPLE_TRANSCRIPTS[language].original}
                  </div>
                  <div className="rounded-lg bg-brand-50 p-2 text-[11px] text-brand-800">
                    Translated (English): {SAMPLE_TRANSCRIPTS[language].translated}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="success" size="sm" onClick={() => pushToast('success', 'Transcript confirmed by patient.')}>
                    <CheckCircle2 size={13} /> Confirm transcript
                  </Button>
                  <Button variant="ghost" size="sm" onClick={simulateFailure}>Simulate STT failure</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'type' && (
          <div className="mt-4">
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder={SAMPLE_TRANSCRIPTS[language].translated}
              className="w-full rounded-xl border border-ink-200 bg-white p-4 text-sm leading-relaxed outline-none focus:border-brand-500"
              rows={4}
            />
            <p className="mt-1.5 text-[11px] text-ink-400">
              Typed in {language}. The system preserves the original input and shows the English version for staff.
            </p>
          </div>
        )}

        {mode === 'questionnaire' && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-ink-600">Select symptoms (large touch targets for low-literacy use):</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SYMPTOM_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setSelectedChips((p) => (p.includes(chip) ? p.filter((c) => c !== chip) : [...p, chip]))}
                  className={cx(
                    'rounded-xl px-3 py-4 text-center text-sm font-semibold transition-colors',
                    selectedChips.includes(chip) ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Duration (optional)</p>
              <select className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-500">
                {DURATION_OPTIONS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <div>
                <Button variant="secondary" size="sm" onClick={() => setQueryDone(true)}>
                  <CheckCircle2 size={13} /> Done selecting
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Step 3 - report */}
      <Card title="3 · Upload report (optional)" subtitle="PDF, JPG or PNG — OCR extracts parameters; nothing is auto-diagnosed.">
        <div className="grid gap-2 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedSample(s); setOcrState('idle') }}
              className={cx(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                selectedSample?.id === s.id ? 'border-brand-500 bg-brand-50/50' : 'border-ink-200 hover:bg-ink-50',
              )}
            >
              <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', s.kind === 'xray' ? 'bg-violet-100 text-violet-600' : s.failure ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600')}>
                {s.kind === 'xray' ? <ImageIcon size={17} /> : <FileText size={17} />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink-800">{s.name}</p>
                <p className="text-[11px] text-ink-400">{s.descriptor}</p>
                {s.failure && <Badge className="mt-1 bg-rose-50 text-rose-700 ring-rose-200">Fails safely</Badge>}
              </div>
            </button>
          ))}
        </div>
        {selectedSample && ocrState === 'idle' && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2">
            <p className="text-xs text-ink-600">Selected: <strong>{selectedSample.name}</strong></p>
            <Button size="sm" onClick={runOcr}>
              <Upload size={13} /> Run OCR
            </Button>
          </div>
        )}
        {ocrState === 'processing' && (
          <div className="mt-3 rounded-lg border border-ink-200 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-700">
              <Loader2 size={15} className="animate-spin text-brand-600" /> Simulating OCR extraction…
            </p>
            <div className="mt-2">
              <ProgressBar value={70} />
            </div>
            <p className="mt-2 text-[11px] text-ink-400">Values will be marked “needs verification” and carry a source reference.</p>
          </div>
        )}
        {selectedSample && ocrState === 'done' && !selectedSample.failure && (
          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={13} /> OCR completed — {selectedSample.name}
            </p>
            {selectedSample.kind === 'xray' && (
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-800">
                <strong>AI-generated — requires qualified human review.</strong> Uploaded image contains a chest
                radiograph. Human clinical review is required. No diagnosis generated.
              </p>
            )}
            {selectedSample.fields.length > 0 && (
              <AppDataGrid<SampleField>
                rows={selectedSample.fields}
                ariaLabel="Extracted values"
                getRowId={(f) => f.param}
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
                  { field: 'referenceRange', headerName: 'Range', flex: 1, renderCell: (p) => <span className="text-ink-500">{p.row.referenceRange}</span> },
                  {
                    field: 'status',
                    headerName: 'Status',
                    width: 160,
                    sortable: false,
                    filterable: false,
                    renderCell: () => <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Needs verification</Badge>,
                  },
                ]}
              />
            )}
            <p className="text-[10px] text-ink-400">Source: {selectedSample.name} · OCR values are never converted into a diagnosis.</p>
          </div>
        )}
        {ocrState === 'failed' && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
              <AlertTriangle size={15} /> Unable to reliably extract information.
            </p>
            <p className="mt-1 text-xs text-rose-700">
              Reason: image quality insufficient. No values were invented by the system.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setOcrState('processing'); runOcr() }}>Upload clearer image</Button>
              <Button variant="secondary" size="sm" onClick={() => pushToast('info', 'Manual entry enabled (demo)')}>Enter manually</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Review + submit */}
      <Card title="4 · Review & submit" subtitle="Before submission, confirm the AI-prepared structure.">
        <div className="space-y-2 rounded-lg bg-ink-50 p-4 text-sm">
          <p className="flex items-center justify-between"><span className="text-ink-500">Language</span><span className="font-semibold text-ink-800">{language}</span></p>
          <p className="flex items-center justify-between gap-4"><span className="text-ink-500">Original input</span><span className="flex-1 text-right font-medium text-ink-700">{mode === 'voice' ? SAMPLE_TRANSCRIPTS[language].original : mode === 'questionnaire' ? `${selectedChips.join(', ')}` : statement || '—'}</span></p>
          <p className="flex items-center justify-between gap-4"><span className="text-ink-500">Detected symptoms</span><span className="flex-1 text-right font-medium text-ink-700">{parsedSymptoms.length ? parsedSymptoms.map((s) => `${s.name} (${s.duration})`).join(', ') : '—'}</span></p>
          <p className="flex items-center justify-between"><span className="text-ink-500">Report</span><span className="font-semibold text-ink-800">{selectedSample && !selectedSample.failure ? selectedSample.name : 'None'}</span></p>
          <p className="flex items-center justify-between"><span className="text-ink-500">Consent</span><span className="font-semibold text-emerald-700">{consent ? 'Granted' : 'Not granted'}</span></p>
        </div>
        {!consent && <p className="mt-2 text-[11px] text-amber-600">Consent is required before submission.</p>}
        {consent && !statementConfirmed && parsedSymptoms.length === 0 && (
          <p className="mt-2 text-[11px] text-amber-600">Add symptoms by speaking, typing or selecting before submission.</p>
        )}
        <Button
          className="mt-4 w-full"
          size="lg"
          disabled={!canSubmit || processing.length > 0}
          onClick={submit}
        >
          <Sparkles size={16} /> {offlineMode ? 'Create case (queued for sync)' : 'Run AI organization & create case'}
        </Button>
        <p className="mt-2 text-center text-[11px] text-ink-400">
          Original input is stored. Nothing is fabricated. Missing fields are marked Unknown / Not provided.
        </p>
      </Card>

      {/* Processing overlay */}
      <Modal open={processing.length > 0 && !processingDone} onClose={() => {}} title={processing.length > 0 && processing.length < 7 ? 'Organizing the case…' : 'Case created'}>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5, 6].map((idx) => {
            if (processing[idx]) {
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -12, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200"
                >
                  <span>{processing[idx]}</span>
                  <motion.span
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                  >
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  </motion.span>
                </motion.div>
              )
            }
            return (
              <div key={idx} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-400">
                <Loader2 size={14} className="animate-spin" /> Processing…
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

function ModeBtn({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cx(
        'flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-5 text-sm font-semibold transition-colors',
        active ? 'border-brand-500 bg-brand-50 text-brand-800 shadow-sm' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
      )}
    >
      {icon}
      {label}
    </motion.button>
  )
}

export function IntakeWarning() {
  return null
}
