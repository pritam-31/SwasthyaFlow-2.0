/**
 * Clinician-authored follow-up question form (P0-5).
 *
 * Lets a human add a question the backend could not generate. The backend runs
 * the same safety guards as the generator — PII requests (name / phone /
 * address / ID) and diagnostic phrasing are rejected with a suggestion. This
 * form surfaces a soft, client-side hint before submit, and the server's
 * message verbatim after it.
 */

import { useState } from 'react'
import { ShieldCheck, Sparkles } from 'lucide-react'
import { Button, cx, InfoBanner, Modal } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { FOLLOW_UP_CATEGORIES, FOLLOW_UP_LANGUAGES, FOLLOW_UP_TARGETS } from '../../services/followUpApi'
import { findPiiRequestLanguage, FOLLOW_UP_SECTION_LABELS } from '../../services/safetyPolicy'
import { CODE_BY_INTAKE_LANGUAGE, LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import {
  FOLLOW_UP_CATEGORY_LABELS,
  FOLLOW_UP_TARGET_LABELS,
} from '../../types/followup.types'
import type {
  ClinicianFollowUpInput,
  FollowUpCategory,
  FollowUpLanguage,
  FollowUpTarget,
} from '../../types/followup.types'
import type { PatientSession } from '../../types/triage'

const EN_CATEGORY_LABELS = FOLLOW_UP_CATEGORY_LABELS.en
const EN_TARGET_LABELS = FOLLOW_UP_TARGET_LABELS.en

export default function ClinicianQuestionForm({
  session,
  open,
  onClose,
}: {
  session: PatientSession
  open: boolean
  onClose: () => void
}) {
  const defaultLanguage: FollowUpLanguage = CODE_BY_INTAKE_LANGUAGE[session.raw.language]
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<FollowUpLanguage>(defaultLanguage)
  const [category, setCategory] = useState<FollowUpCategory>('other')
  const [target, setTarget] = useState<FollowUpTarget>('patient')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { addClinicianFollowUp } = useTriage()

  const piiHint = text.trim() ? findPiiRequestLanguage(text) : null
  const labels = FOLLOW_UP_SECTION_LABELS[language] ?? FOLLOW_UP_SECTION_LABELS.en

  const close = () => {
    if (busy) return
    setText('')
    setError(null)
    onClose()
  }

  const submit = async () => {
    const input: ClinicianFollowUpInput = { text: text.trim(), language, category, target }
    if (!input.text) {
      setError('Write the question the patient or the clinic team should answer.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addClinicianFollowUp(session.id, input)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The question was rejected.')
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add a follow-up question">
      <div className="space-y-3">
        <InfoBanner tone="brand">
          Write the question the way a healthcare worker would ask it. It will be stored verbatim and shown in the
          follow-up list — the backend rejects anything that requests personal identifiers or a diagnosis.
        </InfoBanner>

        <div>
          <label htmlFor="clinician-q-text" className="mb-1.5 block text-xs font-bold text-ink-700">
            Question for the patient / clinic team
          </label>
          <textarea
            id="clinician-q-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Could the patient describe whether the pain is constant or comes and goes?"
            className="w-full rounded-xl border border-ink-200 bg-white p-3 text-sm leading-relaxed text-ink-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          {piiHint && (
            <p role="alert" className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
              This looks like a personal-identifier request ({piiHint}). The backend will reject it — ask about
              symptoms the patient already reported instead.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as FollowUpLanguage)}
              className="inp min-h-[38px] text-xs"
            >
              {FOLLOW_UP_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NATIVE_LABEL[code]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FollowUpCategory)}
              className="inp min-h-[38px] text-xs"
            >
              {FOLLOW_UP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EN_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Put to">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as FollowUpTarget)}
              className="inp min-h-[38px] text-xs"
            >
              {FOLLOW_UP_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {EN_TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <div>
            <InfoBanner tone="rose">{error}</InfoBanner>
          </div>
        )}

        <p className={cx('rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500')}>
          {labels.neverAsks}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <ShieldCheck size={14} className="animate-pulse" /> : <Sparkles size={14} />}
            Save question
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</label>
      {children}
    </div>
  )
}