import { Activity, AlertTriangle, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, EmptyState, InfoBanner, KpiTile, cx } from '../ui'
import { FairnessFlagBadge } from './FairnessFlagBadge'
import { BiasMetricsTable } from './BiasMetricsTable'
import { DatasetManifestCard } from './DatasetManifestCard'
import { BiasReportHistory } from './BiasReportHistory'
import { BIAS_DIMENSION_LABELS, BIAS_METRIC_LABELS, BIAS_SECTION_LABELS } from '../../services/safetyPolicy'
import { useApp } from '../../store/AppStore'
import * as biasApi from '../../services/biasApi'
import type {
  AnonymiserLeakResult,
  BiasReport,
  DatasetManifest,
  EvaluationRun,
  EvaluationRunStatus,
} from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

/**
 * Bias-evaluation console. Data loading, the explicit run action and the
 * anonymiser leak test live here; presentation is delegated to the sub-
 * components. Running the evaluation is never automatic.
 */
export function BiasDashboard({
  lang = 'en',
  canRun,
  canDelete,
}: {
  lang?: Lang
  canRun: boolean
  canDelete: boolean
}) {
  const t = BIAS_SECTION_LABELS[lang]
  const { pushToast } = useApp()

  const [manifest, setManifest] = useState<DatasetManifest | null>(null)
  const [reports, setReports] = useState<BiasReport[]>([])
  const [runs, setRuns] = useState<EvaluationRun[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [leak, setLeak] = useState<AnonymiserLeakResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [leakRunning, setLeakRunning] = useState(false)

  const selected = reports.find((r) => r.reportId === selectedId) ?? null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextManifest, nextReports, nextRuns] = await Promise.all([
        biasApi.fetchManifest(),
        biasApi.fetchReports(),
        biasApi.fetchRuns(),
      ])
      setManifest(nextManifest)
      setReports(nextReports)
      setRuns(nextRuns)
      setSelectedId((current) => {
        if (current && nextReports.some((r) => r.reportId === current)) return current
        return nextReports[0]?.reportId ?? null
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the evaluation.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runEvaluation = async () => {
    if (running) return
    setRunning(true)
    try {
      const report = await biasApi.runEvaluation()
      pushToast('success', t.runComplete)
      await load()
      setSelectedId(report.reportId)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.runFailed)
      await load()
    } finally {
      setRunning(false)
    }
  }

  const runLeak = async () => {
    if (leakRunning) return
    setLeakRunning(true)
    try {
      const result = await biasApi.runLeakTest()
      setLeak(result)
      if (result.failed === 0) pushToast('success', t.noLeaks)
      else pushToast('warning', `${result.failed} ${t.failed}`)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.loadFailed)
    } finally {
      setLeakRunning(false)
    }
  }

  const statusLabel = (status: EvaluationRunStatus) =>
    status === 'queued'
      ? t.statusQueued
      : status === 'running'
        ? t.statusRunning
        : status === 'completed'
          ? t.statusCompleted
          : status === 'partial'
            ? t.statusPartial
            : t.statusFailed

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {t.refresh}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void runLeak()} disabled={leakRunning}>
          <ShieldCheck size={14} /> {leakRunning ? t.running : t.runLeak}
        </Button>
        {canRun && (
          <Button size="sm" onClick={() => void runEvaluation()} disabled={running}>
            <Play size={14} /> {running ? t.running : t.runEvaluation}
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{error}</p>
      )}

      {loading && !selected && <p className="text-[12px] text-ink-400">{t.refresh}…</p>}

      {!loading && !selected && <EmptyState icon={<Activity size={18} />} title={t.noReport} hint={t.noReportHint} />}

      {selected && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label={t.overallF1} value={pct(selected.summary.overallF1)} tone="brand" icon={<Activity size={18} />} hint={`v${selected.engineVersion}`} />
            <KpiTile label={t.concerningSlices} value={selected.summary.concerningSlices.length} tone="amber" icon={<AlertTriangle size={18} />} hint={selected.summary.concerningSlices.join(', ') || t.none} />
            <KpiTile label={t.missingSlices} value={selected.missingSlices.length} tone="rose" icon={<AlertTriangle size={18} />} hint={selected.missingSlices.slice(0, 4).join(', ') || t.none} />
            <KpiTile label={t.layerMetrics} value={selected.layers.length} tone="sky" icon={<Activity size={18} />} hint={`${t.runAt}: ${formatDate(selected.runAt)}`} />
          </div>

          <InfoBanner tone="amber">
            <p className="font-bold">{t.fairness}</p>
            <p className="mt-0.5">{selected.summary.note}</p>
          </InfoBanner>

          <Card title={t.layerMetrics} subtitle={`${selected.layers.length} · ${t.dimension} × ${t.metric}`}>
            <BiasMetricsTable layers={selected.layers} lang={lang} />
          </Card>

          <Card title={t.fairness} subtitle={selected.fairness.length.toString()}>
            <FairnessTable report={selected} lang={lang} />
          </Card>

          <Card title={t.history} subtitle={`${t.createdBy}: ${selected.createdBy.username}`}>
            <div className="grid gap-2 text-[11px] text-ink-500 sm:grid-cols-3">
              <p>
                <span className="font-semibold text-ink-600">{t.reportId}:</span> <span className="font-mono">{selected.reportId}</span>
              </p>
              <p>
                <span className="font-semibold text-ink-600">{t.datasetVersion}:</span> {selected.datasetVersion}
              </p>
              <p>
                <span className="font-semibold text-ink-600">{t.engineVersion}:</span> {selected.engineVersion}
              </p>
            </div>
          </Card>
        </>
      )}

      {leak && (
        <Card title={t.leakResult} subtitle={leak.engineVersion}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                {t.passed}: {leak.passed}
              </Badge>
              <Badge className={leak.failed === 0 ? 'bg-ink-100 text-ink-600 ring-ink-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}>
                {t.failed}: {leak.failed}
              </Badge>
              <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                {BIAS_METRIC_LABELS.f1}: {pct(leak.f1)}
              </Badge>
            </div>
            {leak.failed === 0 ? (
              <p className="text-[12px] text-ink-500">{t.noLeaks}</p>
            ) : (
              <ul className="space-y-1">
                {leak.failures.slice(0, 8).map((f) => (
                  <li key={`${f.case}-${f.leak}`} className="font-mono text-[11px] text-rose-700">
                    {f.case} → {f.leak}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t.manifest} subtitle={manifest ? `v${manifest.version}` : undefined}>
          {manifest ? <DatasetManifestCard manifest={manifest} lang={lang} /> : <p className="text-[12px] text-ink-400">…</p>}
        </Card>

        <Card title={t.historyTitle} subtitle={reports.length.toString()}>
          <BiasReportHistory
            reports={reports}
            selectedId={selectedId}
            onSelect={setSelectedId}
            canDelete={canDelete}
            onDeleted={() => void load()}
            lang={lang}
          />
        </Card>
      </div>

      <Card title={t.runsTitle} subtitle={runs.length.toString()}>
        {runs.length === 0 ? (
          <EmptyState icon={<Activity size={18} />} title={t.noRuns} />
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                  <th className="px-3 py-2.5 font-bold">{t.status}</th>
                  <th className="px-3 py-2.5 font-bold">{t.runAt}</th>
                  <th className="px-3 py-2.5 font-bold">{t.createdBy}</th>
                  <th className="px-3 py-2.5 text-right font-bold">{t.layer}</th>
                  <th className="px-3 py-2.5 font-bold">{t.reportId}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {runs.map((run) => (
                  <tr key={run.runId} className="transition-colors hover:bg-ink-50/60">
                    <td className="px-3 py-2.5">
                      <Badge
                        className={cx(
                          run.status === 'completed' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                          run.status === 'partial' && 'bg-amber-50 text-amber-700 ring-amber-200',
                          run.status === 'failed' && 'bg-rose-50 text-rose-700 ring-rose-200',
                          (run.status === 'queued' || run.status === 'running') && 'bg-sky-50 text-sky-700 ring-sky-200',
                        )}
                      >
                        {statusLabel(run.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-500">{formatDate(run.startedAt)}</td>
                    <td className="px-3 py-2.5 text-[11px] text-ink-500">{run.createdBy.username}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink-600">{run.layersCompleted.length}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-ink-400">{run.reportId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function FairnessTable({ report, lang }: { report: BiasReport; lang: Lang }) {
  const t = BIAS_SECTION_LABELS[lang]
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-ink-500">{t.fairnessNote}</p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-ink-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
              <th className="px-3 py-2.5 font-bold">{t.dimension}</th>
              <th className="px-3 py-2.5 font-bold">{t.metric}</th>
              <th className="px-3 py-2.5 text-right font-bold">{t.spread}</th>
              <th className="px-3 py-2.5 font-bold">{t.flag}</th>
              <th className="px-3 py-2.5 font-bold">{t.slice}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {report.fairness.map((row) => (
              <tr key={`${row.dimension}-${row.evaluatedMetric}`} className="align-top transition-colors hover:bg-ink-50/60">
                <td className="px-3 py-2.5 text-[12px] font-medium text-ink-700">{BIAS_DIMENSION_LABELS[row.slice.dimension]}</td>
                <td className="px-3 py-2.5 text-[12px] text-ink-600">{BIAS_METRIC_LABELS[row.evaluatedMetric]}</td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink-600">{row.maxMin.toFixed(3)}</td>
                <td className="px-3 py-2.5">
                  <FairnessFlagBadge flag={row.flag} lang={lang} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.individualSlices.map((s) => (
                      <span key={s.value} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                        {s.value}: <span className="tabular-nums">{pct(s.metric)}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-ink-400">{row.interpretation}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
