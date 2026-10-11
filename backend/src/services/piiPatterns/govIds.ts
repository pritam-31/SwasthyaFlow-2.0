import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Government / institutional identifier detectors.
 *
 * Bare formats are matched only when the shape is distinctive enough to avoid
 * clinical numbers (PAN, Aadhaar, Voter-id). Weaker shapes (passport, driving
 * licence, ration card) are marker-gated so a lab value is never eaten.
 */

const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`
/** An identifier token containing at least one digit, possibly space-separated. */
const ID_ATOM = String.raw`(?=[A-Za-z0-9/-]*\d)[A-Za-z0-9/-]+`
const ID_VALUE = String.raw`(?:${ID_ATOM}(?:[^\S\n]+${ID_ATOM})*)`

/** Tolerant of OCR noise: `0`/`O` confusion and a trailing `l`/`1`. */
const AADHAAR_OCR = String.raw`(?<![\dO])[0-9O]{4}[\s-]?[0-9O]{4}[\s-]?[0-9O]{3}[0-9Ol](?![\dO])`

export const govIdPatterns: PiiPattern[] = [
  {
    category: 'aadhaar',
    confidence: 0.95,
    pattern: new RegExp(String.raw`\b(?:aadhaar|aadhar|आधार|ଆଧାର)${HS}*(?:id|number|no\.?|नंबर)?${SEP}?${ID_VALUE}\b`, 'gi'),
    replacement: '[AADHAAR]',
  },
  {
    category: 'aadhaar',
    confidence: 0.9,
    pattern: new RegExp(AADHAAR_OCR, 'g'),
    replacement: '[AADHAAR]',
  },
  {
    category: 'pan',
    confidence: 0.95,
    pattern: new RegExp(String.raw`\b(?:pan|पैन|ପାନ)${HS}*(?:card|no|number|id)?${SEP}?[A-Za-z]{5}\d{4}[A-Za-z]\b`, 'gi'),
    replacement: '[PAN]',
  },
  {
    category: 'pan',
    confidence: 0.9,
    pattern: /(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])/g,
    replacement: '[PAN]',
  },
  {
    category: 'voter-id',
    confidence: 0.9,
    pattern: /\b[A-Z]{3}[0-9]{7}\b/g,
    replacement: '[ID]',
  },
  {
    category: 'voter-id',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\b(?:voter|epic|urn|मतदाता|ଭୋଟର)${HS}*(?:id|number|no\.?)?${SEP}?${ID_VALUE}\b`, 'gi'),
    replacement: '[ID]',
  },
  {
    category: 'ration-card',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\b(?:ration${HS}card|राशन${HS}कार्ड|ରାସନ${HS}କାର୍ଡ)${HS}*(?:no\.?|number|id)?${SEP}?${ID_VALUE}\b`, 'gi'),
    replacement: '[ID]',
  },
  {
    category: 'passport',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\b(?:passport|पासपोर्ट|ପାସପୋର୍ଟ)${HS}*(?:no\.?|number|id)?${SEP}?[A-Za-z]\d{7}\b`, 'gi'),
    replacement: '[ID]',
  },
  {
    category: 'driving-license',
    confidence: 0.85,
    pattern: new RegExp(
      String.raw`\b(?:dl|driving${HS}licen[cs]e|driving${HS}licence|ड्राइविंग${HS}लाइसेंस|ଡ୍ରାଇଭିଂ)${HS}*(?:no\.?|number|id)?${SEP}?[A-Za-z]{2}[0-9]{2}[\s-]?[0-9]{10,11}\b`,
      'gi',
    ),
    replacement: '[ID]',
  },
  {
    category: 'patient-id',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\b(?:abha|patient|health|opd|mrn|रोगी|ରୋଗୀ)${HS}*(?:id|no\.?|number|code|account|आईडी|ଆଇଡି)${SEP}?${ID_VALUE}\b`, 'gi'),
    replacement: '[PATIENT-ID]',
  },
  {
    category: 'facility-id',
    confidence: 0.85,
    pattern: new RegExp(String.raw`\buhid${HS}*${SEP}?${ID_VALUE}\b`, 'gi'),
    replacement: '[FACILITY]',
  },
  {
    category: 'facility-id',
    confidence: 0.8,
    pattern: new RegExp(
      String.raw`\b(?:hospital${HS}(?:id|number|no\.?|reg)|registration${HS}(?:no\.?|number)|अस्पताल${HS}(?:आईडी|नंबर)|ଡାକ୍ତରଖାନା)${SEP}?${ID_VALUE}\b`,
      'gi',
    ),
    replacement: '[FACILITY]',
  },
]
