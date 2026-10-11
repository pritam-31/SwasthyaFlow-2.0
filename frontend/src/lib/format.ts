import type { CaseRecord, ReviewStatus, UrgencyLabel } from '../types'
import type { AnonymizationReport } from '../types/triage'

export const urgentMeta: Record<UrgencyLabel, { label: string; classes: string; dot: string }> = {
  routine: {
    label: 'Routine review',
    classes: 'bg-ink-100 text-ink-600 ring-ink-200',
    dot: 'bg-ink-400',
  },
  prompt: {
    label: 'Prompt review signal',
    classes: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
  },
  urgent: {
    label: 'Urgent review signal',
    classes: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
  },
}

export const reviewMeta: Record<ReviewStatus, { label: string; classes: string }> = {
  'awaiting-nurse': { label: 'Awaiting health-worker review', classes: 'bg-sky-50 text-sky-700 ring-sky-200' },
  'awaiting-doctor': { label: 'Awaiting doctor review', classes: 'bg-violet-50 text-violet-700 ring-violet-200' },
  reviewed: { label: 'Reviewed', classes: 'bg-brand-50 text-brand-700 ring-brand-200' },
  closed: { label: 'Closed', classes: 'bg-ink-100 text-ink-600 ring-ink-200' },
}

export function urgencyOf(c: CaseRecord): UrgencyLabel {
  if (c.urgencySignals.some((s) => s.level === 'urgent')) return 'urgent'
  if (c.urgencySignals.some((s) => s.level === 'prompt')) return 'prompt'
  return 'routine'
}

export function formatCompletenessLabel(n: number) {
  if (n >= 80) return 'Good'
  if (n >= 50) return 'Partial'
  return 'Low'
}

export function formatAuditTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/** Human-readable summary of the PII categories stripped from a narrative. */
export function summarizeRedactions(report: Pick<AnonymizationReport, 'redactedCount' | 'redactions'>): string {
  if (report.redactedCount === 0) return 'No PII patterns detected in the free text.'
  return report.redactions.map((r) => `${r.count} ${r.category.replace('-', ' ')}`).join(' · ')
}