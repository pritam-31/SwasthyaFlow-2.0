/**
 * Extended lab format registry (K — additional lab format support).
 *
 * Formats are registered by brand name and the report parser tries each
 * format's headerPatterns against the OCR text at parse time. On no match,
 * the generic parser is used.
 */

// Import the JSON format definitions directly (runtime values)
import thyrocare from './thyrocare.json'
import lalpathlabs from './lalpathlabs.json'
import apollo from './apollo.json'
import srl from './srl.json'
import metropolis from './metropolis.json'

export interface ExtendedLabFormat {
  headerPatterns: RegExp[]
  tableDelimiters: string
  valueExtractionRules: {
    canonicalName: string
    aliases?: string[]
    unitPattern: string
    valuePattern: string
    rangePattern: string
  }[]
  footerPatterns: RegExp[]
  notes: string
}

type RawExtendedLabFormat = Omit<ExtendedLabFormat, 'headerPatterns' | 'footerPatterns'> & {
  headerPatterns: string[]
  footerPatterns: string[] | string
}

function compileFormat(raw: RawExtendedLabFormat): ExtendedLabFormat {
  return {
    ...raw,
    headerPatterns: raw.headerPatterns.map((p) => new RegExp(p, 'i')),
    footerPatterns: (Array.isArray(raw.footerPatterns) ? raw.footerPatterns : [raw.footerPatterns]).map((p) => new RegExp(p, 'i')),
  }
}

const compiledThyrocare = compileFormat(thyrocare as RawExtendedLabFormat)
const compiledLalpathlabs = compileFormat(lalpathlabs as RawExtendedLabFormat)
const compiledApollo = compileFormat(apollo as RawExtendedLabFormat)
const compiledSrl = compileFormat(srl as RawExtendedLabFormat)
const compiledMetropolis = compileFormat(metropolis as RawExtendedLabFormat)

/** Brand-keyed registry of loaded formats. */
export const extendedLabFormatRegistry: Map<string, ExtendedLabFormat> = new Map()

/** Check if the OCR text matches any registered brand format.
 *  Returns the brand name if matched, null otherwise. */
export function detectLabFormat(text: string): string | null {
  const brands: ExtendedLabFormat[] = [
    compiledThyrocare,
    compiledLalpathlabs,
    compiledApollo,
    compiledSrl,
    compiledMetropolis,
  ]
  for (const format of brands) {
    for (const re of format.headerPatterns) {
      if (re.test(text)) {
        return format.notes
      }
    }
  }
  return null
}

/** Initialise the registry at module load. */
;(function init() {
  const brands: ExtendedLabFormat[] = [compiledThyrocare, compiledLalpathlabs, compiledApollo, compiledSrl, compiledMetropolis]
  for (const f of brands) {
    extendedLabFormatRegistry.set(f.notes, f)
  }
})()

// Export for consumers that may need compiled formats
export function tryBrandFormat(_text: string): unknown {
  return null
}