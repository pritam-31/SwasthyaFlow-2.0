import type { PIICategory, PiiPattern } from '../../types/anonymisation.types'
import type { SupportedLanguage } from '../../types/language.types'
import { addressPatterns } from './address'
import { dobPatterns } from './dob'
import { facilityPatterns } from './facility'
import { govIdPatterns } from './govIds'
import { miscPatterns } from './misc'
import { phonePatterns } from './phone'
import { englishNamePatterns } from './personName.en'
import { hindiNamePatterns } from './personName.hi'
import { odiaNamePatterns } from './personName.or'
import { relativePatterns } from './relative'

/**
 * PII pattern registry (P0-7).
 *
 * Structural patterns (phone, government ids, address, DOB, facility, relative,
 * misc) apply to every language because digits, Latin tokens and scripted
 * markers coexist in real intake text. Language-specific name patterns are
 * layered on top; Hinglish/Odlish get the Latin name rules as well.
 */

const SHARED_PATTERNS: PiiPattern[] = [
  ...phonePatterns,
  ...govIdPatterns,
  ...addressPatterns,
  ...dobPatterns,
  ...facilityPatterns,
  ...relativePatterns,
  ...miscPatterns,
]

/** Every rule that runs for a given language, in priority order. */
export const PATTERNS_BY_LANGUAGE: Record<SupportedLanguage, PiiPattern[]> = {
  en: [...englishNamePatterns, ...SHARED_PATTERNS],
  hi: [...hindiNamePatterns, ...englishNamePatterns, ...SHARED_PATTERNS],
  or: [...odiaNamePatterns, ...englishNamePatterns, ...SHARED_PATTERNS],
}

/** All rules grouped by category (across languages) — used for inventory counts. */
export const PII_PATTERNS: Record<PIICategory, PiiPattern[]> = (() => {
  const grouped = {} as Record<PIICategory, PiiPattern[]>
  const seen = new Set<PIICategory>()
  for (const list of Object.values(PATTERNS_BY_LANGUAGE)) {
    for (const pattern of list) {
      if (!seen.has(pattern.category)) {
        grouped[pattern.category] = []
        seen.add(pattern.category)
      }
      if (!grouped[pattern.category].includes(pattern)) grouped[pattern.category].push(pattern)
    }
  }
  return grouped
})()

export function patternsForLanguage(language: SupportedLanguage): PiiPattern[] {
  return PATTERNS_BY_LANGUAGE[language]
}

/**
 * Counts only — no raw regex is exposed. Keys are `category:<name>`,
 * `language:<code>` and `total:patterns`.
 */
export function patternInventory(): Record<string, number> {
  const inventory: Record<string, number> = { 'total:patterns': 0 }
  for (const [language, list] of Object.entries(PATTERNS_BY_LANGUAGE)) {
    const langKey = `language:${language}`
    inventory[langKey] = (inventory[langKey] ?? 0) + list.length
    for (const pattern of list) {
      const catKey = `category:${pattern.category}`
      inventory[catKey] = (inventory[catKey] ?? 0) + 1
      inventory['total:patterns'] += 1
    }
  }
  return inventory
}

export {
  addressPatterns,
  dobPatterns,
  facilityPatterns,
  govIdPatterns,
  miscPatterns,
  phonePatterns,
  englishNamePatterns,
  hindiNamePatterns,
  odiaNamePatterns,
  relativePatterns,
}
