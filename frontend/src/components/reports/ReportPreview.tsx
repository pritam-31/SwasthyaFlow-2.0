/**
 * Full detail of one stored report: what was read (OCR meta), the redacted
 * text, findings and warnings, plus the extracted value tables.
 */

import { FileText, Image as ImageIcon, ScanText } from 'lucide-react'
import { useState } from 'react'
import { formatAuditTime } from '../../lib/format'
import type { ExtractedReport, ReportReviewStatus, ReportType } from '../../types/report.types'
import { Badge, cx } from '../ui'
import ExtractedValuesTable from './ExtractedValuesTable'

const TYPE_LABEL: Record<ReportType, string> = {
  lab: 'Lab report',
  vitals: 'Vitals',
  imaging: 'Imaging',
  discharge: 'Discharge',
  prescription: 'Prescription',
  vaccination: 'Vaccination',
  other: 'Other',
}

const STATUS_META: Record<ReportReviewStatus, { label: string; classes: string }> = {
  'pending-review': { label: 'Needs verification', classes: 'bg-amber-50 text-amber-700 ring-amber-200' },
  verified: { label: 'Verified', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Rejected', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ReportPreview({ report, expanded = false }: { report: ExtractedReport; expanded?: boolean }) {
  const [showText, setShowText] = useState(expanded)
  const statusMeta = STATUS_META[report.status]
  const SourceIcon = report.source === 'pdf' ? FileText : ImageIcon

  return (
    <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-ink-500 ring-1 ring-inset ring-ink-200">
          <SourceIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-ink-800">{report.fileName}</p>
          <p className="text-[10px] text-ink-400">
            {TYPE_LABEL[report.type]} · {report.language} · {formatSize(report.sizeBytes)}
            {report.reportDate ? ` · dated ${formatAuditTime(report.reportDate)}` : ''}
            {report.source === 'image' ? ' · image scan' : ' · PDF'}
          </p>
        </div>
        <Badge className={statusMeta.classes}>{statusMeta.label}</Badge>
      </header>

      <div className="space-y-3 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge className="bg-white text-ink-600 ring-ink-200" icon={<ScanText size={11} />}>
            {report.ocr.engine === 'pdf-text'
              ? 'Native PDF text'
              : report.ocr.engine === 'tesseract'
                ? `OCR at ${report.ocr.confidence}%`
                : 'Nothing readable automatically'}
          </Badge>
          <span className="text-ink-400">
            {report.ocr.pages} page(s) processed · {report.anonymization.redactedCount} PII marker(s) stripped
          </span>
        </div>

        <ExtractedValuesTable labValues={report.labValues} vitals={report.vitals} />

        {report.findings.length > 0 && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Report impressions (neutral)</h4>
            <ul className="mt-1 space-y-1">
              {report.findings.map((f, i) => (
                <li key={i} className="rounded-lg bg-brand-50/70 px-3 py-1.5 text-xs text-brand-900">
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.warnings.length > 0 && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Warnings</h4>
            <ul className="mt-1 space-y-1">
              {report.warnings.map((w, i) => (
                <li key={i} className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.reviewedBy && (
          <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
            Reviewed by <strong className="text-ink-700">{report.reviewedBy}</strong>
            {report.reviewedByRole ? ` (${report.reviewedByRole})` : ''} · {formatAuditTime(report.updatedAt)}
            {report.reviewNote && <span className="mt-0.5 block">Note: {report.reviewNote}</span>}
            {report.rejectionReason && <span className="mt-0.5 block text-rose-700">Rejected: {report.rejectionReason}</span>}
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowText((s) => !s)}
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-700 hover:text-brand-900"
            aria-expanded={showText}
          >
            {showText ? 'Hide redacted text' : 'Show redacted text'}
          </button>
          {showText && (
            <pre
              className={cx(
                'mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-200 bg-ink-50/60 p-3 text-[11px] leading-relaxed text-ink-600',
              )}
            >
              {report.redactedText || 'No readable text was extracted from this document.'}
            </pre>
          )}
        </div>

        <p className="border-t border-ink-100 pt-2 text-[10px] leading-relaxed text-ink-400">{report.disclaimer}</p>
      </div>
    </article>
  )
}