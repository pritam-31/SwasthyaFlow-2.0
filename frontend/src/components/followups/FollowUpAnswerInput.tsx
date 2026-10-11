/**
 * Inline answer recorder for a follow-up question (P0-5).
 *
 * Answers are recorded verbatim, in the patient's own language, and the
 * backend anonymises them before storing. The textarea never translates and
 * the input language is picked explicitly — the default is the question's
 * language, which the patient most likely answered in.
 */

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button, cx, InfoBanner } from '../ui'
import { FOLLOW_UP_LANGUAGES } from '../../services/followUpApi'
import { FOLLOW_UP_SECTION_LABELS } from '../../services/safetyPolicy'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import type { FollowUpLanguage, FollowUpQuestion } from '../../types/followup.types'

export default function FollowUpAnswerInput({
  question,
  onSubmit,
  onCancel,
}: {
  question: FollowUpQuestion
  /** Returns a human-readable error when the backend rejects the answer. */
  onSubmit: (answerText: string, answerLanguage: FollowUpLanguage) => Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<FollowUpLanguage>(question.language)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labels = FOLLOW_UP_SECTION_LABELS[question.language] ?? FOLLOW_UP_SECTION_LABELS.en

  const save = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(text.trim(), language)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The answer could not be recorded.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <label htmlFor={`answer-${question.id}`} className="mb-1.5 block text-[11px] font-bold text-ink-700">
        Patient&apos;s answer — verbatim, in their own language
      </label>
      <textarea
        id={`answer-${question.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        autoFocus
        placeholder="Type the patient's answer exactly as spoken (identifiers are stripped automatically)."
        className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={`answer-lang-${question.id}`} className="text-[11px] font-semibold text-ink-500">
          Answer language
        </label>
        <select
          id={`answer-lang-${question.id}`}
          value={language}
          onChange={(e) => setLanguage(e.target.value as FollowUpLanguage)}
          className="inp min-h-[34px] w-auto text-xs"
        >
          {FOLLOW_UP_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NATIVE_LABEL[code]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !text.trim()}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Save answer
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <InfoBanner tone="rose">{error}</InfoBanner>
        </div>
      )}
      <p className={cx('mt-2 text-[10px] leading-relaxed text-ink-400')}>
        {labels.reason}: answers are kept verbatim and anonymised — never translated, never rephrased.
      </p>
    </div>
  )
}