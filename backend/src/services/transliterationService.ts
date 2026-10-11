import type { SupportedLanguage } from '../types'

/**
 * Script → Latin transliteration (P0-3).
 *
 * Best-effort character mapping (IAST-style, diacritics kept out so the romanised
 * Hinglish/Odia rule patterns match). Order matters: letters are replaced
 * letter-by-letter with a single anchored pass so a full sentence keeps its word
 * order. Unmapped characters (digits, Latin letters, punctuation) pass through
 * unchanged. This is deliberately a transparent prototype, not a grammar engine.
 */

interface GlyphMap {
  char: string
  latin: string
}

/** Builds [{char, latin}] pairs from a flat [char, latin, char, latin, …] array. */
function chars(pairs: readonly string[]): GlyphMap[] {
  const out: GlyphMap[] = []
  for (let i = 0; i < pairs.length; i += 2) out.push({ char: pairs[i], latin: pairs[i + 1] })
  return out
}

const DEVANAGARI = chars([
  'क', 'ka', 'ख', 'kha', 'ग', 'ga', 'घ', 'gha', 'ङ', 'na',
  'च', 'ca', 'छ', 'cha', 'ज', 'ja', 'झ', 'jha', 'ञ', 'na',
  'ट', 'ta', 'ठ', 'tha', 'ड', 'da', 'ढ', 'dha', 'ण', 'na',
  'त', 'ta', 'थ', 'tha', 'द', 'da', 'ध', 'dha', 'न', 'na',
  'प', 'pa', 'फ', 'pha', 'ब', 'ba', 'भ', 'bha', 'म', 'ma',
  'य', 'ya', 'र', 'ra', 'ल', 'la', 'व', 'va', 'श', 'sa', 'ष', 'sa', 'स', 'sa', 'ह', 'ha',
  'ा', 'a', 'ि', 'i', 'ी', 'i', 'ु', 'u', 'ू', 'u', 'े', 'e', 'ै', 'ai', 'ो', 'o', 'ौ', 'au', 'ं', 'm', 'ः', 'h', 'ँ', 'm',
  'अ', 'a', 'आ', 'a', 'इ', 'i', 'ई', 'i', 'उ', 'u', 'ऊ', 'u', 'ए', 'e', 'ऐ', 'ai', 'ओ', 'o', 'औ', 'au',
  '्', '', '़', '', '०', '0', '१', '1', '२', '2', '३', '3', '४', '4', '५', '5', '६', '6', '७', '7', '८', '8', '९', '9',
  '।', ' ',
])

const ODIYA = chars([
  'କ', 'ka', 'ଖ', 'kha', 'ଗ', 'ga', 'ଘ', 'gha', 'ଙ', 'na',
  'ଚ', 'ca', 'ଛ', 'cha', 'ଜ', 'ja', 'ଝ', 'jha', 'ଞ', 'na',
  'ଟ', 'ta', 'ଠ', 'tha', 'ଡ', 'da', 'ଢ', 'dha', 'ଣ', 'na',
  'ତ', 'ta', 'ଥ', 'tha', 'ଦ', 'da', 'ଧ', 'dha', 'ନ', 'na',
  'ପ', 'pa', 'ଫ', 'pha', 'ବ', 'ba', 'ଭ', 'bha', 'ମ', 'ma',
  'ଯ', 'ya', 'ୟ', 'ya', 'ର', 'ra', 'ଳ', 'la', 'ଲ', 'la', 'ଵ', 'va', 'ଶ', 'sa', 'ଷ', 'sa', 'ସ', 'sa', 'ହ', 'ha',
  'ା', 'a', 'ି', 'i', 'ୀ', 'i', 'ୁ', 'u', 'ୂ', 'u', 'େ', 'e', 'ୈ', 'ai', 'ୋ', 'o', 'ୌ', 'au', 'ଂ', 'm', 'ଃ', 'h', 'ଁ', 'm',
  'ଅ', 'a', 'ଆ', 'a', 'ଇ', 'i', 'ଈ', 'i', 'ଉ', 'u', 'ଊ', 'u', 'ଏ', 'e', 'ଐ', 'ai', 'ଓ', 'o', 'ଔ', 'au',
  '୍', '', '଼', '', '୦', '0', '୧', '1', '୨', '2', '୩', '3', '୪', '4', '୫', '5', '୬', '6', '୭', '7', '୮', '8', '୯', '9',
  '।', ' ',
])

const MAPS: Record<Exclude<SupportedLanguage, 'en'>, GlyphMap[]> = {
  hi: DEVANAGARI,
  or: ODIYA,
}

/** Transliterate one glyph table over the string. */
function applyMap(text: string, glyphs: GlyphMap[]): string {
  let out = text
  for (const { char, latin } of glyphs) {
    if (char.length === 0) continue
    out = out.split(char).join(latin)
  }
  return out
}

/**
 * Converts Devanagari/Odia to a plain-Latin approximant. Returns the input
 * untouched for Latin text (nothing to do).
 */
export function transliterateToLatin(text: string, from: 'devanagari' | 'odia'): string {
  const glyphs = MAPS[from === 'odia' ? 'or' : 'hi']
  return applyMap(text, glyphs)
}

/**
 * Get the Latin form for whatever a note primarily is. `language` drives the
 * script table; the output is always plain Latin letters.
 */
export function getLatinForm(
  text: string,
  language: SupportedLanguage,
  script: 'latin' | 'devanagari' | 'odia' | 'mixed' = 'latin',
): string {
  if (script === 'latin') return text
  if (script === 'devanagari') return transliterateToLatin(text, 'devanagari')
  if (script === 'odia') return transliterateToLatin(text, 'odia')
  // Mixed: transliterate both scripts, keep any Latin letters untouched.
  if (language === 'hi') return transliterateToLatin(text, 'devanagari')
  if (language === 'or') return transliterateToLatin(text, 'odia')
  let out = transliterateToLatin(text, 'devanagari')
  out = transliterateToLatin(out, 'odia')
  return out
}