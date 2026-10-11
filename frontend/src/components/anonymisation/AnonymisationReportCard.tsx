import { useState } from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { ANONYMISATION_SECTION_LABELS } from '../../services/safetyPolicy'
import { Badge, Card, EmptyState, ProgressBar } from '../ui'
import type { AnonymisationReport, ReviewerVerdict } from '../../types/anonymisation.types'
import type { LanguageCode } from '../../types/language.types'

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
          <div className="overflow-x-auto">
            <table className="sf-table min-w-[560px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t.category}</th>
                  <th>{t.replacement}</th>
                  <th>{t.confidence}</th>
                  <th>{t.language}</th>
                  {permissions.canSubmitAnonymisationFeedback && <th>{t.feedbackHeading}</th>}
                </tr>
              </thead>
              <tbody>
                {report.matches.map((match, index) => (
                  <tr key={`${match.category}-${match.span.start}-${index}`}>
                    <td className="font-mono text-[11px] text-ink-400">{index}</td>
                    <td className="text-xs font-semibold text-ink-700">{match.category}</td>
                    <td className="font-mono text-[11px] text-ink-600">{match.replacement}</td>
                    <td className="text-[11px] text-ink-500">{(match.confidence * 100).toFixed(0)}%</td>
                    <td className="text-[11px] text-ink-500">{match.language}</td>
                    {permissions.canSubmitAnonymisationFeedback && (
                      <td>
                        {saved[index] ? (
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
                                    matchIndex: index,
                                    verdict: v.key,
                                    sessionId: report.sessionId,
                                  })
                                  if (ok) setSaved((prev) => ({ ...prev, [index]: v.key }))
                                }}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition-colors hover:brightness-95 ${v.className}`}
                              >
                                {v.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}
