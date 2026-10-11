/**
 * Follow-up template registry (P0-5).
 *
 * Loads the per-language template plans. There are no `switch` statements:
 * callers always address a language key or the canonical rule forms.
 */
import type { SupportedLanguage, FollowUpSourceType } from '../../../types'
import type { FollowUpLanguagePlan } from '../../../types/followup.types'
import { englishFollowUpPlan } from './en'
import { hindiFollowUpPlan } from './hi'
import { odiaFollowUpPlan } from './or'

export const FOLLOW_UP_PLANS: Record<SupportedLanguage, FollowUpLanguagePlan> = {
  en: englishFollowUpPlan,
  hi: hindiFollowUpPlan,
  or: odiaFollowUpPlan,
}

export function getFollowUpPlan(language: SupportedLanguage): FollowUpLanguagePlan {
  return FOLLOW_UP_PLANS[language] ?? FOLLOW_UP_PLANS.en
}

export function getAllFollowUpPlans(): FollowUpLanguagePlan[] {
  return Object.values(FOLLOW_UP_PLANS)
}

/** Canonical urgency id ("URG-HI-06" / "URG-OR-06" → "URG-06"). */
export function canonicalUrgencyId(ruleId: string): string {
  return ruleId.replace(/^URG-(?:HI|OR)-/, 'URG-')
}

/** Map a report type to the follow-up source that should verify it. */
export function reportTypeToSourceType(reportType: string): 'report-lab' | 'report-vital' | 'report-text' {
  if (reportType === 'lab') return 'report-lab'
  if (reportType === 'vitals') return 'report-vital'
  return 'report-text'
}

export const FOLLOW_UP_SOURCE_TYPE_ORDER: FollowUpSourceType[] = [
  'urgency-flag',
  'missing-info',
  'timeline-gap',
  'report-lab',
  'report-vital',
  'report-text',
  'visual',
  'clinician',
  'fallback',
]