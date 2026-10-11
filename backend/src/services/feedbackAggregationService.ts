import { listAllFeedback, listFeedback } from './feedbackService'
import {
  FEEDBACK_REASON_CODES,
  FEEDBACK_TARGET_TYPES,
  type Feedback,
  type FeedbackAggregate,
  type FeedbackDashboard,
  type FeedbackFilter,
  type FeedbackRollupRow,
} from '../types/feedback.types'
import { ALL_LAYER_IDS, type LayerId } from '../types/modelcard.types'

/**
 * Feedback aggregation (P2-15).
 *
 * Reads the feedback store and rolls it up by target type, model layer and
 * reason code so maintainers can see where outputs are least useful. Aggregates
 * are advisory evidence only — nothing here mutates a rule, threshold or score.
 * Deleted feedback is always excluded.
 */

const TARGET_LABELS: Record<string, string> = {
  'urgency-flag': 'Urgency flag',
  'missing-info': 'Missing information',
  'lab-value': 'Lab value',
  vital: 'Vital sign',
  visual: 'Photo observation',
  'timeline-event': 'Timeline event',
  'follow-up-question': 'Follow-up question',
  'priority-component': 'Priority component',
  'anonymisation-match': 'Anonymisation match',
  'report-type': 'Report type',
  'language-detection': 'Language detection',
  'ocr-result': 'OCR result',
  'triage-note': 'Triage note',
  rule: 'Rule',
}

const REASON_LABELS: Record<string, string> = {
  correct: 'Correct',
  'false-positive': 'False positive',
  'false-negative': 'False negative',
  irrelevant: 'Irrelevant',
  'missing-context': 'Missing context',
  'wrong-language': 'Wrong language',
  'over-redacted': 'Over-redacted',
  'under-redacted': 'Under-redacted',
  misprioritised: 'Misprioritised',
  other: 'Other',
}

const LAYER_LABELS: Record<string, string> = {
  'triage-engine': 'Triage engine',
  'multilingual-rules': 'Multilingual rules',
  'report-parser': 'Report parser',
  'visual-feature-service': 'Visual feature service',
  'timeline-extractor': 'Timeline extractor',
  'follow-up-generator': 'Follow-up generator',
  anonymiser: 'Anonymiser',
  'priority-scoring': 'Priority scoring',
  none: 'No layer',
}

function makeRow(key: string, label: string, items: Feedback[]): FeedbackRollupRow {
  const useful = items.filter((i) => i.verdict === 'useful').length
  const notUseful = items.filter((i) => i.verdict === 'not-useful').length
  const partiallyUseful = items.filter((i) => i.verdict === 'partially-useful').length
  const unclear = items.filter((i) => i.verdict === 'unclear').length
  const highSeverity = items.filter((i) => i.severity === 'high').length
  return {
    key,
    label,
    total: items.length,
    useful,
    notUseful,
    partiallyUseful,
    unclear,
    highSeverity,
    notUsefulRate: items.length === 0 ? 0 : notUseful / items.length,
  }
}

