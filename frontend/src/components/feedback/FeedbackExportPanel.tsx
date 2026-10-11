import { useState } from 'react'
import { Download, FileDown } from 'lucide-react'
import { Button, Card, InfoBanner } from '../ui'
import { useTriage } from '../../context/TriageContext'
import type { FeedbackExport } from '../../types/feedback.types'
import type { FeedbackSectionLabels } from '../../services/safetyPolicy'

/**
 * Build and download a portable, non-diagnostic copy of a facility's feedback
 * (facility-admin). Exports are online-only and audited.
 */
export function FeedbackExportPanel({ labels }: { labels: FeedbackSectionLabels }) {
  const { exportFeedback } = useTriage()
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FeedbackExport | null>(null)
  const [failed, setFailed] = useState(false)

  const run = async () => {
    setBusy(true)
    setFailed(false)
    const input: { since?: string; until?: string } = {}
    if (since) input.since = new Date(since).toISOString()
    if (until) input.until = new Date(until).toISOString()
    const exported = await exportFeedback(input)
    setBusy(false)
    if (exported) setResult(exported)
    else setFailed(true)
  }

  const download = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `feedback-export-${result.exportId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const inputClass =
    'w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <FileDown size={15} className="text-brand-600" /> {labels.exportTitle}
        </span>
      }
      subtitle={labels.exportSubtitle}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {labels.since}
          </label>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            {labels.until}
          </label>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
        </div>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void run()}>
          <FileDown size={14} /> {busy ? labels.exporting : labels.export}
        </Button>
        {result && (
          <Button variant="secondary" size="sm" onClick={download}>
            <Download size={14} /> {labels.exportDone} · {result.total}
          </Button>
        )}
      </div>

      {failed && (
        <div className="mt-3">
          <InfoBanner tone="rose">{labels.offline}</InfoBanner>
        </div>
      )}

      {result && (
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">{result.disclaimer || labels.exportDisclaimer}</p>
      )}
    </Card>
  )
}

export default FeedbackExportPanel
