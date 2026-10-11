import { useState } from 'react'
import { ScanSearch } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { Button, Card } from '../ui'
import AnonymisationDisclaimer from './AnonymisationDisclaimer'
import type { AnonymisationPreviewResult } from '../../types/anonymisation.types'
import type { LanguageCode } from '../../types/language.types'

/**
 * Stateless PII redaction preview (P0-7). Any authenticated role may paste text
 * and see the exact redacted output the pipeline would store; raw PII is never
 * returned. Non-diagnostic.
 */
export default function AnonymisationPreview({ sessionId, language: languageProp }: { sessionId?: string; language?: LanguageCode }) {
  const { permissions, language, previewAnonymisation } = useTriage()
  const [text, setText] = useState('')
  const [result, setResult] = useState<AnonymisationPreviewResult | null>(null)
  const [loading, setLoading] = useState(false)

  if (!permissions.canPreviewAnonymisation) return null

  const code = languageProp ?? CODE_BY_INTAKE_LANGUAGE[language]
  const t = ANONYMISATION_SECTION_LABELS[code]

  return (
    <Card title={t.previewHeading} subtitle={t.subtitle}>
      <div className="space-y-3">
        <AnonymisationDisclaimer language={code} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.previewPlaceholder}
          rows={4}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none focus:border-brand-500"
        />
        <Button
          size="sm"
          disabled={loading || text.trim().length === 0}
          onClick={async () => {
            setLoading(true)
            const res = await previewAnonymisation(text, code, sessionId)
            setLoading(false)
            if (res) setResult(res)
          }}
        >
          <ScanSearch size={14} /> {loading ? '…' : t.previewButton}
        </Button>
        {result && (
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">{t.redactedOutput}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-ink-800">
              {result.text.length > 0 ? result.text : t.empty}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