function groupBy(items: Feedback[], keyOf: (item: Feedback) => string): Map<string, Feedback[]> {
  const groups = new Map<string, Feedback[]>()
  for (const item of items) {
    const key = keyOf(item)
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  return groups
}

const AGG_CACHE_TTL_MS = 60_000
const aggCache = new Map<string, { at: number; value: FeedbackAggregate }>()
const dashCache = new Map<string, { at: number; value: FeedbackDashboard }>()

/** Facility feedback (deleted excluded), optionally bounded by `since` / `until`. */
function facilityFeedback(facilityId: string, since?: string, until?: string): Feedback[] {
  const filter: FeedbackFilter = {}
  if (since) filter.since = since
  if (until) filter.until = until
  return listFeedback(facilityId, filter)
}

function aggregateNow(facilityId: string, since: string | null, until: string | null): FeedbackAggregate {
  const items = facilityFeedback(facilityId, since ?? undefined, until ?? undefined)

  const byTargetType = [...groupBy(items, (i) => i.targetType).entries()]
    .map(([key, group]) => makeRow(key, TARGET_LABELS[key] ?? key, group))
    .sort((a, b) => b.total - a.total)

  const byLayer = [...groupBy(items, (i) => i.layerId ?? 'none').entries()]
    .map(([key, group]) => makeRow(key, LAYER_LABELS[key] ?? key, group))
    .sort((a, b) => b.total - a.total)

  const byReasonCode = [...groupBy(items, (i) => i.reasonCode).entries()]
    .map(([key, group]) => makeRow(key, REASON_LABELS[key] ?? key, group))
    .sort((a, b) => b.total - a.total)

  return {
    facilityId,
    generatedAt: new Date().toISOString(),
    since,
    until,
    total: items.length,
    byTargetType,
    byLayer,
    byReasonCode,
    topProblematicRules: topProblematicRulesNow(items),
  }
}

function topProblematicRulesNow(items: Feedback[], limit = 10): FeedbackRollupRow[] {
  const ruleItems = items.filter((i) => i.targetType === 'rule')
  return [...groupBy(ruleItems, (i) => i.targetId).entries()]
    .map(([key, group]) => makeRow(key, group[0]?.targetLabel ?? key, group))
    .filter((row) => row.notUseful > 0)
    .sort((a, b) => b.notUseful - a.notUseful || b.total - a.total)
    .slice(0, limit)
}

/** Rolled-up feedback for one facility (60s cache). */
export function aggregateFeedback(facilityId: string, options: { since?: string; until?: string } = {}): FeedbackAggregate {
  const since = options.since ?? null
  const until = options.until ?? null
  const cacheKey = `${facilityId}|${since ?? ''}|${until ?? ''}`
  const cached = aggCache.get(cacheKey)
  if (cached && Date.now() - cached.at < AGG_CACHE_TTL_MS) return cached.value
  const value = aggregateNow(facilityId, since, until)
  aggCache.set(cacheKey, { at: Date.now(), value })
  return value
}

/** Rules with the most "not useful" verdicts for one facility. */
export function topProblematicRules(facilityId: string, limit = 10): FeedbackRollupRow[] {
  const ruleItems = facilityFeedback(facilityId).filter((i) => i.targetType === 'rule')
  return [...groupBy(ruleItems, (i) => i.targetId).entries()]
    .map(([key, group]) => makeRow(key, group[0]?.targetLabel ?? key, group))
    .filter((row) => row.notUseful > 0)
    .sort((a, b) => b.notUseful - a.notUseful || b.total - a.total)
    .slice(0, limit)
}

/** The feedback dashboard for one facility (60s cache). */
export function buildFeedbackDashboard(facilityId: string): FeedbackDashboard {
  const cached = dashCache.get(facilityId)
  if (cached && Date.now() - cached.at < AGG_CACHE_TTL_MS) return cached.value

  const all = listAllFeedback().filter((i) => i.facilityId === facilityId)
  const active = all.filter((i) => i.status !== 'deleted')
  const aggregate = aggregateFeedback(facilityId)

  const byVerdict: FeedbackDashboard['byVerdict'] = { useful: 0, 'not-useful': 0, 'partially-useful': 0, unclear: 0 }
  const bySeverity: FeedbackDashboard['bySeverity'] = { low: 0, medium: 0, high: 0 }
  const byReasonCode: FeedbackDashboard['byReasonCode'] = {
    correct: 0,
    'false-positive': 0,
    'false-negative': 0,
    irrelevant: 0,
    'missing-context': 0,
    'wrong-language': 0,
    'over-redacted': 0,
    'under-redacted': 0,
    misprioritised: 0,
    other: 0,
  }
  for (const item of active) {
    byVerdict[item.verdict] += 1
    bySeverity[item.severity] += 1
    byReasonCode[item.reasonCode] += 1
  }

  const lastFeedbackAt = active.reduce<string | null>((latest, item) => (!latest || item.createdAt > latest ? item.createdAt : latest), null)

  const value: FeedbackDashboard = {
    facilityId,
    generatedAt: new Date().toISOString(),
    total: all.length,
    active: active.length,
    edited: all.filter((i) => i.status === 'edited').length,
    deleted: all.filter((i) => i.status === 'deleted').length,
    byVerdict,
    bySeverity,
    byReasonCode,
    byTargetType: aggregate.byTargetType,
    topProblematicRules: aggregate.topProblematicRules,
    lastFeedbackAt,
  }
  dashCache.set(facilityId, { at: Date.now(), value })
  return value
}

/** Test helper: clears the aggregation caches. */
export function clearFeedbackAggregationCache(): void {
  aggCache.clear()
  dashCache.clear()
}

/** The known target types / reason codes / layers, for UI pickers. */
export const FEEDBACK_DIMENSIONS = {
  targetTypes: FEEDBACK_TARGET_TYPES,
  reasonCodes: FEEDBACK_REASON_CODES,
  layers: ALL_LAYER_IDS as LayerId[],
} as const
