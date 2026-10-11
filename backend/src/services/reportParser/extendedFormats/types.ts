/**
 * Extended lab format definition (K — additional lab format support).
 *
 * Each format knows how to recognise its brand from OCR text and extract
 * the relevant lab values / vitals using the supplied rules.
 */
export interface ExtendedLabFormat {
  /** Regex strings tried case‑insensitively against the OCR text header. */
  headerPatterns: string[]
  /** Regex for splitting the report into rows / sections. */
  tableDelimiters: string
  /** Rules for extracting each lab value / vital from a matched row. */
  valueExtractionRules: {
    canonicalName: string
    aliases?: string[]
    unitPattern: string
    valuePattern: string
    rangePattern: string
  }[]
  /** Regex strings tried against the tail of the report to locate its end. */
  footerPatterns: string[]
  /** Free‑form notes for the format maintainer. */
  notes: string
}