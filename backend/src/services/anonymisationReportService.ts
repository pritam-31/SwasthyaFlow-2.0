import { addAudit } from './auditStore'
import { getFeedbackMetrics } from './reviewerFeedbackService'
import type {
  AnonymisationActor,
  AnonymisationMetrics,
  AnonymisationReport,
  PIICategory,
  PIIMatch,
  PIIModality,
} from '../types/anonymisation.types'
import { ALL_PII_CATEGORIES, ALL_PII_MODALITIES } from '../types/anonymisation.types'
import { buildCoverage } from './unifiedAnonymizer'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { listReports as loadReports, storeReport as storeReportPersisted } from '../repositories/anonymisationRepository'

/**
 * In-memory anonymisation report store (P0-7).
 *
 * Reports are kept for review and metrics. They may carry the internal `raw`
 * field; every read path MUST pass through {@link scrubRaw} before a report
 * leaves the process. `aggregateForSession` merges all modality reports for a
 * case into one coverage summary.
 */

const MAX_REPORTS = 1000
const reports = new Map<string, AnonymisationReport>()

export function storeReport(report: AnonymisationReport): AnonymisationReport {
  reports.set(report.id, report)
  if (persistenceEnabled()) enqueue('anon-report:' + report.id, () => storeReportPersisted(report))
  if (reports.size > MAX_REPORTS) {
    const oldest = [...reports.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    if (oldest) reports.delete(oldest.id)
  }
  return report
}

/** Returns the report with `raw` fields populated — callers must `scrubRaw` before responding. */
export function getReport(id: string): AnonymisationReport | undefined {
  return reports.get(id)
}

export function listReports(sessionId?: string): AnonymisationReport[] {
  const all = [...reports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return sessionId ? all.filter((report) => report.sessionId === sessionId) : all
}

/** Merge every modality report for a session into one coverage summary. */
export function aggregateForSession(sessionId: string): AnonymisationReport {
  const sessionReports = listReports(sessionId)
  const matches: PIIMatch[] = sessionReports.flatMap((report) => report.matches)
  const warnings = sessionReports.flatMap((report) => report.warnings)
  const newest = sessionReports[0]
  return {
    id: `anon-agg-${sessionId}`,
    sessionId,
    sourceModality: 'anonymisation-report',
    matches,
    redactedCount: matches.length,
    warnings,
    coverage: buildCoverage(matches),
    createdAt: newest?.createdAt ?? new Date().toISOString(),
    actorId: newest?.actorId ?? 'system',
    actorRole: newest?.actorRole ?? 'admin',
    language: newest?.language,
  }
}

export function getMetrics(): AnonymisationMetrics {
  const all = [...reports.values()]
  const byCategory = emptyCategoryRecord()
  const byModality = emptyModalityRecord()
  let totalRedacted = 0
  let totalSkipped = 0
  let totalUnknown = 0
  let totalCandidates = 0
  let lastRunAt: string | null = null

  for (const report of all) {
    byModality[report.sourceModality] = (byModality[report.sourceModality] ?? 0) + report.redactedCount
    for (const match of report.matches) {
      byCategory[match.category] = (byCategory[match.category] ?? 0) + 1
    }
    totalRedacted += report.coverage.redacted
    totalSkipped += report.coverage.skipped
    totalUnknown += report.coverage.unknown
    totalCandidates += report.coverage.totalCandidates
    if (!lastRunAt || report.createdAt > lastRunAt) lastRunAt = report.createdAt
  }

  const feedback = getFeedbackMetrics()
  return {
    byCategory,
    byModality,
    totalRedacted,
    totalSkipped,
    totalUnknown,
    coverageRatio: totalCandidates === 0 ? 1 : totalRedacted / totalCandidates,
    feedbackCount: feedback.total,
    falsePositiveCount: feedback.falsePositives,
    falseNegativeCount: feedback.falseNegatives,
    lastRunAt,
  }
}

export function deleteReport(id: string, actor: AnonymisationActor): void {
  const report = reports.get(id)
  if (!report) return
  reports.delete(id)
  addAudit({
    sessionId: report.sessionId ?? 'anonymisation',
    actor: actor.username,
    role: actor.role,
    action: 'anonymisation.report-deleted',
    detail: `Anonymisation report ${id} deleted (modality ${report.sourceModality}).`,
    category: 'system',
  })
}

/** Structurally copies a report with every `raw` field removed. */
export function scrubRaw(report: AnonymisationReport): AnonymisationReport {
  return {
    ...report,
    matches: report.matches.map((match) => {
      const scrubbed: PIIMatch = {
        category: match.category,
        modality: match.modality,
        span: match.span,
        replacement: match.replacement,
        confidence: match.confidence,
        language: match.language,
      }
      return scrubbed
    }),
  }
}

export function clearReports(): void {
  reports.clear()
}

function emptyCategoryRecord(): Record<PIICategory, number> {
  const record = {} as Record<PIICategory, number>
  for (const category of ALL_PII_CATEGORIES) record[category] = 0
  return record
}

function emptyModalityRecord(): Record<PIIModality, number> {
  const record = {} as Record<PIIModality, number>
  for (const modality of ALL_PII_MODALITIES) record[modality] = 0
  return record
}


/** Loads persisted anonymisation reports on boot (persistent mode only). */
export async function hydrateAnonymisationReports(): Promise<void> {
  const rows = await loadReports()
  reports.clear()
  for (const report of rows.slice(0, 1000)) reports.set(report.id, report)
}
