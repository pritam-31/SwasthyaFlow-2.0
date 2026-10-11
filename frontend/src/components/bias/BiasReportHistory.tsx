import { Flag, Trash2 } from 'lucide-react'
import { Button, cx, EmptyState } from '../ui'
import { BIAS_SECTION_LABELS } from '../../services/safetyPolicy'
import { useApp } from '../../store/AppStore'
import { deleteReport } from '../../services/biasApi'
import type { BiasReport } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

/** Report history with selection and (admin) deletion. */
export function BiasReportHistory({
  reports,
  selectedId,
  onSelect,
  canDelete,
  onDeleted,
  lang = 'en',
}: {
  reports: BiasReport[]
  selectedId: string | null
  onSelect: (reportId: string) => void
  canDelete: boolean
  onDeleted: () => void
  lang?: Lang
}) {
  const t = BIAS_SECTION_LABELS[lang]
  const { pushToast } = useApp()

  const remove = async (report: BiasReport) => {
    if (typeof window !== 'undefined' && !window.confirm(t.deleteConfirm)) return
    try {
      await deleteReport(report.reportId)
      pushToast('success', t.deleted)
      onDeleted()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : t.delete)
    }
  }

  if (reports.length === 0) {
    return <EmptyState icon={<Flag size={18} />} title={t.noReport} hint={t.noReportHint} />
  }

  return (
    <ul className="space-y-2">
      {reports.map((report) => {
        const selected = report.reportId === selectedId
        return (
          <li key={report.reportId}>
            <div
              className={cx(
                'flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 transition-colors',
                selected ? 'border-brand-300 bg-brand-50/70' : 'border-ink-200 bg-white hover:border-brand-200',
              )}
            >
              <button type="button" onClick={() => onSelect(report.reportId)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[12px] font-semibold text-ink-800">
                  {t.overallF1}: {(report.summary.overallF1 * 100).toFixed(1)}%
                </p>
                <p className="mt-0.5 text-[11px] text-ink-500">{formatDate(report.runAt)}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-ink-400">{report.reportId}</p>
              </button>
              {canDelete && (
                <Button variant="ghost" size="sm" onClick={() => remove(report)} title={t.delete}>
                  <Trash2 size={13} />
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
