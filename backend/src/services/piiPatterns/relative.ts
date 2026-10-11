import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Relative-name detectors.
 *
 * Matches the "son of / wife of / father of" family used on Indian forms and
 * reports, in English (incl. `S/o`, `W/o`, `D/o`, `C/o`), Hindi (`पुत्र`,
 * `पुत्री`, `पत्नी`, `पिता`, `माता`) and Odia (`ପୁତ୍ର`, `କନ୍ୟା`, `ସ୍ତ୍ରୀ`,
 * `ପିତା`, `ମାତା`).
 */

const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`
const ANY_NAME = String.raw`(?:[A-Z][A-Za-z.'-]*(?:${HS}[A-Z][A-Za-z.'-]*){0,3}|[\u0900-\u097F][\u0900-\u097F .'-]{1,40}|[\u0B00-\u0B7F][\u0B00-\u0B7F .'-]{1,40})`

const EN_RELATIVE = ['son of', 'daughter of', 'wife of', 'husband of', 'father of', 'mother of', 's/o', 'd/o', 'w/o', 'c/o']
  .map((w) => w.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`))
  .join('|')

export const relativePatterns: PiiPattern[] = [
  {
    category: 'relative-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`\b(?:${EN_RELATIVE})\.?${SEP}${ANY_NAME}`, 'g'),
    replacement: '[RELATIVE]',
  },
  {
    category: 'relative-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:पुत्र|पुत्री|पत्नी|पति|पिता|माता|पिता${HS}का${HS}नाम)${SEP}${ANY_NAME}`, 'g'),
    replacement: '[RELATIVE]',
  },
  {
    category: 'relative-name',
    confidence: 0.9,
    pattern: new RegExp(String.raw`(?:ପୁତ୍ର|କନ୍ୟା|ସ୍ତ୍ରୀ|ସ୍ୱାମୀ|ପିତା|ମାତା)${SEP}${ANY_NAME}`, 'g'),
    replacement: '[RELATIVE]',
  },
]
