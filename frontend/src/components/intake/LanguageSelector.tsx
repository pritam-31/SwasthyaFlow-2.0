/**
 * Intake language picker: auto-detect (default) plus the three supported
 * languages, shown in their native script. Choosing a language switches voice
 * capture (`useSpeechToText` maps hi/or to the matching speech tags); choosing
 * Auto leaves the resolved language to script detection.
 */

import { Languages, Loader2, ScanSearch } from 'lucide-react'
import type { DetectedLanguageInfo, LanguageSelectorValue } from '../../types/language.types'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import { cx } from '../ui'
import { useApp } from '../../store/AppStore'

const OPTIONS: Array<{ value: LanguageSelectorValue; label: string }> = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: LANGUAGE_NATIVE_LABEL.en },
  { value: 'hi', label: LANGUAGE_NATIVE_LABEL.hi },
  { value: 'or', label: LANGUAGE_NATIVE_LABEL.or },
]

export default function LanguageSelector({
  value,
  onChange,
  detected,
  detecting,
  id,
}: {
  value: LanguageSelectorValue
  onChange: (next: LanguageSelectorValue) => void
  detected: DetectedLanguageInfo | null
  detecting: boolean
  id?: string
}) {
  const { pushToast } = useApp()

  const pick = (next: LanguageSelectorValue) => {
    if (next === value) return
    onChange(next)
    if (next !== 'auto') {
      pushToast('info', `Spoken language set to ${LANGUAGE_NATIVE_LABEL[next]} — speech capture and analysis use it directly.`)
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-700">
        <Languages size={12} /> Input language
      </p>
      <div
        id={id}
        role="radiogroup"
        aria-label="Input language"
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {OPTIONS.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(o.value)}
              className={cx(
                'inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition',
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-brand-200 bg-white text-ink-600 hover:border-brand-400 hover:text-brand-700',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {value === 'auto' && (
        <p className="mt-2 text-[11px] text-brand-800">
          {detecting ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Detecting from the text…
            </span>
          ) : detected ? (
            <span className="inline-flex items-center gap-1">
              <ScanSearch size={11} />
              Detected now: <strong>{detected.label}</strong>{' '}
              <span className="opacity-70">({Math.round(detected.confidence * 100)}% script vote ·{' '}
                {detected.isMixed ? 'mixed script' : detected.script})</span>
            </span>
          ) : (
            'Automatically detected as the patient speaks or types. Pick a language to control voice capture.'
          )}
        </p>
      )}
    </div>
  )
}