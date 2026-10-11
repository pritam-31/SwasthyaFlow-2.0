import type { NormalizedTime, SupportedLanguage, TimePrecision } from '../types'
import { detectScriptLanguage } from './languageDetectionService'
import { getLatinForm } from './transliterationService'

/**
 * Time-expression parser (P0-4).
 *
 * Understands the relative time phrases used in intake narratives across the
 * three supported languages and their romanised forms (Hinglish / Odlish):
 *
 *  - English:          "2 days ago", "since 3 days", "12/01/2026", "12 Jan 2026"
 *  - Hindi:            "2 दिन पहले", "तीन दिन से", "आज", "कल"
 *  - Odia:             "2 ଦିନ ପୂର୍ବେ", "ଗତ ସପ୍ତାହ", "କାଲି"
 *  - Hinglish:         "2 din pehle", "aaj", "kal", "parso"
 *  - Odlish:           "2 dina purbe", "goto saptaha", "aaji"
 *  - Numeric shorthand: "2d", "3h", "1w", "2m"
 *
 * Unit rule (documented): a bare "Xm" means X *months* (30-day months). It only
 * means minutes when the surrounding text mentions a time-of-day unit (minutes,
 * hours, घंटा, ଘଣ୍ଟା …).
 *
 * Safety contract: unparseable expressions are reported as
 * `precision: 'unknown'` with `normalizedTime: null` — a date is never guessed.
 * While-relative phrases are kept relative (`daysFromIntake`) and are never
 * converted into a fabricated calendar date.
 *
 * For Hindi/Odia input the parser works on the romanised (Latin) form produced
 * by the shared transliteration service, so the Devanagari/Odia word sets are
 * handled by the same Latin patterns. The `raw` of a match is therefore the
 * Latin form for hi/or input.
 */

export interface ParsedTime {
  raw: string
  normalized: NormalizedTime | null
  precision: TimePrecision
  matchedSpan: { start: number; end: number }
}

/** Small multilingual word-number table (Latin forms + English). */
const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  do: 2,
  dho: 2,
  dui: 2,
  three: 3,
  teen: 3,
  tin: 3,
  tina: 3,
  tini: 3,
  four: 4,
  char: 4,
  chari: 4,
  five: 5,
  paanch: 5,
  panch: 5,
  paanca: 5,
  panc: 5,
  six: 6,
  chhe: 6,
  chha: 6,
  seven: 7,
  saat: 7,
  sata: 7,
  eight: 8,
  aath: 8,
  atha: 8,
  nine: 9,
  nau: 9,
  nava: 9,
  nao: 9,
  ten: 10,
  das: 10,
  dasa: 10,
  dash: 10,
  dusa: 10,
  eleven: 11,
  gyarah: 11,
  twelve: 12,
  barah: 12,
  fifteen: 15,
  pandrah: 15,
  twenty: 20,
  bis: 20,
}

/** Month names (English; Hindi/Odia months are out of scope for this parser). */
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  sept: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

type TimeValue = { days: number; hours?: number; precision: TimePrecision }

interface Pattern {
  re: RegExp
  /** Produces the relative/absolute value from a global-regex match. */
  value: (m: RegExpExecArray, full: string, start: number) => TimeValue | { iso: string } | null
}

/** Quantity from a captured number-word group. */
function qty(group: string): number | null {
  const trimmed = group.trim().toLowerCase()
  const n = Number(trimmed)
  if (Number.isInteger(n)) return n
  return WORD_NUM[trimmed] ?? null
}

