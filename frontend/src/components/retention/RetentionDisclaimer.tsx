import { Info } from 'lucide-react'
import { NON_DIAGNOSTIC_SHORT, RETENTION_SECTION_LABELS } from '../../services/safetyPolicy'
import type { LanguageCode } from '../../types/language.types'

/**
 * Reusable, non-diagnostic retention notice. States the schedule/withdrawal
 * guarantees and that nothing in the retention engine diagnoses.
 */
export default function RetentionDisclaimer({ language = 'en' }: { language?: LanguageCode }) {
  const t = RETENTION_SECTION_LABELS[language]
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-sky-900">
      <p className="flex items-center gap-1.5 font-bold">
        <Info size={12} /> {t.retentionHeading}
      </p>
      <p className="mt-0.5">{t.dataLifecycle}</p>
      <p className="mt-0.5 text-sky-700">{NON_DIAGNOSTIC_SHORT}</p>
    </div>
  )
}
