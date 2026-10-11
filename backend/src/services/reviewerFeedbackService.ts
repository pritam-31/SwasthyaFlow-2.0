import { randomUUID } from 'node:crypto'
import { addAudit } from './auditStore'
import type {
  AnonymisationActor,
  ReviewerFeedback,
} from '../types/anonymisation.types'
import { anonymiseText } from './unifiedAnonymizer'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { listFeedback as loadFeedback, storeFeedback } from '../repositories/anonymisationRepository'

/**
 * Reviewer feedback loop (P0-7).
 *
 * A human reviewer can mark each detected match correct / false-positive /
 * false-negative. Feedback is stored (with any free-text note anonymised first)
 * and tallied; `suggestPatternImprovement` offers heuristic, non-diagnostic
 * hints — there is deliberately no automatic model retraining.
 */

const MAX_FEEDBACK = 1000
const feedback: ReviewerFeedback[] = []

export function submitFeedback(
  input: Omit<ReviewerFeedback, 'id' | 'createdAt'>,
  actor: AnonymisationActor,
): ReviewerFeedback {
  const note = input.note ? anonymiseText(input.note, 'anonymisation-report').text : undefined
  const entry: ReviewerFeedback = {
    ...input,
    note,
    id: `fbk-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  }
  feedback.unshift(entry)
  if (persistenceEnabled()) enqueue('feedback', () => storeFeedback(entry))
  if (feedback.length > MAX_FEEDBACK) feedback.length = MAX_FEEDBACK

  addAudit({
    sessionId: input.sessionId ?? 'anonymisation',
    actor: actor.username,
    role: actor.role,
    action: 'anonymisation.feedback-submitted',
    detail: `Feedback on report ${input.reportId} match #${input.matchIndex}: ${input.verdict}.`,
    category: 'system',
  })

  return entry
}

export function listFeedback(reportId?: string): ReviewerFeedback[] {
  return reportId ? feedback.filter((entry) => entry.reportId === reportId) : feedback
}

export interface FeedbackMetrics {
  falsePositives: number
  falseNegatives: number
  correct: number
  total: number
}

export function getFeedbackMetrics(): FeedbackMetrics {
  let falsePositives = 0
  let falseNegatives = 0
  let correct = 0
  for (const entry of feedback) {
    if (entry.verdict === 'false-positive') falsePositives += 1
    else if (entry.verdict === 'false-negative') falseNegatives += 1
    else correct += 1
  }
  return { falsePositives, falseNegatives, correct, total: feedback.length }
}

/** Heuristic pattern-tuning hints. No auto-learning, no diagnosis. */
export function suggestPatternImprovement(): string[] {
  const metrics = getFeedbackMetrics()
  const hints: string[] = []
  if (metrics.total === 0) {
    hints.push('No reviewer feedback recorded yet — collect feedback before tuning patterns.')
    return hints
  }
  if (metrics.falsePositives > metrics.falseNegatives) {
    hints.push('Reviewers flagged more false positives than negatives — consider raising the confidence floor for the busiest categories.')
  }
  if (metrics.falseNegatives > 0) {
    hints.push('Reviewers flagged missed identifiers — review the corpus for a marker or format the current patterns do not cover.')
  }
  if (metrics.correct > 0) {
    hints.push(`${metrics.correct} match(es) confirmed correct — the current rules are working as intended on those formats.`)
  }
  return hints
}

export function clearFeedback(): void {
  feedback.length = 0
}


/** Loads persisted reviewer feedback on boot (persistent mode only). */
export async function hydrateReviewerFeedback(): Promise<void> {
  const rows = await loadFeedback()
  feedback.length = 0
  feedback.push(...rows.slice(0, 1000))
}
