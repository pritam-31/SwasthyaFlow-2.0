import { Info } from 'lucide-react'
import { ANONYMISATION_SECTION_LABELS, NON_DIAGNOSTIC_SHORT } from '../../services/safetyPolicy'
import type { LanguageCode } from '../../types/language.types'

/**
 * Reusable, non-diagnostic anonymisation notice. States the strip-before-storage
 * guarantee and that the pipeline never diagnoses.
 */
export default function AnonymisationDisclaimer({ language = 'en' }: { language?: LanguageCode }) {
  const t = ANONYMISATION_SECTION_LABELS[language]
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-sky-900">
      <p className="flex items-center gap-1.5 font-bold">
        <Info size={12} /> {t.title}
      </p>
      <p className="mt-0.5">{t.disclaimer}</p>
      <p className="mt-0.5 text-sky-700">{NON_DIAGNOSTIC_SHORT}</p>
    </div>
  )
}
