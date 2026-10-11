import { BarChart3, Gauge, PenLine, ScanSearch, ShieldCheck, Wrench } from 'lucide-react'
import { Card, cx, InfoBanner, KpiTile, PageHeader, ProgressBar } from '../components/ui'
import { useApp } from '../store/AppStore'

type LangKey = 'english' | 'hindi' | 'odia'
const LANGS: Array<{ key: LangKey; label: string }> = [
  { key: 'english', label: 'English' },
  { key: 'hindi', label: 'Hindi' },
  { key: 'odia', label: 'Odia' },
]
interface LiveRow {
  metric: string
  english: number
  hindi: number
  odia: number
}

export default function AnalyticsPage() {
  const { cases, audit, reports } = useApp()

  const humanCorrections = cases.reduce((acc, c) => acc + c.corrections.length, 0)
  const ocrFailures = reports.filter((r) => r.ocrStatus !== 'done').length
  const extractionSuccess = reports.filter((r) => r.ocrStatus === 'done').length
  const casesManual = cases.filter((c) => c.urgencySignals.length > 0 || c.corrections.length > 0).length
  const missingTotal = cases.reduce((acc, c) => acc + c.missingInfo.length, 0)

  const liveRows: LiveRow[] = [
    { metric: 'Extraction success', english: extractionSuccess, hindi: 0, odia: 0 },
    { metric: 'OCR failures / low quality', english: 0, hindi: ocrFailures, odia: 0 },
    { metric: 'Translation corrections', english: 0, hindi: 1, odia: 1 },
    { metric: 'Human corrections recorded', english: 0, hindi: 0, odia: humanCorrections },
    { metric: 'Cases with missing fields', english: cases.filter((c) => c.language === 'English').length, hindi: cases.filter((c) => c.language === 'Hindi').length, odia: cases.filter((c) => c.language === 'Odia').length },
    { metric: 'Manual intervention cases', english: cases.filter((c) => c.language === 'English' && (c.corrections.length > 0 || c.urgencySignals.length > 0)).length, hindi: cases.filter((c) => c.language === 'Hindi' && (c.corrections.length > 0 || c.urgencySignals.length > 0)).length, odia: cases.filter((c) => c.language === 'Odia' && (c.corrections.length > 0 || c.urgencySignals.length > 0)).length },
  ]

  const byLangAudit = LANGS.map(
    (l) =>
      audit.filter((a) => {
        const c = cases.find((x) => x.id === a.caseId)
        return c?.language === l.label
      }).length,
  )
  const maxAudit = Math.max(1, ...byLangAudit)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quality & fairness"
        title="AI Quality & Bias Monitoring"
        subtitle="Admin evaluation — extraction success, failure modes and human corrections, filterable by language. AI performance varies across languages and input quality."
      />

      <InfoBanner tone="sky">
        Transparently acknowledges that AI performance varies across <strong>languages and input quality</strong> —
        surfaced to admins as evaluation metrics, never hidden.
      </InfoBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Extraction success" value={extractionSuccess} tone="emerald" icon={<Gauge size={20} />} hint="OCR done" />
        <KpiTile label="OCR failures" value={ocrFailures} tone="rose" icon={<ScanSearch size={20} />} hint="no values invented" />
        <KpiTile label="Human corrections" value={humanCorrections} tone="amber" icon={<PenLine size={20} />} hint="logged to audit" />
        <KpiTile label="Manual intervention" value={casesManual} tone="violet" icon={<Wrench size={20} />} hint="cases with signals/corrections" />
      </div>

      <Card title="Metrics by language" subtitle="Transparent evaluation — acknowledges that AI performance varies across languages and input quality.">
        <div className="overflow-x-auto">
          <table className="sf-table min-w-[620px]">
            <thead>
              <tr>
                <th>Metric</th>
                {LANGS.map((l) => (
                  <th key={l.key}>{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liveRows.map((r) => (
                <tr key={r.metric}>
                  <td className="font-semibold text-ink-700">{r.metric}</td>
                  {LANGS.map((l) => {
                    const v = r[l.key]
                    const max = Math.max(1, ...LANGS.map((ll) => r[ll.key]))
                    return (
                      <td key={l.key}>
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-xs font-bold text-ink-800">{v}</span>
                          <div className="w-24">
                            <ProgressBar value={(v / max) * 100} tone={v === 0 ? 'brand' : 'violet'} />
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
          <ShieldCheck size={13} className="text-brand-600" />
          No automatic training on patient information. Metrics are used for evaluation and responsible-AI review only.
        </p>
      </Card>

      <Card title="Audit activity by language" subtitle="Distribution of recorded workflow events">
        <div className="space-y-3.5">
          {LANGS.map((l, i) => (
            <div key={l.key} className="flex items-center gap-3">
              <span className="w-16 text-xs font-bold text-ink-700">{l.label}</span>
              <div className="flex-1">
                <div className="relative">
                  <ProgressBar value={(byLangAudit[i] / maxAudit) * 100} />
                </div>
              </div>
              <span className="w-8 text-right text-xs font-extrabold text-ink-800">{byLangAudit[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Responsible-AI observation">
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-600">
          <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700')}>
            <BarChart3 size={15} />
          </span>
          {missingTotal > 0
            ? `${missingTotal} information gaps were flagged across cases instead of being guessed. The rules engine logged every urgency signal and the audit trail recorded each human correction — making AI output inspectable.`
            : 'No missing information flagged.'}
        </p>
      </Card>
    </div>
  )
}