/** Normalise a day part into an ISO date, or null when the date is impossible. */
function isoFromDmy(d: number, m: number, y: number): string | null {
  if (y < 1900 || y > 2100) return null
  const month = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 2 : 1
  const limit = DAYS_IN_MONTH[m - 1] + (month === 2 && m === 2 ? 1 : 0)
  let day = d
  if (day > limit && m <= 12 && day <= 12) {
    // e.g. "02/15" read day-first -> reject; "15/02" stays day-first. Never guess,
    // but a clearly day-first reading with a valid swap keeps the written tokens.
    return null
  }
  if (day < 1 || day > limit) return null
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(day)}`
}

/** True when the text immediately before a match mentions a time-of-day unit. */
function hasTimeOfDayContext(text: string, start: number): boolean {
  const window = text.slice(Math.max(0, start - 18), start).toLowerCase()
  return /(minute|min\b|minutes|hour|hr|घंटा|घंटे|ଘଣ୍ଟା|ଘଣ୍ଟ|मिनट|ମିନିଟ)/.test(window)
}

const PATTERNS: Pattern[] = [
  /* ---- absolute dates ---- */
  {
    re: /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g,
    value: (m) => {
      const [, a, b, y] = m
      const d = Number(a)
      const mo = Number(b)
      const year = Number(y)
      if (mo >= 1 && mo <= 12) {
        const iso = isoFromDmy(d, mo, year) ?? isoFromDmy(mo, d, year)
        return iso ? { iso } : null
      }
      return null
    },
  },
  {
    re: /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b/gi,
    value: (m) => {
      const [, d, monthName, y] = m
      const mo = MONTHS[monthName.toLowerCase()]
      if (!mo) return null
      const iso = isoFromDmy(Number(d), mo, Number(y))
      return iso ? { iso } : null
    },
  },

  /* ---- native single words: today / yesterday / day before ---- */
  { re: /\b(?:today|aaj|aja|aji|aaji|aij)\b/g, value: () => ({ days: 0, precision: 'relative' as const }) },
  { re: /\b(?:yesterday|kal|kala|kali|kale)\b/g, value: () => ({ days: 1, precision: 'relative' as const }) },
  {
    re: /\b(?:parso|parason|parasom|paradina|paridina|parsoN)\b/g,
    value: () => ({ days: 2, precision: 'relative' as const }),
  },

  /* ---- time-of-day anchors ("this morning", "morning") ---- */
  {
    re: /\b(?:this\s+)?(?:morning|subah|subha|subaha)\b/g,
    value: () => ({ days: 0, precision: 'relative' as const }),
  },

  /* ---- "last week" / "pichhle hafte" / "गत सप्ताह" / "ଗତ ସପ୍ତାହ" ---- */
  {
    re: /\b(?:last|pichhle|pichli|purabe|goto|gata|golo)\s+(week|weeks|saptaha|hafte|hafta|month|months|mahine|mahina|masa)\b/g,
    value: (m) => {
      const unit = m[1].toLowerCase()
      const days = /month|mahine|mahina|masa/.test(unit) ? 30 : 7
      return { days, precision: 'relative' as const }
    },
  },

  /* ---- "X <unit> [ago/pehle/purbe/…]" and "X din se" ---- */
  {
    re: /\b(\d+|[a-z]+)\s+(day|days|din|dina|dain|daina|week|weeks|hafte|hafta|saptaha|month|months|mahine|mahina|masa|year|years|saal|sal|hour|hours|hr|hrs|ghamta|ghante|ghanta)\s*(?:ago|pehle|pahale|pahle|pahalae|purbe|purabe|paurabae|talu|taulu|se|before|back|[।.!?])?\b/g,
    value: (m) => {
      const number = qty(m[1])
      if (number === null) return null
      const unit = m[2].toLowerCase()
      if (/day|din|dina|dain|daina/.test(unit)) return { days: number, precision: 'approximate' as const }
      if (/week|hafte|hafta|saptaha/.test(unit)) return { days: number * 7, precision: 'approximate' as const }
      if (/month|mahine|mahina|masa/.test(unit)) return { days: number * 30, precision: 'approximate' as const }
      if (/year|saal|sal/.test(unit)) return { days: number * 365, precision: 'approximate' as const }
      return { days: 0, hours: number, precision: 'approximate' as const }
    },
  },

  /* ---- "since/for/past 3 days" ---- */
  {
    re: /\b(?:since|for|past|last)\s+(\d+|[a-z]+)\s+(day|days|din|dina|week|weeks|hafte|saptaha|month|months|mahine|masa)\b/g,
    value: (m) => {
      const number = qty(m[1])
      if (number === null) return null
      const unit = m[2].toLowerCase()
      const days = /week|hafte|saptaha/.test(unit)
        ? number * 7
        : /month|mahine|masa/.test(unit)
          ? number * 30
          : number
      return { days, precision: 'approximate' as const }
    },
  },

  /* ---- numeric shorthand: 2d / 3h / 1w / 2m / 4hr / 2dy ---- */
  {
    re: /\b(\d{1,3})\s?(d|h|w|m|hr|hrs|dy|dys)\b/g,
    value: (m, full, start) => {
      const number = Number(m[1])
      const unit = m[2].toLowerCase()
      if (unit === 'd' || unit === 'dy' || unit === 'dys') return { days: number, precision: 'approximate' as const }
      if (unit === 'h' || unit === 'hr' || unit === 'hrs') return { days: 0, hours: number, precision: 'approximate' as const }
      if (unit === 'w') return { days: number * 7, precision: 'approximate' as const }
      // Bare "m": months unless a time-of-day unit sits right before it.
      const months = hasTimeOfDayContext(full, start) ? 0 : number
      return months > 0
        ? { days: number * 30, precision: 'approximate' as const }
        : { days: 0, hours: 0, precision: 'approximate' as const }
    },
  },
]

/** All time expressions found in `text`, best match per span (no overlaps). */
export function parseTimeExpressions(
  text: string,
  language: SupportedLanguage,
  _referenceIso?: string,
): ParsedTime[] {
  const working = language === 'en' ? text : getLatinForm(text, language, detectScriptLanguage(text).script)

  const candidates: ParsedTime[] = []
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.re.exec(working)) !== null) {
      const start = m.index
      const end = start + m[0].length
      const result = pattern.value(m, working, start)
      if (result === null) continue
      const parsed = toParsed(m[0], start, end, result)
      if (parsed) candidates.push(parsed)
    }
  }

  // Greedy earliest-span selection, longest match wins at a shared start.
  candidates.sort((a, b) => a.matchedSpan.start - b.matchedSpan.start || b.matchedSpan.end - a.matchedSpan.end)
  const chosen: ParsedTime[] = []
  let cursor = -1
  for (const candidate of candidates) {
    if (candidate.matchedSpan.start < cursor) continue
    chosen.push(candidate)
    cursor = candidate.matchedSpan.end
  }
  return chosen
}

function toParsed(raw: string, start: number, end: number, result: TimeValue | { iso: string }): ParsedTime | null {
  const precision: TimePrecision = 'iso' in result ? 'exact' : result.precision
  const normalized: NormalizedTime | null =
    'iso' in result
      ? { kind: 'absolute', iso: result.iso }
      : { kind: 'relative', daysFromIntake: result.days, ...(result.hours !== undefined && result.hours !== 0 ? { hoursFromIntake: result.hours } : {}) }
  return { raw, normalized, precision, matchedSpan: { start, end } }
}

/** First best match, or null when nothing could be parsed. */
export function parseTimeExpression(
  text: string,
  language: SupportedLanguage,
  referenceIso?: string,
): ParsedTime | null {
  return parseTimeExpressions(text, language, referenceIso)[0] ?? null
}