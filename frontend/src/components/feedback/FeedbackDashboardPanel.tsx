import { useEffect } from 'react'
import { Activity, Ban, Clock, MessageSquare, Pencil } from 'lucide-react'
import { Card, InfoBanner, KpiTile, ProgressBar } from '../ui'
import { useTriage } from '../../context/TriageContext'
import type { FeedbackRollupRow } from '../../types/feedback.types'
import type { FeedbackSectionLabels } from '../../services/safetyPolicy'

function RollupList({ rows }: { rows: FeedbackRollupRow[] }) {
  if (rows.length === 0) return null
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="truncate font-medium text-ink-700">{row.label}</span>
            <span className="shrink-0 tabular-nums text-ink-500">
              {row.total} · {100 - Math.round(row.notUsefulRate * 100)}%
            </span>
          </div>
          <div className="mt-1">
            <ProgressBar value={Math.round(row.notUsefulRate * 100)} tone="rose" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function CountPills({
  counts,
  labels,
}: {
  counts: Record<string, number>
  labels: Record<string, string>
}) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 0) return <p className="text-[11.5px] text-ink-400">—</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, n]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600"
        >
          {labels[key] ?? key} <span className="tabular-nums text-ink-800">{n}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * The facility-wide feedback dashboard (facility-admin). It rolls up recorded
 * verdicts by output, layer, reason and severity, and surfaces rules with the
 * most "not useful" verdicts. Feedback is evidence only — nothing changes here
 * automatically.
 */
export function FeedbackDashboardPanel({ labels }: { labels: FeedbackSectionLabels }) {
  const { feedbackDashboard, feedbackAggregate, refreshFeedbackDashboard, refreshFeedbackAggregate } = useTriage()

  useEffect(() => {
    void refreshFeedbackDashboard()
    void refreshFeedbackAggregate()
  }, [refreshFeedbackDashboard, refreshFeedbackAggregate])

  if (!feedbackDashboard) {
    return <InfoBanner tone="sky">{labels.offline}</InfoBanner>
  }

  const dashboard = feedbackDashboard
  const verdictLabels = labels.verdicts as unknown as Record<string, string>
  const severityLabels = labels.severities as unknown as Record<string, string>
  const reasonLabels = labels.reasonCodes as unknown as Record<string, string>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label={labels.totalFeedback} value={dashboard.total} tone="brand" icon={<MessageSquare size={20} />} />
        <KpiTile label={labels.active} value={dashboard.active} tone="emerald" icon={<Activity size={20} />} />
        <KpiTile label={labels.edited} value={dashboard.edited} tone="amber" icon={<Pencil size={20} />} />
        <KpiTile label={labels.deletedCount} value={dashboard.deleted} tone="rose" icon={<Ban size={20} />} />
        <KpiTile
          label={labels.lastFeedback}
          value={dashboard.lastFeedbackAt ? new Date(dashboard.lastFeedbackAt).toLocaleDateString() : '—'}
          tone="sky"
          icon={<Clock size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={labels.byVerdict} subtitle={labels.dashboardSubtitle}>
          <CountPills counts={dashboard.byVerdict} labels={verdictLabels} />
        </Card>
        <Card title={labels.bySeverity}>
          <CountPills counts={dashboard.bySeverity} labels={severityLabels} />
        </Card>
      </div>

      <Card title={labels.byTargetType}>
        <RollupList rows={dashboard.byTargetType} />
      </Card>

      {feedbackAggregate && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={labels.byLayer}>
            <RollupList rows={feedbackAggregate.byLayer} />
          </Card>
          <Card title={labels.byReasonCode}>
            <CountPills counts={dashboard.byReasonCode} labels={reasonLabels} />
          </Card>
        </div>
      )}

      <Card title={labels.topProblematicRules} subtitle={labels.listSubtitle}>
        {dashboard.topProblematicRules.length === 0 ? (
          <p className="text-[11.5px] text-ink-400">{labels.noData}</p>
        ) : (
          <div className="space-y-3">
            {dashboard.topProblematicRules.map((row) => (
              <div key={row.key}>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-semibold text-ink-700">{row.label}</span>
                  <span className="text-ink-500">
                    {labels.notUsefulRate} {Math.round(row.notUsefulRate * 100)}% · {labels.highSeverity} {row.highSeverity}
                  </span>
                </div>
                <ProgressBar value={Math.round(row.notUsefulRate * 100)} tone="rose" />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default FeedbackDashboardPanel
