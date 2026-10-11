import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Languages,
  Loader2,
  Mic,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTriage, type IntakeSubmission } from '../../context/TriageContext'
import { useOffline } from '../../context/OfflineContext'
import { useLanguageDetection } from '../../hooks/useLanguageDetection'
import { useSpeechToText } from '../../hooks/useSpeechToText'
import { summarizeRedactions } from '../../lib/format'
import { anonymizePreview } from '../../services/api'
import type { TriageAnalyzeResult } from '../../services/languageApi'
import { CONSENT_POLICY_VERSION, RETENTION_SECTION_LABELS } from '../../services/safetyPolicy'
import { MAX_REPORT_FILES, validateReportFiles } from '../../services/reportRules'
import { useApp } from '../../store/AppStore'
import type { ReportExtractionResult, ExtractedLabValue, ExtractedVital } from '../../types/report.types'
import {
  CODE_BY_INTAKE_LANGUAGE,
  resolveIntakeLanguage,
  type LanguageSelectorValue,
} from '../../types/language.types'
import type {
  AgeBand,
  ImageInput,
  IntakePoint,
  PatientSession,
  Redaction,
  SexMarker,
  VoiceInput,
} from '../../types/triage'
import { generatePatientId } from '../../utils/id'
import { Badge, Button, Card, cx, InfoBanner, Modal, PageHeader } from '../ui'
import TimelineSummaryCard from '../timeline/TimelineSummaryCard'
import FollowUpList from '../followups/FollowUpList'
import ExtractedValuesTable from '../reports/ExtractedValuesTable'
import LanguageSelector from './LanguageSelector'
import MultilingualDisclaimer from '../triage/MultilingualDisclaimer'

const AGE_BANDS: AgeBand[] = ['0-17', '18-39', '40-59', '60+', 'Unknown']
const SEX_MARKERS: SexMarker[] = ['Female', 'Male', 'Other', 'Not stated']
const INTAKE_POINTS: IntakePoint[] = ['OPD', 'Health camp', 'Follow-up', 'Emergency triage']

