import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Odia person-name and honorific detectors.
 *
 * Covers the form markers (`ନାମ`, `ରୋଗୀର ନାମ`, `ମୋର ନାମ …`), the honorifics
 * (`ଶ୍ରୀ`, `ଶ୍ରୀମତୀ`, `ସୁଶ୍ରୀ`, `କୁମାରୀ`, `ଡାକ୍ତର`) and the romanised Odlish
 * self-identification (`mora nama …`).
 */

const ODIA_NAME = String.raw`[\u0B00-\u0B7F][\u0B00-\u0B7F .'-]{1,40}`
const LATIN_LOWER_NAME = String.raw`[a-z][a-z.'-]*(?:[^\S\n]+[a-z][a-z.'-]+){0,3}`
const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`

export const odiaNamePatterns: PiiPattern[] = [
  {
    category: 'person-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:ମୋର${HS}ନାମ(?:${HS}ହେଉଛି)?|ନାମ${HS}ହେଉଛି|ନାମ)${SEP}${ODIA_NAME}`, 'g'),
    replacement: '[NAME]',
  },
  {
    category: 'person-name',
    confidence: 0.85,
    pattern: new RegExp(String.raw`(?:ରୋଗୀର${HS}ନାମ|ରୋଗୀ${HS}ନାମ)${SEP}${ODIA_NAME}`, 'g'),
    replacement: '[NAME]',
  },
  {
    category: 'honorific-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:ଶ୍ରୀ|ଶ୍ରୀମତୀ|ସୁଶ୍ରୀ|କୁମାରୀ|ଡାକ୍ତର)${HS}*\.?${HS}*${ODIA_NAME}`, 'g'),
    replacement: '[NAME]',
  },
  {
    // Odlish: romanised self-identification.
    category: 'person-name',
    confidence: 0.8,
    pattern: new RegExp(String.raw`\b(?:mora${HS}nama(?:${HS}heichi)?|nama${HS}heichi)${SEP}${LATIN_LOWER_NAME}`, 'gi'),
    replacement: '[NAME]',
  },
]
