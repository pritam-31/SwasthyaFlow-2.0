/**
 * The non-diagnostic disclaimer rendered in each supported language.
 * Always visible on the intake page and repeated in the consent dialog — the
 * consent copy is the same statement a patient sees on the page.
 */

import { useEffect, useRef, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import {
  NON_DIAGNOSTIC_STATEMENT,
  NON_DIAGNOSTIC_STATEMENT_HI,
  NON_DIAGNOSTIC_STATEMENT_OR,
} from '../../services/safetyPolicy'
import type { LanguageCode } from '../../types/language.types'
import { cx } from '../ui'

const COPY: Record<LanguageCode, { short: string; text: string }> = {
  en: { short: 'English', text: NON_DIAGNOSTIC_STATEMENT },
  hi: { short: 'हिन्दी', text: NON_DIAGNOSTIC_STATEMENT_HI },
  or: { short: 'ଓଡ଼ିଆ', text: NON_DIAGNOSTIC_STATEMENT_OR },
}

export default function MultilingualDisclaimer({
  language = 'en',
  compact = false,
}: {
  language?: LanguageCode
  compact?: boolean
}) {
  const [shown, setShown] = useState<LanguageCode>(language)
  const touched = useRef(false)

  // Follow the resolved intake language until the reader picks a view.
  useEffect(() => {
    if (!touched.current) setShown(language)
  }, [language])

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-800">
          <ShieldAlert size={12} /> Non-diagnostic disclaimer
        </p>
        <div role="group" aria-label="Disclaimer language" className="flex gap-1">
          {(Object.keys(COPY) as LanguageCode[]).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={shown === code}
              onClick={() => {
                touched.current = true
                setShown(code)
              }}
              className={cx(
                'rounded-md px-2 py-0.5 text-[10px] font-bold transition',
                shown === code ? 'bg-amber-800 text-white' : 'text-amber-800 hover:bg-amber-200/60',
              )}
            >
              {COPY[code].short}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
        {COPY[shown].text}
        {shown !== language && !compact && (
          <span className="mt-1 block text-[10px] text-amber-700">
            English: {COPY.en.text}
          </span>
        )}
      </p>
      {compact && shown === language && <p className="sr-only">Non-diagnostic disclaimer shown in {COPY[shown].short}.</p>}
    </div>
  )
}