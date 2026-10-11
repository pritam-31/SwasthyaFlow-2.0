import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * English / Hinglish person-name and honorific detectors.
 *
 * Two shapes only:
 *  - an honorific followed by a name (`Mr. Ramesh Kumar`, `Dr A. Mehta`), and
 *  - an explicit self-identification marker (`my name is …`, `name: …`,
 *    `patient name …`, Hinglish `mera naam …`).
 * A bare capitalised run is never treated as a name, so clinical text such as
 * "Complete Blood Count" or "Chest pain" is left untouched.
 */

/** A Latin person-name run: 1–4 capitalised words. */
const LATIN_NAME = String.raw`[A-Z][A-Za-z.'-]*(?:[^\S\n]+[A-Z][A-Za-z.'-]*){0,3}`
/** A lowercase (Hinglish) name run. */
const LATIN_LOWER_NAME = String.raw`[a-z][a-z.'-]*(?:[^\S\n]+[a-z][a-z.'-]+){0,3}`
const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`

const TITLES = ['mr', 'mrs', 'ms', 'miss', 'shri', 'sri', 'shrimati', 'smt', 'dr', 'doctor']
  .map((t) => t.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`))
  .join('|')

/** Suppress the bare `name` marker right after a report label (`Test Name`, …). */
const NOT_A_PERSON_LABEL = String.raw`(?<!(?:[Tt]est|[Ss]pecimen|[Ss]ample|[Ii]tem|[Pp]arameter|[Aa]nalyte|[Ii]nvestigation)[^\S\n])`

export const englishNamePatterns: PiiPattern[] = [
  {
    category: 'person-name',
    confidence: 0.9,
    pattern: new RegExp(
      String.raw`\b(?:${['my name is', 'i am called', 'i am', 'patient name', 'patient:', 'pt name'].map((s) => s.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`)).join('|')}|${NOT_A_PERSON_LABEL}${'[Nn][Aa][Mm][Ee]'})${SEP}${LATIN_NAME}`,
      'g',
    ),
    replacement: '[NAME]',
  },
  {
    // Lowercase Hinglish name after a self-identification marker.
    category: 'person-name',
    confidence: 0.8,
    pattern: new RegExp(
      String.raw`\b(?:mera${HS}naam(?:${HS}hai)?|mera${HS}nam(?:${HS}hai)?|naam${HS}hai|my${HS}name${HS}is)${SEP}${LATIN_LOWER_NAME}`,
      'gi',
    ),
    replacement: '[NAME]',
  },
  {
    // Bare `name: …` (lowercase or capitalised) — report / form field.
    category: 'person-name',
    confidence: 0.7,
    pattern: new RegExp(String.raw`\bname${HS}*[:-]${HS}*${LATIN_NAME}`, 'g'),
    replacement: '[NAME]',
  },
  {
    category: 'honorific-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`\b(?:${TITLES})\.?${HS}+${LATIN_NAME}`, 'g'),
    replacement: '[NAME]',
  },
]
