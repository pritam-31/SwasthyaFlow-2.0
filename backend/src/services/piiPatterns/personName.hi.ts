import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Hindi (Devanagari) person-name and honorific detectors.
 *
 * Matches the self-identification markers used on regional forms and in
 * dictation (`मेरा नाम …`, `नाम: …`, `रोगी का नाम …`) plus the honorific set
 * (`श्री`, `श्रीमती`, `सुश्री`, `कुमारी`, `डॉ`, `डॉक्टर`). The character class
 * excludes the danda (`।`) so a name can never swallow the next sentence.
 */

const DEVANAGARI_NAME = String.raw`[\u0900-\u0963\u0966-\u097F][\u0900-\u0963\u0966-\u097F .'-]{1,40}`
const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`

export const hindiNamePatterns: PiiPattern[] = [
  {
    category: 'person-name',
    confidence: 0.9,
    pattern: new RegExp(
      String.raw`(?:मेरा${HS}नाम(?:${HS}है)?|मेरा${HS}नांम(?:${HS}है)?|नाम${HS}है|नाम)${SEP}${DEVANAGARI_NAME}`,
      'g',
    ),
    replacement: '[NAME]',
  },
  {
    category: 'person-name',
    confidence: 0.85,
    pattern: new RegExp(String.raw`(?:रोगी${HS}का${HS}नाम|मरीज़${HS}का${HS}नाम)${SEP}${DEVANAGARI_NAME}`, 'g'),
    replacement: '[NAME]',
  },
  {
    category: 'honorific-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:श्री|श्रीमती|सुश्री|कुमारी|डॉक्टर|डॉ)${HS}*\.?${HS}*${DEVANAGARI_NAME}`, 'g'),
    replacement: '[NAME]',
  },
]
