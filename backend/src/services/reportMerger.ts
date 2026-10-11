import type {
  ExtractedLabValue,
  ExtractedReport,
  ExtractedVital,
  MergedReportView,
} from '../types'
import { NON_DIAGNOSTIC_DISCLAIMER } from './reportParser'

/**
 * Cross-report merge (P0-1). One row per measurement name; when two reports
 * carry the same measurement, the report whose own date (or upload time)
 * is later wins — the reviewer always sees the most recent documented value.
 * Nothing here infers, averages or estimates.
 */

function recencyKey(report: ExtractedReport): string {
  return report.reportDate ?? report.createdAt.slice(0, 10)
}

/** Ascending by (report date ~ upload date, then upload time). */
function byRecency(a: ExtractedReport, b: ExtractedReport): number {
  const ka = recencyKey(a)
  const kb = recencyKey(b)
  const dateCmp = ka.localeCompare(kb)
  return dateCmp !== 0 ? dateCmp : a.createdAt.localeCompare(b.createdAt)
}

/**
 * Builds the merged view for one session. Iterating newest → oldest and
 * overwriting means the oldest value for a measurement survives last in the
 * map-free sense — the new implementation writes newest first, then older
 * reports never replace an existing entry.
 */
export function mergeReports(reports: ExtractedReport[]): MergedReportView | null {
  if (reports.length === 0) return null

  const newestFirst = [...reports].sort(byRecency).reverse()
  const labByName = new Map<string, ExtractedLabValue>()
  const vitalByName = new Map<string, ExtractedVital>()
  const seenFindings = new Set<string>()

  for (const report of newestFirst) {
    for (const value of report.labValues) {
      if (!labByName.has(value.name)) labByName.set(value.name, value)
    }
    for (const value of report.vitals) {
      if (!vitalByName.has(value.name)) vitalByName.set(value.name, value)
    }
    for (const finding of report.findings) seenFindings.add(finding)
  }

  return {
    sessionId: reports[0].sessionId,
    reportIds: newestFirst.map((r) => r.id),
    labValues: [...labByName.values()],
    vitals: [...vitalByName.values()],
    findings: [...seenFindings],
    mergedAt: new Date().toISOString(),
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  }
}