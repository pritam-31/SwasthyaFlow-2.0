import type { GridColDef } from '@mui/x-data-grid-pro'
import { Activity, AlertTriangle, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppDataGrid } from '../AppDataGrid'
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
  FairnessReportRow,
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

  const runColumns: GridColDef<EvaluationRun>[] = [
    {
      field: 'status',
      headerName: t.status,
      width: 140,
      renderCell: (p) => (
        <Badge
          className={cx(
            p.row.status === 'completed' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
            p.row.status === 'partial' && 'bg-amber-50 text-amber-700 ring-amber-200',
            p.row.status === 'failed' && 'bg-rose-50 text-rose-700 ring-rose-200',
            (p.row.status === 'queued' || p.row.status === 'running') && 'bg-sky-50 text-sky-700 ring-sky-200',
          )}
        >
          {statusLabel(p.row.status)}
        </Badge>
      ),
    },
    {
      field: 'startedAt',
      headerName: t.runAt,
      flex: 1,
      minWidth: 170,
      renderCell: (p) => <span className="text-[11px] text-ink-500">{formatDate(p.row.startedAt)}</span>,
    },
    {
      field: 'createdBy',
      headerName: t.createdBy,
      flex: 1,
      minWidth: 140,
      valueGetter: (_value, row) => row.createdBy.username,
      renderCell: (p) => <span className="text-[11px] text-ink-500">{p.row.createdBy.username}</span>,
    },
    {
      field: 'layersCompleted',
      headerName: t.layer,
      width: 100,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_value, row) => row.layersCompleted.length,
      renderCell: (p) => <span className="text-[12px] tabular-nums text-ink-600">{p.row.layersCompleted.length}</span>,
    },
    {
      field: 'reportId',
      headerName: t.reportId,
      width: 170,
      renderCell: (p) => <span className="font-mono text-[10px] text-ink-400">{p.row.reportId ?? '—'}</span>,
    },
  ]

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
          <AppDataGrid<EvaluationRun>
            rows={runs}
            columns={runColumns}
            ariaLabel={t.runsTitle}
            getRowId={(run) => run.runId}
            hideToolbar
            hideFooter
            defaultDensity="compact"
          />
        )}
      </Card>
    </div>
  )
}

function FairnessTable({ report, lang }: { report: BiasReport; lang: Lang }) {
  const t = BIAS_SECTION_LABELS[lang]
  const columns: GridColDef<FairnessReportRow>[] = [
    {
      field: 'dimension',
      headerName: t.dimension,
      flex: 1,
      minWidth: 160,
      valueGetter: (_value, row) => BIAS_DIMENSION_LABELS[row.slice.dimension],
      renderCell: (p) => <span className="text-[12px] font-medium text-ink-700">{BIAS_DIMENSION_LABELS[p.row.slice.dimension]}</span>,
    },
    {
      field: 'metric',
      headerName: t.metric,
      flex: 1,
      minWidth: 130,
      valueGetter: (_value, row) => row.evaluatedMetric,
      renderCell: (p) => <span className="text-[12px] text-ink-600">{BIAS_METRIC_LABELS[p.row.evaluatedMetric]}</span>,
    },
    {
      field: 'maxMin',
      headerName: t.spread,
      width: 110,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => <span className="text-[12px] tabular-nums text-ink-600">{p.row.maxMin.toFixed(3)}</span>,
    },
    {
      field: 'flag',
      headerName: t.flag,
      width: 120,
      renderCell: (p) => <FairnessFlagBadge flag={p.row.flag} lang={lang} />,
    },
    {
      field: 'slice',
      headerName: t.slice,
      flex: 1.4,
      minWidth: 260,
      renderCell: (p) => (
        <div>
          <div className="flex flex-wrap gap-1">
            {p.row.individualSlices.map((s) => (
              <span key={s.value} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                {s.value}: <span className="tabular-nums">{pct(s.metric)}</span>
              </span>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink-400">{p.row.interpretation}</p>
        </div>
      ),
    },
  ]
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-ink-500">{t.fairnessNote}</p>
      <AppDataGrid<FairnessReportRow>
        rows={report.fairness}
        columns={columns}
        ariaLabel={t.fairness}
        getRowId={(row) => `${row.dimension}-${row.evaluatedMetric}`}
        hideToolbar
        hideFooter
        defaultDensity="compact"
      />
    </div>
  )
}