export default function IntakeForm() {
  const navigate = useNavigate()
  const { pushToast } = useApp()
  const { online } = useOffline()
  const {
    permissions,
    setLanguage,
    setDetectedLanguage,
    previewNote,
    createSession,
    uploadReportsToSession,
    uploadVisualsToSession,
    sessions,
    working,
    error,
    resetError,
  } = useTriage()

  // Anonymized surrogate is generated immediately, before any data is typed.
  const [patientId] = useState(() => generatePatientId())
  const [consentOpen, setConsentOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const [reportErrors, setReportErrors] = useState<string[]>([])
  const [reportUploading, setReportUploading] = useState(false)
  const [done, setDone] = useState<{
    sessionId: string
    results: ReportExtractionResult[]
    uploadFailed: string | null
  } | null>(null)

  const doneSession = useMemo(
    () => sessions.find((s) => s.id === done?.sessionId) ?? null,
    [done, sessions],
  )

  const [languageChoice, setLanguageChoice] = useState<LanguageSelectorValue>('auto')
  const [ageBand, setAgeBand] = useState<AgeBand>('Unknown')
  const [sex, setSex] = useState<SexMarker>('Not stated')
  const [intakePoint, setIntakePoint] = useState<IntakePoint>('OPD')

  const [text, setText] = useState('')
  const [voice, setVoice] = useState<VoiceInput | null>(null)
  const [image, setImage] = useState<ImageInput | null>(null)

  // Auto-detect is the default: the resolved language drives voice capture,
  // the anonymization preview and the recorded session.
  const { detected, detecting } = useLanguageDetection(text, languageChoice === 'auto', 400)
  const language = useMemo(() => resolveIntakeLanguage(languageChoice, detected), [languageChoice, detected])
  const languageCode = CODE_BY_INTAKE_LANGUAGE[language]

  // Mirror the resolved selection into the context so reviewer surfaces and the
  // preview fallback read the intake's actual language.
  useEffect(() => {
    setLanguage(language)
  }, [language, setLanguage])
  useEffect(() => {
    setDetectedLanguage(detected)
  }, [detected, setDetectedLanguage])

  const stt = useSpeechToText((finalText) => {
    setText(finalText)
    setVoice({ blob: null, objectUrl: null, transcript: finalText, language, source: 'microphone' })
  })

  // Live PII preview — rules live in the backend, preview is debounced.
  const [serverPreview, setServerPreview] = useState<{ redactedCount: number; redactions: Redaction[] }>({
    redactedCount: 0,
    redactions: [],
  })
  const redactionPreview = text.trim() ? serverPreview : { redactedCount: 0, redactions: [] as Redaction[] }

  useEffect(() => {
    if (!text.trim()) return
    const timer = window.setTimeout(() => {
      anonymizePreview(text, language)
        .then((r) => setServerPreview(r.anonymization))
        .catch(() => undefined)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [text, language])
  const hasInput = text.trim().length > 0 || voice !== null || image !== null || reportFiles.length > 0

  // Staff-only live draft preview (patients are never allowed to call analyze).
  const canPreview = permissions.canEditNote
  const [preview, setPreview] = useState<{ loading: boolean; result: TriageAnalyzeResult | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  })

  const runPreview = async () => {
    if (!canPreview || !text.trim()) return
    setPreview({ loading: true, result: null, error: null })
    const result = await previewNote(text, language)
    if (result) setPreview({ loading: false, result, error: null })
    else
      setPreview({
        loading: false,
        result: null,
        error: 'Live preview is unavailable for this role or the backend rejected it. The note is still prepared at submission.',
      })
  }

  const attachAudio = (file: File) => {
    stt.reset()
    setVoice({ blob: file, objectUrl: URL.createObjectURL(file), transcript: '', language, source: 'file' })
  }

  const attachImage = (file: File) => {
    if (image?.objectUrl) URL.revokeObjectURL(image.objectUrl)
    setImage({ file, objectUrl: URL.createObjectURL(file), caption: '', kind: 'clinical-photo' })
  }

  const removeImage = () => {
    if (image?.objectUrl) URL.revokeObjectURL(image.objectUrl)
    setImage(null)
  }

  const addReportFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...reportFiles, ...Array.from(list)]
    setReportFiles([...new Map(next.map((f) => [f.name + f.size, f])).values()].slice(0, MAX_REPORT_FILES))
    setReportErrors(validateReportFiles(next.slice(0, MAX_REPORT_FILES)))
  }

  const removeReportFile = (name: string) => {
    setReportFiles((prev) => prev.filter((f) => f.name + f.size !== name))
    setReportErrors([])
  }

  const openConsent = () => {
    resetError()
    if (!hasInput) {
      setFormError('Add at least one input — narrative, recording, photograph or report — before submission.')
      return
    }
    if (text.trim().length === 0 && voice === null) {
      setFormError('Add a narrative or a voice recording so the note has a patient-reported story.')
      return
    }
    setFormError(null)
    setConsentOpen(true)
  }

  const submit = async () => {
    if (!acknowledged) return
    const submission: IntakeSubmission = {
      patientId,
      ageBand,
      sex,
      intakePoint,
      language,
      text,
      voice,
      image,
      document: null,
      consentAcknowledged: true,
    }
    setConsentOpen(false)
    const createdId = await createSession(submission)
    if (!createdId) return

    let uploadFailed: string | null = null

    // Files are online-only. When offline (or when the intake was queued), stop
    // here — the typed note is saved and syncs automatically; files must be
    // attached after reconnecting.
    if (!online || createdId.startsWith('offline-')) {
      if (image?.file || reportFiles.length > 0) {
        pushToast('info', 'Photos and reports need a connection — attach them after reconnecting. The typed note is saved offline.')
      }
      setDone({ sessionId: createdId, results: [], uploadFailed: null })
      return
    }

    if (image?.file) {
      const visualOutcome = await uploadVisualsToSession(createdId, [image.file])
      if (!visualOutcome.ok) uploadFailed = visualOutcome.error ?? 'The photograph could not be processed.'
    }

    if (reportFiles.length > 0) {
      setReportUploading(true)
      const outcome = await uploadReportsToSession(createdId, reportFiles)
      setReportUploading(false)
      if (!outcome.ok) uploadFailed = outcome.error ?? 'Unknown upload error.'
      if (uploadFailed) {
        pushToast('error', `The session was created but an upload failed: ${uploadFailed}`)
        setDone({ sessionId: createdId, results: outcome.results, uploadFailed })
        return
      }
      pushToast('success', `${outcome.results.length} report(s) read — every extracted value awaits doctor verification.`)
      setDone({ sessionId: createdId, results: outcome.results, uploadFailed: null })
      return
    }

    if (uploadFailed) {
      pushToast('error', `The session was created but the photo upload failed: ${uploadFailed}`)
      setDone({ sessionId: createdId, results: [], uploadFailed })
      return
    }

    if (image?.file) {
      pushToast('success', 'Photograph redacted and stored — a healthcare worker reviews the description next.')
    } else {
      pushToast('success', `Note prepared for ${patientId}. It is a draft — a healthcare worker reviews it next.`)
    }
    navigate('/app/review')
  }

  if (done) {
    const labs: ExtractedLabValue[] = done.results.flatMap((r) => r.report.labValues)
    const vitals: ExtractedVital[] = done.results.flatMap((r) => r.report.vitals)
    return (
      <IntakeComplete
        sessionId={done.sessionId}
        session={doneSession}
        labs={labs}
        vitals={vitals}
        uploadFailed={done.uploadFailed}
        onReview={() => navigate('/app/review')}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Human-in-the-loop intake"
        title="Multimodal Patient Intake"
        subtitle="Capture the story by text, voice, photograph or report. Identifiers are stripped before AI processing, and the output is an observational note for a healthcare worker — never a diagnosis or prescription."
      />

      <div className="sf-fade-in">
        <MultilingualDisclaimer language={languageCode} compact />
      </div>

      <InfoBanner tone="rose">
        <strong className="font-extrabold">Patient safety.</strong> If the patient has chest pain, severe breathing
        difficulty, uncontrolled bleeding, reduced consciousness or fits, escalate to emergency care now — do not wait
        for this system. This tool does not diagnose and does not prescribe.
      </InfoBanner>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <AlertTriangle size={14} /> Could not prepare the note
          </p>
          <p className="mt-1 text-xs text-rose-700">{error}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={resetError}>
            Dismiss
          </Button>
        </div>
      )}

      {/* ---------- 1. Demographics (anonymized) ---------- */}
      <Card title="1 · Patient details (anonymized)" subtitle="No name, phone or address fields — identity is a surrogate ID only.">
        <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-700">Anonymized patient ID</p>
          <p className="mt-1 font-mono text-sm font-bold text-brand-900">{patientId}</p>
          <p className="mt-1 text-[11px] text-brand-800">
            Generated on this device. The original identifiers never leave the browser.
          </p>
        </div>

        <LanguageSelector
          id="intake-language"
          value={languageChoice}
          onChange={setLanguageChoice}
          detected={detected}
          detecting={detecting}
        />

        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Demographic details</legend>
          <SelectField id="intake-point" label="Intake point" value={intakePoint} onChange={(v) => setIntakePoint(v as IntakePoint)} options={INTAKE_POINTS} />
          <SelectField id="age-band" label="Age band" value={ageBand} onChange={(v) => setAgeBand(v as AgeBand)} options={AGE_BANDS} />
          <SelectField id="sex-marker" label="Sex recorded" value={sex} onChange={(v) => setSex(v as SexMarker)} options={SEX_MARKERS} />
        </fieldset>
      </Card>

      {/* ---------- 2. Narrative ---------- */}
      <Card
        title="2 · Narrative (text or voice)"
        subtitle={`Multilingual capture — ${language}. Your words are anonymized before any processing.`}
      >
        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={stt.listening ? 'danger' : 'primary'}
              onClick={() => (stt.listening ? stt.stop() : stt.start(language))}
              aria-pressed={stt.listening}
              title={stt.supported ? 'Speak the symptoms' : 'Live transcription unavailable'}
            >
              <Mic size={15} />
              {stt.listening ? 'Stop recording' : `Speak in ${language}`}
            </Button>
            <FilePicker
              id="voice-file"
              accept="audio/*"
              label="Upload a recording"
              hint={stt.supported ? 'Alternative to live capture.' : 'Live transcription is unavailable in this browser — upload a recording instead.'}
              onFile={attachAudio}
            />
          </div>

          <div aria-live="polite" className="mt-3 text-xs text-ink-600">
            {stt.listening && <span className="font-semibold text-rose-600">Listening… speak clearly.</span>}
            {stt.listening && stt.interim && <span className="ml-2 text-ink-400">{stt.interim}</span>}
            {!stt.listening && stt.supported && <span className="text-ink-400">Microphone idle.</span>}
          </div>
          {stt.error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
              {stt.error}
            </p>
          )}

          {voice && (
            <div className="mt-3 rounded-lg border border-ink-200 bg-white p-3">
              <p className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-700">
                <span>{voice.source === 'file' ? 'Uploaded recording' : 'Live transcript'}</span>
                <button
                  type="button"
                  className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
                  onClick={() => {
                    stt.reset()
                    setVoice(null)
                  }}
                  aria-label="Remove voice input"
                >
                  <Trash2 size={14} />
                </button>
              </p>
              {voice.objectUrl && <audio controls src={voice.objectUrl} className="mt-2 w-full" aria-label="Recorded symptom description" />}
              {voice.source === 'microphone' && voice.transcript && (
                <p className="mt-2 text-xs text-ink-600">{voice.transcript}</p>
              )}
              {voice.source === 'file' && (
                <p className="mt-2 text-[11px] text-ink-400">
                  Recording attached for the healthcare worker to listen to. Transcription was not run.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4">
          <label htmlFor="narrative" className="mb-1.5 block text-xs font-bold text-ink-700">
            Typed narrative
          </label>
          <textarea
            id="narrative"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            aria-describedby="narrative-hint"
            placeholder={`Describe symptoms in ${language}, for example: "Fever for 3 days with weakness since yesterday."`}
            className="w-full rounded-xl border border-ink-200 bg-white p-3.5 text-sm leading-relaxed text-ink-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          <p id="narrative-hint" className="mt-1.5 text-[11px] text-ink-400">
            Do not type the patient's name or phone number — identifiers are stripped automatically before the AI layer
            sees the text.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <Badge className="bg-white text-ink-600 ring-ink-200" icon={<Languages size={11} />}>
              {language}
            </Badge>
            <Badge className={redactionPreview.redactedCount ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-ink-100 text-ink-500 ring-ink-200'}>
              {redactionPreview.redactedCount} identifier(s) will be stripped
            </Badge>
            {redactionPreview.redactedCount > 0 && <span className="text-ink-400">{summarizeRedactions(redactionPreview)}</span>}
          </div>
        </div>
      </Card>

      {/* ---------- 3. Visual input ---------- */}
      <Card title="3 · Visual input (optional)" subtitle="Photograph of a rash, wound or visible symptom — reviewed by a human, never auto-classified.">
        {!image ? (
          <FilePicker
            id="image-file"
            accept="image/*"
            label="Upload a photograph"
            hint="JPG or PNG. The image is stored in this session only."
            onFile={attachImage}
          />
        ) : (
          <div className="rounded-xl border border-ink-200 bg-white p-3">
            <div className="flex gap-3">
              <img
                src={image.objectUrl ?? ''}
                alt={image.caption || 'Uploaded clinical photograph awaiting review'}
                className="h-24 w-24 rounded-lg border border-ink-200 object-cover"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor="image-caption" className="mb-1 block text-xs font-bold text-ink-700">
                  What does the photo show?
                </label>
                <input
                  id="image-caption"
                  value={image.caption}
                  onChange={(e) => setImage({ ...image, caption: e.target.value })}
                  placeholder="e.g. rash on the left forearm"
                  className="inp"
                />
                <p className="mt-1.5 text-[11px] text-ink-400">
                  Caption is a description only — no interpretation is generated from the image.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="ghost" onClick={removeImage}>
                <Trash2 size={13} /> Remove
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ---------- 4. Reports ---------- */}
      <Card title="4 · Reports (optional)" subtitle="PDF, JPEG or PNG test results — values are extracted by the backend and marked 'needs verification' until a human checks them.">
        <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
          <input
            id="report-files"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            className="sr-only"
            aria-describedby="report-files-hint"
            onChange={(e) => {
              addReportFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <label
            htmlFor="report-files"
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-ink-700 transition hover:border-brand-400 hover:text-brand-700 focus-within:ring-2 focus-within:ring-brand-500/40"
          >
            <Paperclip size={14} /> Choose report files
          </label>
          <p id="report-files-hint" className="mt-1.5 text-[11px] text-ink-400">
            Up to {MAX_REPORT_FILES} files, 10 MB each. Uploaded after the session is created — the backend strips
            identifiers and never invents values.
          </p>

          {reportFiles.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {reportFiles.map((f) => (
                <li key={f.name + f.size} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-ink-200">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-700">{f.name}</span>
                  <span className="text-[11px] text-ink-400">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
                    onClick={() => removeReportFile(f.name + f.size)}
                    aria-label={`Remove ${f.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {reportErrors.length > 0 && (
            <ul role="alert" className="mt-2 space-y-1 rounded-lg bg-rose-50 px-3 py-2">
              {reportErrors.map((e) => (
                <li key={e} className="text-[11px] font-semibold text-rose-700">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ---------- 5. Review & consent ---------- */}
      <Card title="5 · Review & submit" subtitle="A consent step with the non-diagnostic disclaimer is mandatory.">
        <dl className="space-y-2 rounded-xl bg-ink-50 p-4 text-xs">
          <SummaryRow label="Patient ID" value={patientId} mono />
          <SummaryRow label="Language" value={language} />
          <SummaryRow label="Age band · sex" value={`${ageBand} · ${sex}`} />
          <SummaryRow label="Narrative" value={text.trim() ? `${text.trim().length} characters` : 'Voice or file only'} />
          <SummaryRow label="Recording" value={voice ? (voice.source === 'file' ? 'File attached' : 'Live transcript') : 'None'} />
          <SummaryRow label="Photograph" value={image ? image.caption || 'Attached (no caption yet)' : 'None'} />
          <SummaryRow label="Reports" value={reportFiles.length > 0 ? `${reportFiles.length} file(s) staged` : 'None'} />
          <SummaryRow label="Identifiers to strip" value={String(redactionPreview.redactedCount)} />
        </dl>

        {formError && (
          <p role="alert" className="mt-3 text-xs font-semibold text-amber-700">
            {formError}
          </p>
        )}

        <Button className="mt-4 w-full" size="lg" onClick={openConsent} disabled={working}>
          <ShieldCheck size={16} /> Review consent & generate triage note
        </Button>
        <p className="mt-2 text-center text-[11px] text-ink-400">
          Output is an observational note with questions — no diagnosis, no prescription, no treatment advice.
        </p>
      </Card>

      {/* ---------- Consent modal ---------- */}
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Consent & non-diagnostic acknowledgement">
        <div className="space-y-4">
          <MultilingualDisclaimer language={languageCode} />

          <div className="rounded-xl border border-ink-200 p-3.5">
            <p className="text-xs font-bold text-ink-800">Information will be used for</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-ink-600">
              <li>Symptom organisation and timeline preparation</li>
              <li>Report / OCR extraction marked for verification</li>
              <li>Healthcare-worker and doctor review</li>
            </ul>
            <p className="mt-2 text-[11px] text-ink-500">
              Anonymized ID for this session: <span className="font-mono font-bold text-ink-700">{patientId}</span>
            </p>
            <p className="mt-1 text-[11px] text-ink-500">
              Identifiers stripped from the narrative before processing: {redactionPreview.redactedCount} · recorded
              language: {language}
            </p>
          </div>

          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5">
            <p className="text-xs font-bold text-ink-800">{RETENTION_SECTION_LABELS[languageCode].retentionHeading}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
              {RETENTION_SECTION_LABELS[languageCode].subtitle}
            </p>
            <p className="mt-1.5 text-[11px] font-semibold text-ink-500">
              Policy {CONSENT_POLICY_VERSION} · {RETENTION_SECTION_LABELS[languageCode].dataLifecycle}
            </p>
          </div>

          {canPreview && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5">
              <p className="flex items-center justify-between gap-2 text-xs font-bold text-sky-800">
                <span>Live AI draft preview (staff only)</span>
                <Button size="sm" variant="secondary" onClick={runPreview} disabled={preview.loading || !text.trim()}>
                  {preview.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {preview.loading ? 'Preparing…' : preview.result ? 'Refresh preview' : 'Preview the draft note'}
                </Button>
              </p>
              {preview.error && (
                <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">
                  {preview.error}
                </p>
              )}
              {preview.result && (
                <div className="mt-2 space-y-1.5 text-[11px] text-sky-900">
                  <p>
                    <span className="font-bold">Chief complaint:</span>{' '}
                    {preview.result.note.structuredNote.chiefComplaint || '—'}
                  </p>
                  <p className="truncate">
                    <span className="font-bold">History:</span> {preview.result.note.structuredNote.history}
                  </p>
                  <p className="flex flex-wrap gap-1.5 pt-1">
                    <Badge className="bg-white text-sky-700 ring-sky-300">
                      {preview.result.detectedLanguage.label} · {Math.round(preview.result.detectedLanguage.confidence * 100)}%
                    </Badge>
                    <Badge className="bg-white text-sky-700 ring-sky-300">
                      {preview.result.note.urgencyFlags.length} urgency signal(s)
                    </Badge>
                    <Badge className="bg-white text-sky-700 ring-sky-300">
                      {preview.result.note.missingInformation.length} missing field(s)
                    </Badge>
                  </p>
                  <p className="text-[10px] text-sky-700">
                    This draft is a workflow aid only — it is not stored until you submit below, and it never diagnoses.
                  </p>
                </div>
              )}
              {!preview.result && !preview.error && (
                <p className="mt-2 text-[11px] text-sky-700">
                  See the structured draft before it becomes a stored record. Patients do not get this step.
                </p>
              )}
            </div>
          )}

          <label htmlFor="consent-ack" className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-200 p-3.5">
            <input
              id="consent-ack"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#1f7d6b]"
              aria-describedby="consent-ack-hint"
            />
            <span className="text-xs leading-relaxed text-ink-700">
              The patient (or attendant) consents to processing for the purposes above and understands this system is{' '}
              <strong>non-diagnostic</strong>: it does not diagnose, does not prescribe and does not replace a
              healthcare professional.
              <span id="consent-ack-hint" className="mt-1 block text-[11px] text-ink-400">
                Policy {CONSENT_POLICY_VERSION}. Consent is required before submission.
              </span>
            </span>
          </label>

          <Button className="w-full" size="lg" disabled={!acknowledged || working} onClick={submit}>
            {working ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {working ? 'Preparing observational note…' : 'Consent given — generate triage note'}
          </Button>
        </div>
      </Modal>

      {/* ---------- Processing overlay ---------- */}
      <Modal open={working || reportUploading} onClose={() => {}} title="Preparing the observational note">
        <div className="space-y-3 text-xs text-ink-600">
          <Step icon={<ShieldCheck size={14} />} label="Stripping identifiers from the narrative" />
          {!reportUploading && <Step icon={<FileText size={14} />} label="Organizing the story into a structured note" />}
          {!reportUploading && <Step icon={<AlertTriangle size={14} />} label="Scanning configured urgency keywords (workflow signals only)" />}
          {!reportUploading && <Step icon={<CheckCircle2 size={14} />} label="Listing missing information and follow-up questions" />}
          {reportUploading && <Step icon={<FileText size={14} />} label="Reading report files — extracting values for human verification" />}
          <p className="rounded-lg bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-500">
            No diagnosis, prescription or treatment recommendation is generated at any point.
          </p>
        </div>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Post-submit success screen (after reports were uploaded)           */
/* ------------------------------------------------------------------ */

function IntakeComplete({
  sessionId,
  session,
  labs,
  vitals,
  uploadFailed,
  onReview,
}: {
  sessionId: string
  session: PatientSession | null
  labs: ExtractedLabValue[]
  vitals: ExtractedVital[]
  uploadFailed: string | null
  onReview: () => void
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Intake complete"
        title="Session created & reports read"
        subtitle="The observational note and the extracted values below are drafts — a healthcare worker reviews them next."
      />

      {uploadFailed ? (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <AlertTriangle size={14} /> The session was created but report extraction had a problem
          </p>
          <p className="mt-1 text-xs text-rose-700">{uploadFailed}</p>
          <p className="mt-2 text-[11px] text-rose-600">
            You can still open the review queue — a staff member can re-upload the files from the session.
          </p>
        </div>
      ) : (
        <Card
          title="Extracted from your reports"
          subtitle="Values are suggestions, compared against the reference ranges printed in the reports — never a diagnosis."
        >
          <ExtractedValuesTable
            labValues={labs}
            vitals={vitals}
            emptyHint="No values could be read automatically. Nothing was invented — a healthcare worker can review the files manually."
          />
          <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
            Raw OCR text is never stored or returned — only anonymized, non-diagnostic text. Every value is marked
            'needs verification' until a doctor confirms it.
          </p>
        </Card>
      )}

      {session && <TimelineSummaryCard session={session} readOnly compact />}

      {session && <FollowUpList session={session} readOnly compact />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Session</p>
          <p className="truncate font-mono text-xs font-bold text-ink-700">{sessionId}</p>
        </div>
        <Button size="lg" onClick={onReview}>
          <CheckCircle2 size={15} /> Open the review queue
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  options: string[]
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-ink-700">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="inp min-h-[40px]">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function FilePicker({
  id,
  accept,
  label,
  hint,
  onFile,
}: {
  id: string
  accept: string
  label: string
  hint: string
  onFile: (file: File) => void
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-ink-700 transition hover:border-brand-400 hover:text-brand-700 focus-within:ring-2 focus-within:ring-brand-500/40"
      >
        <Paperclip size={14} />
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <p id={`${id}-hint`} className="mt-1 max-w-xs text-[11px] text-ink-400">
        {hint}
      </p>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className={cx('text-right font-semibold text-ink-800', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

function Step({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 ring-1 ring-inset ring-emerald-200">
      <span className="text-emerald-600">{icon}</span>
      {label}
    </p>
  )
}
