import type { LanguageRuleSet, MissingInfoCheck, SupportedLanguage, UrgencyRule } from '../../types'
import { detectScriptLanguage } from '../languageDetectionService'
import { addAudit } from '../auditStore'
import { englishRuleSet } from './englishRules'
import { hindiRuleSet } from './hindiRules'
import { odiaRuleSet } from './odiaRules'
import {
  getAllUrgencyRules,
  getUrgencyRules,
  getUrgencyRulesVersion,
  URGENCY_RULE_COUNTS,
  URGENCY_RULES_VERSION,
} from './urgencyLoader'
import {
  getMissingInfoChecks,
  getMissingInfoVersion,
  MISSING_INFO_COUNTS,
  MISSING_INFO_VERSION,
} from './missingInfoLoader'

/**
 * Per-language rule registry (P0-3 / P2-18).
 *
 * Data now lives in JSON (`rules/urgency/<lang>.json`, `rules/missingInfo/<lang>.json`)
 * and is validated at boot by the loaders. The narrative-shaped parts that are
 * not rule data (follow-up question bank, banned phrases, section labels,
 * disclaimer) still come from the language modules, and the two are merged here
 * into one {@link LanguageRuleSet}. Consumers fetch rule sets here and never embed
 * language switches.
 */

/** Compiles a JSON pattern into a case-insensitive RegExp (all languages). */
function compile(source: string): RegExp {
  return new RegExp(source, 'i')
}

function urgencyRulesFor(language: SupportedLanguage): UrgencyRule[] {
  return getUrgencyRules(language).map((rule) => ({
    id: rule.id,
    label: rule.label,
    severity: rule.severity,
    patterns: rule.patterns.map(compile),
    reason: rule.nonDiagnosticNote,
  }))
}

function missingInfoChecksFor(language: SupportedLanguage): MissingInfoCheck[] {
  return getMissingInfoChecks(language).map((check) => ({
    id: check.id,
    label: check.label,
    patterns: check.patterns.map(compile),
    whyItMatters: check.whyItMatters,
    targetType: check.targetType,
  }))
}

function withJsonRules(base: LanguageRuleSet): LanguageRuleSet {
  return {
    ...base,
    urgencyRules: urgencyRulesFor(base.language),
    missingInfoChecks: missingInfoChecksFor(base.language),
  }
}

export const LANGUAGE_RULE_SETS: Record<SupportedLanguage, LanguageRuleSet> = {
  en: withJsonRules(englishRuleSet),
  hi: withJsonRules(hindiRuleSet),
  or: withJsonRules(odiaRuleSet),
}

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_RULE_SETS) as SupportedLanguage[]

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return value === 'en' || value === 'hi' || value === 'or'
}

export function getRuleSet(language: SupportedLanguage): LanguageRuleSet {
  return LANGUAGE_RULE_SETS[language]
}

export function getAllRuleSets(): LanguageRuleSet[] {
  return SUPPORTED_LANGUAGES.map(getRuleSet)
}

/**
 * Best rule set for a body of text: explicit language wins, otherwise the
 * detected language. Falls back to English for unknown scripts.
 */
export function getRuleSetForText(text: string, language?: SupportedLanguage): LanguageRuleSet {
  if (language && isSupportedLanguage(language)) return getRuleSet(language)
  const { code } = detectScriptLanguage(text)
  return getRuleSet(code)
}

/**
 * Writes one audit entry per rule family recording the version and rule count
 * loaded at boot. Called once from the server bootstrap; idempotency is the
 * caller's concern (it runs exactly once per process).
 */
export function auditRuleRegistryLoad(): void {
  addAudit({
    sessionId: 'rules',
    actor: 'System',
    role: 'system-admin',
    action: 'urgency.rules-loaded',
    detail: `Urgency rules v${URGENCY_RULES_VERSION} loaded (en ${URGENCY_RULE_COUNTS.en}, hi ${URGENCY_RULE_COUNTS.hi}, or ${URGENCY_RULE_COUNTS.or}).`,
    category: 'system',
  })
  addAudit({
    sessionId: 'rules',
    actor: 'System',
    role: 'system-admin',
    action: 'missinginfo.rules-loaded',
    detail: `Missing-info checks v${MISSING_INFO_VERSION} loaded (en ${MISSING_INFO_COUNTS.en}, hi ${MISSING_INFO_COUNTS.hi}, or ${MISSING_INFO_COUNTS.or}).`,
    category: 'system',
  })
}

export { getUrgencyRules, getAllUrgencyRules, getUrgencyRulesVersion, getMissingInfoChecks, getMissingInfoVersion }
