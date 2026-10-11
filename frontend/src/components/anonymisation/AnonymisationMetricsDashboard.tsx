import { useEffect } from 'react'
import { AlertTriangle, Fingerprint, Gauge, MessageSquareWarning, ScanLine } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import { Card, EmptyState, KpiTile, ProgressBar } from '../ui'

/**
 * Facility-wide anonymisation metrics (P0-7, admin). Coverage, detected
 * identifiers and reviewer feedback tallies — evidence, never diagnosis.
 */
export default function AnonymisationMetricsDashboard({ language = 'en' }: { language?: 'en' | 'hi' | 'or' }) {
  const { permissions, anonymisationMetrics, refreshAnonymisationMetrics } = useTriage()
  const t = ANONYMISATION_SECTION_LABELS[language]

  useEffect(() => {
    if (permissions.canViewAnonymisationMetrics) void refreshAnonymisationMetrics()
  }, [permissions.canViewAnonymisationMetrics, refreshAnonymisationMetrics])

  if (!permissions.canViewAnonymisationMetrics) return null

  const metrics = anonymisationMetrics
  const topCategories = metrics
    ? Object.entries(metrics.byCategory)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    : []
  const topModalities = metrics
    ? Object.entries(metrics.byModality)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : []

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Gauge size={14} className="text-brand-600" /> {t.metricsHeading}
        </span>
      }
      subtitle={metrics?.lastRunAt ? `${t.lastRun}: ${formatAuditTime(metrics.lastRunAt)}` : t.empty}
    >
      {!metrics ? (
        <EmptyState icon={<Gauge size={20} />} title={t.empty} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiTile label={t.totalRedacted} value={metrics.totalRedacted} tone="brand" icon={<Fingerprint size={20} />} />
            <KpiTile
              label={t.coverageRatio}
              value={`${(metrics.coverageRatio * 100).toFixed(0)}%`}
              tone="emerald"
              icon={<Gauge size={20} />}
            />
            <KpiTile label={t.feedbackCount} value={metrics.feedbackCount} tone="violet" icon={<MessageSquareWarning size={20} />} />
            <KpiTile label={t.falsePositives} value={metrics.falsePositiveCount} tone="amber" icon={<AlertTriangle size={20} />} />
            <KpiTile label={t.falseNegatives} value={metrics.falseNegativeCount} tone="rose" icon={<AlertTriangle size={20} />} />
            <KpiTile label={t.patternsTotal} value={metrics.totalRedacted + metrics.totalSkipped} tone="sky" icon={<ScanLine size={20} />} />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.coverageRatio}</p>
            <ProgressBar value={metrics.coverageRatio * 100} tone="emerald" />
          </div>

          {topCategories.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.category}</p>
                <ul className="space-y-1">
                  {topCategories.map(([category, count]) => (
                    <li key={category} className="flex items-center justify-between text-xs text-ink-600">
                      <span className="font-medium">{category}</span>
                      <span className="font-mono text-ink-500">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.matchesHeading}</p>
                <ul className="space-y-1">
                  {topModalities.map(([modality, count]) => (
                    <li key={modality} className="flex items-center justify-between text-xs text-ink-600">
                      <span className="font-medium">{modality}</span>
                      <span className="font-mono text-ink-500">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
