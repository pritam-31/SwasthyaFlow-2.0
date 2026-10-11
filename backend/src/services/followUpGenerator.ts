/**
 * Dynamic follow-up question generator (P0-5).
 *
 * Pure module: sources in → drafts out, no sessions, no audit, no storage.
 *
 * Ordering is deterministic:
 *   1. urgency signals (canonical rule id → template)
 *   2. missing-information items (per-language field label → template)
 *   3. reports / photos / timeline gaps (per-source templates)
 *   4. dedupe → sort → safety filter → cap.
 *
 * Every draft is a suggestion for a human to ask — never a diagnosis.
 */

import type { FollowUpGenerationInput, FollowUpGenerationResult, FollowUpQuestionDraft, FollowUpTemplate } from '../types/followup.types'
import { assertFollowUpTextSafe } from './followUpSafety'
import { computeFollowUpConfidence } from './confidenceService'
import {
  canonicalUrgencyId,
  FOLLOW_UP_SOURCE_TYPE_ORDER,
  getFollowUpPlan,
  reportTypeToSourceType,
} from './rules/followUpTemplates/registry'

const DEFAULT_MAX_COUNT = 12

function matchLabel(pattern: string | undefined, field: string): boolean {
  if (!pattern) return false
  try {
    return new RegExp(`(?:${pattern})`, 'i').test(field)
  } catch {
    return false
  }
}

/** One draft honouring the template's safety guarantees. */
function draftFrom(
  template: FollowUpTemplate,
  language: FollowUpGenerationInput['language'],
  sourceRef: string,
  sourceConfidence = 0.8,
): FollowUpQuestionDraft {
  return {
    question: template.text,
    language,
    category: template.category,
    target: template.target,
    priority: template.priority,
    reason: template.reason,
    sourceType: template.sourceType,
    sourceRef,
    confidenceScore: computeFollowUpConfidence({
      sourceType: template.sourceType,
      generic: template.sourceType === 'fallback',
      sourceConfidence,
      language,
    }),
  }
}

export function generateFollowUpQuestions(input: FollowUpGenerationInput): FollowUpGenerationResult {
  const plan = getFollowUpPlan(input.language)
  const warnings: string[] = []
  const drafts: FollowUpQuestionDraft[] = []

  // 1. Urgency signals.
  for (const flag of input.urgencyFlags) {
    const canonical = canonicalUrgencyId(flag.ruleId)
    const template = plan.templates.find((t) => t.urgencyRuleId === canonical)
    if (!template) {
      warnings.push(`No follow-up template for urgency signal ${flag.ruleId}.`)
      continue
    }
    drafts.push(draftFrom(template, input.language, canonical))
  }

  // 2. Missing-information items.
  for (const item of input.missingInformation) {
    const template =
      plan.templates.find((t) => t.sourceType === 'missing-info' && t.sourceRefPattern && matchLabel(t.sourceRefPattern, item.field)) ??
      plan.genericMissingInfo
    drafts.push(draftFrom(template, input.language, item.field))
  }

  // 3. Reports / photos / timeline gap.
  for (const report of input.reports ?? []) {
    const sourceType = reportTypeToSourceType(report.type)
    const template = plan.templates.find((t) => t.sourceType === sourceType)
    if (template) drafts.push(draftFrom(template, input.language, report.id))
  }
  for (const visual of input.visuals ?? []) {
    const template = plan.templates.find((t) => t.sourceType === 'visual')
    if (template) drafts.push(draftFrom(template, input.language, visual.id))
  }
  if (input.hasTimeline === false) {
    const template = plan.templates.find((t) => t.sourceType === 'timeline-gap')
    if (template) drafts.push(draftFrom(template, input.language, 'timeline-gap'))
  }

  // 4. Safety filter — a violated template is dropped, never rewritten.
  const safe = drafts.filter((draft) => {
    const violation = assertFollowUpTextSafe(draft.question)
    if (violation) {
      warnings.push(`Skipped follow-up template ${draft.sourceType}/${draft.sourceRef}: ${violation.error}`)
      return false
    }
    return true
  })

  // 5. Dedupe by (sourceType, sourceRef, category).
  const seen = new Set<string>()
  const unique = safe.filter((draft) => {
    const key = `${draft.sourceType}|${draft.sourceRef}|${draft.category}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 6. Sort by priority, then a fixed source order (stable).
  const ordered = unique.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const ia = FOLLOW_UP_SOURCE_TYPE_ORDER.indexOf(a.sourceType)
    const ib = FOLLOW_UP_SOURCE_TYPE_ORDER.indexOf(b.sourceType)
    return ia - ib
  })

  if (ordered.length > 0) {
    return { drafts: ordered.slice(0, input.maxCount ?? DEFAULT_MAX_COUNT), warnings }
  }

  // 7. Fallback: the language's static bank (guarantees something to ask).
  const fallback = plan.staticFallback.map((template) =>
    draftFrom(template, input.language, 'fallback'),
  )
  warnings.push('Generation produced no context-specific questions — used the standard question bank.')
  return { drafts: fallback.slice(0, input.maxCount ?? DEFAULT_MAX_COUNT), warnings }
}