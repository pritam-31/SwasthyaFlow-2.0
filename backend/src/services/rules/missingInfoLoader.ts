/**
 * Missing-information check loader (P2-18 item B).
 *
 * Loads the per-language missing-info files (`rules/missingInfo/<lang>.json`),
 * validates them with Zod at boot and exposes typed definitions. A "missing"
 * item is one whose presence patterns did not match the narrative; every check
 * carries why it matters and who it applies to. Nothing here diagnoses.
 */
import { z } from 'zod'
import type { SupportedLanguage } from '../../types'
import type { MissingInfoCheckDef } from '../../types/richCoverage.types'
import enJson from './missingInfo/en.json'
import hiJson from './missingInfo/hi.json'
import orJson from './missingInfo/or.json'

const missingInfoCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  patterns: z.array(z.string().min(1)).min(1),
  whyItMatters: z.string().min(1),
  targetType: z.enum(['patient', 'staff', 'either']),
})

const missingInfoFileSchema = z.object({
  version: z.string().min(1),
  language: z.enum(['en', 'hi', 'or']),
  checks: z.array(missingInfoCheckSchema).min(1),
})

type MissingInfoFile = z.infer<typeof missingInfoFileSchema>

function loadFile(raw: unknown, expected: SupportedLanguage): MissingInfoFile {
  const parsed = missingInfoFileSchema.parse(raw)
  if (parsed.language !== expected) {
    throw new Error(`Missing-info file mismatch: expected ${expected} but the file declares ${parsed.language}.`)
  }
  const seen = new Set<string>()
  for (const check of parsed.checks) {
    if (seen.has(check.id)) throw new Error(`Duplicate missing-info id in ${expected}: ${check.id}.`)
    seen.add(check.id)
  }
  return parsed
}

const MISSING_INFO_FILES: Record<SupportedLanguage, MissingInfoFile> = {
  en: loadFile(enJson, 'en'),
  hi: loadFile(hiJson, 'hi'),
  or: loadFile(orJson, 'or'),
}

/** Declared version of the English missing-info file. */
export const MISSING_INFO_VERSION = MISSING_INFO_FILES.en.version

/** Count of loaded missing-info checks per language. */
export const MISSING_INFO_COUNTS: Record<SupportedLanguage, number> = {
  en: MISSING_INFO_FILES.en.checks.length,
  hi: MISSING_INFO_FILES.hi.checks.length,
  or: MISSING_INFO_FILES.or.checks.length,
}

export function getMissingInfoChecks(language: SupportedLanguage): MissingInfoCheckDef[] {
  return MISSING_INFO_FILES[language].checks
}

export function getAllMissingInfoChecks(): Record<SupportedLanguage, MissingInfoCheckDef[]> {
  return {
    en: MISSING_INFO_FILES.en.checks,
    hi: MISSING_INFO_FILES.hi.checks,
    or: MISSING_INFO_FILES.or.checks,
  }
}

export function getMissingInfoVersion(language: SupportedLanguage): string {
  return MISSING_INFO_FILES[language].version
}
