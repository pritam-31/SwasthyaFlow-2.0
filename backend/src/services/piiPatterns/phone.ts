import type { PiiPattern } from '../../types/anonymisation.types'

/**
 * Phone-number detectors (India-focused).
 *
 *  - Bare mobiles: 10 digits starting 6–9, optional `+91`/`91`/`0` prefix and
 *    flexible internal spaces/dashes (`98765 43210`, `+91-9876543210`).
 *  - Marker-led numbers: `phone`, `mobile`, `contact`, `tel`, `फ़ोन`, `मोबाइल`,
 *    `ଫୋନ`, `ମୋବାଇଲ` followed by a digit run (catches landlines and odd formats).
 */

const HS = String.raw`[^\S\n]`
const SEP = String.raw`(?:[:-][^\S\n]*|[^\S\n]+)`
const MARKER = ['phone', 'mobile', 'mob', 'contact', 'tel', 'telephone', 'whatsapp']
  .map((w) => w.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`))
  .join('|')

export const phonePatterns: PiiPattern[] = [
  {
    category: 'phone',
    confidence: 0.9,
    pattern: /(?<!\d)(?:\+?91[\s-]?)?(?:0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g,
    replacement: '[PHONE]',
  },
  {
    category: 'phone',
    confidence: 0.95,
    pattern: new RegExp(
      String.raw`\b(?:${MARKER}|फ़ोन|फोन|मोबाइल|ଫୋନ|ମୋବାଇଲ)${HS}*(?:no\.?|number|नंबर|नं|ନମ୍ବର)?${SEP}[+]?\d[\d\s-]{6,14}\d`,
      'gi',
    ),
    replacement: '[PHONE]',
  },
]
