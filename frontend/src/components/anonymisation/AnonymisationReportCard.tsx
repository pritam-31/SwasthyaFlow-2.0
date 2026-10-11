import type { GridColDef } from '@mui/x-data-grid-pro'
import { useState } from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Card, EmptyState, ProgressBar } from '../ui'
import type { AnonymisationReport, PIIMatch, ReviewerVerdict } from '../../types/anonymisation.types'
import type { LanguageCode } from '../../types/language.types'

type MatchRow = PIIMatch & { index: number }

/**
 * Coverage report for one stored anonymisation run (P0-7). Lists every detected
 * identifier (typed placeholder only — never the raw value) and lets a reviewer
 * mark each match correct / false-positive / false-negative, feeding the loop.
 */
export default function AnonymisationReportCard({
  report,
  language = 'en',
}: {
  report: AnonymisationReport
  language?: LanguageCode
}) {
  const { permissions, submitAnonymisationFeedback } = useTriage()
  const [saved, setSaved] = useState<Record<number, ReviewerVerdict>>({})
  const t = ANONYMISATION_SECTION_LABELS[language]

  const verdicts: Array<{ key: ReviewerVerdict; label: string; className: string }> = [
    { key: 'correct', label: t.verdictCorrect, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    { key: 'false-positive', label: t.verdictFalsePositive, className: 'bg-amber-50 text-amber-700 ring-amber-200' },
    { key: 'false-negative', label: t.verdictFalseNegative, className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  ]

  const rows: MatchRow[] = report.matches.map((match, index) => ({ ...match, index }))

  const columns: GridColDef<MatchRow>[] = [
    { field: 'index', headerName: '#', width: 56, renderCell: (p) => <span className="font-mono text-[11px] text-ink-400">{p.row.index}</span> },
    {
      field: 'category',
      headerName: t.category,
      flex: 1,
      minWidth: 130,
      renderCell: (p) => <span className="text-xs font-semibold text-ink-700">{p.row.category}</span>,
    },
    {
      field: 'replacement',
      headerName: t.replacement,
      flex: 1,
      minWidth: 130,
      renderCell: (p) => <span className="font-mono text-[11px] text-ink-600">{p.row.replacement}</span>,
    },
    {
      field: 'confidence',
      headerName: t.confidence,
      width: 110,
      renderCell: (p) => <span className="text-[11px] text-ink-500">{(p.row.confidence * 100).toFixed(0)}%</span>,
    },
    {
      field: 'language',
      headerName: t.language,
      width: 100,
      renderCell: (p) => <span className="text-[11px] text-ink-500">{p.row.language}</span>,
    },
    ...(permissions.canSubmitAnonymisationFeedback
      ? [
          {
            field: 'feedback',
            headerName: t.feedbackHeading,
            width: 260,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            renderCell: (p: { row: MatchRow }) =>
              saved[p.row.index] ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 size={13} /> {t.feedbackSaved}
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {verdicts.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={async () => {
                        const ok = await submitAnonymisationFeedback({
                          reportId: report.id,
                          modality: report.sourceModality,
                          matchIndex: p.row.index,
                          verdict: v.key,
                          sessionId: report.sessionId,
                        })
                        if (ok) setSaved((prev) => ({ ...prev, [p.row.index]: v.key }))
                      }}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition-colors hover:brightness-95 ${v.className}`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              ),
          } as GridColDef<MatchRow>,
        ]
      : []),
  ]

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-brand-600" /> {t.reportHeading}
        </span>
      }
      subtitle={`${report.sourceModality}${report.sessionId ? ` · ${report.sessionId}` : ''}`}
      action={
        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
          {(report.coverage.coverageRatio * 100).toFixed(0)}% {t.coverage}
        </Badge>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-ink-500">
            <span>
              {report.coverage.redacted} / {report.coverage.totalCandidates} {t.totalRedacted.toLowerCase()}
            </span>
            <span>
              {t.confidence}: {(report.coverage.coverageRatio * 100).toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={report.coverage.coverageRatio * 100} tone="emerald" />
        </div>

        {report.matches.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={20} />} title={t.noMatches} />
        ) : (
          <AppDataGrid<MatchRow>
            rows={rows}
            columns={columns}
            ariaLabel={t.reportHeading}
            getRowId={(m) => `${m.category}-${m.span.start}-${m.index}`}
            hideToolbar
            hideFooter
            defaultDensity="compact"
          />
        )}
      </div>
    </Card>
  )
}
