/**
 * Urgency rule loader (P2-18 item A).
 *
 * Loads the per-language urgency rule files (`rules/urgency/<lang>.json`),
 * validates them with Zod at boot and exposes them as typed definitions. The
 * registry compiles the pattern strings into RegExp objects; this module is pure
 * data + validation and never touches patient content.
 *
 * A malformed file fails the process at boot rather than at request time. Ids are
 * unique within a language; the loader keeps the file's declared `version`.
 */
import { z } from 'zod'
import type { SupportedLanguage } from '../../types'
import type { UrgencyRuleDef } from '../../types/richCoverage.types'
import enJson from './urgency/en.json'
import hiJson from './urgency/hi.json'
import orJson from './urgency/or.json'

const urgencyRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  severity: z.enum(['red', 'amber']),
  patterns: z.array(z.string().min(1)).min(1),
  nonDiagnosticNote: z.string().min(1),
})

const urgencyFileSchema = z.object({
  version: z.string().min(1),
  language: z.enum(['en', 'hi', 'or']),
  rules: z.array(urgencyRuleSchema).min(1),
})

type UrgencyFile = z.infer<typeof urgencyFileSchema>

function loadFile(raw: unknown, expected: SupportedLanguage): UrgencyFile {
  const parsed = urgencyFileSchema.parse(raw)
  if (parsed.language !== expected) {
    throw new Error(`Urgency rule file mismatch: expected ${expected} but the file declares ${parsed.language}.`)
  }
  const seen = new Set<string>()
  for (const rule of parsed.rules) {
    if (seen.has(rule.id)) throw new Error(`Duplicate urgency rule id in ${expected}: ${rule.id}.`)
    seen.add(rule.id)
  }
  return parsed
}

const URGENCY_FILES: Record<SupportedLanguage, UrgencyFile> = {
  en: loadFile(enJson, 'en'),
  hi: loadFile(hiJson, 'hi'),
  or: loadFile(orJson, 'or'),
}

/** Declared version of the English rule file (all three share this release). */
export const URGENCY_RULES_VERSION = URGENCY_FILES.en.version

/** Count of loaded urgency rules per language. */
export const URGENCY_RULE_COUNTS: Record<SupportedLanguage, number> = {
  en: URGENCY_FILES.en.rules.length,
  hi: URGENCY_FILES.hi.rules.length,
  or: URGENCY_FILES.or.rules.length,
}

export function getUrgencyRules(language: SupportedLanguage): UrgencyRuleDef[] {
  return URGENCY_FILES[language].rules
}

export function getAllUrgencyRules(): Record<SupportedLanguage, UrgencyRuleDef[]> {
  return {
    en: URGENCY_FILES.en.rules,
    hi: URGENCY_FILES.hi.rules,
    or: URGENCY_FILES.or.rules,
  }
}

export function getUrgencyRulesVersion(language: SupportedLanguage): string {
  return URGENCY_FILES[language].version
}
