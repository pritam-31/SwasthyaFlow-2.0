import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Date-of-birth / age detectors.
 *
 * DOB is only redacted when a birth marker is present (`DOB`, `date of birth`,
 * `born`, `जन्म तिथि`, `ଜନ୍ମ ତାରିଖ`, `umr`, …) so ordinary clinical or report
 * dates are preserved. Age is redacted only when it directly follows a name or
 * an age marker (`age 45`, `उम्र`, `ବୟସ`).
 */

const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`
const VALUE = String.raw`[0-9A-Za-z\u0900-\u097F\u0B00-\u0B7F][0-9A-Za-z\u0900-\u097F\u0B00-\u0B7F ,./-]{0,30}`

const EN_DOB = ['dob', 'd.o.b', 'date of birth', 'birth date', 'born on', 'born', 'year of birth']
  .map((w) => w.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`))
  .join('|')

export const dobPatterns: PiiPattern[] = [
  {
    category: 'dob',
    confidence: 0.9,
    pattern: new RegExp(String.raw`\b(?:${EN_DOB})${SEP}${VALUE}`, 'gi'),
    replacement: '[DOB]',
  },
  {
    category: 'dob',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:जन्म${HS}तिथि|जन्म${HS}तारीख|जन्म${HS}दिनांक|जन्म)${SEP}${VALUE}`, 'g'),
    replacement: '[DOB]',
  },
  {
    category: 'dob',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:ଜନ୍ମ${HS}ତାରିଖ|ଜନ୍ମ${HS}ଦିନ|ଜନ୍ମ)${SEP}${VALUE}`, 'g'),
    replacement: '[DOB]',
  },
  {
    // Romanised Hinglish / Odlish.
    category: 'dob',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\b(?:janm${HS}tithi|janm${HS}tarikh|janm|janma${HS}tarikh|janma|date${HS}of${HS}birth)${SEP}${VALUE}`, 'gi'),
    replacement: '[DOB]',
  },
  {
    category: 'age-with-name',
    confidence: 0.7,
    pattern: new RegExp(String.raw`\b(?:age|aged|umr|aayu|bayasa|बयस)${HS}*[:-]?${HS}*\d{1,3}(?:${HS}*(?:years?|yrs?|वर्ष|साल|ବର୍ଷ))?\b`, 'gi'),
    replacement: '[AGE]',
  },
]
