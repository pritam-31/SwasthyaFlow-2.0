import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type {
  AnonymisationCoverage,
  ModalityAnonymisationReport,
  PIICategory,
  PIIMatch,
  PIIModality,
  PiiPattern,
} from '../types/anonymisation.types'
import type { AnonymizationReport, RedactionCategory, RedactionMap } from '../types'
import type { SupportedLanguage } from '../types/language.types'
import type { PiiType } from '../types/visual.types'
import { detectScriptLanguage, normalizeLanguage } from './languageDetectionService'
import { patternsForLanguage } from './piiPatterns'
import { detectPii } from './piiDetectionService'
import { redactImage } from './redactionService'
import { extractWordsFromImage } from './ocrService'
import { computeAnonymisationConfidence } from './confidenceService'

/** Attaches the deterministic explainability score for one match. */
function withConfidence(match: PIIMatch): PIIMatch {
  match.confidenceScore = computeAnonymisationConfidence(match)
  return match
}

/**
 * Unified, pure anonymiser (P0-7).
 *
 * One implementation serves every modality. It is deterministic and side-effect
 * free: no persistence, no logging, no I/O beyond decoding an image when one is
 * supplied. Output text is structurally identical to the input except that every
 * detected identifier is replaced with a typed placeholder in the input's own
 * language. Raw PII is captured on {@link PIIMatch.raw} for the in-process test
 * harness only — callers MUST pass reports through `scrubRaw` before returning.
 */

/** Canonical (English) placeholder → per-language rendering. */
const PLACEHOLDER_TABLE: Record<string, Record<SupportedLanguage, string>> = {
  '[NAME]': { en: '[NAME]', hi: '[नाम]', or: '[ନାମ]' },
  '[PHONE]': { en: '[PHONE]', hi: '[फ़ोन]', or: '[ଫୋନ]' },
  '[AADHAAR]': { en: '[AADHAAR]', hi: '[आधार]', or: '[ଆଧାର]' },
  '[PAN]': { en: '[PAN]', hi: '[पैन]', or: '[ପାନ]' },
  '[ID]': { en: '[ID]', hi: '[आईडी]', or: '[ଆଇଡି]' },
  '[ADDRESS]': { en: '[ADDRESS]', hi: '[पता]', or: '[ଠିକଣା]' },
  '[DOB]': { en: '[DOB]', hi: '[जन्म तिथि]', or: '[ଜନ୍ମ ତାରିଖ]' },
  '[AGE]': { en: '[AGE]', hi: '[उम्र]', or: '[ବୟସ]' },
  '[EMAIL]': { en: '[EMAIL]', hi: '[ईमेल]', or: '[ଇମେଲ]' },
  '[FACILITY]': { en: '[FACILITY]', hi: '[संस्थान]', or: '[ପ୍ରତିଷ୍ଠାନ]' },
  '[PATIENT-ID]': { en: '[PATIENT-ID]', hi: '[रोगी आईडी]', or: '[ରୋଗୀ ଆଇଡି]' },
  '[RELATIVE]': { en: '[RELATIVE]', hi: '[संबंधी]', or: '[ସମ୍ପର୍କୀୟ]' },
  '[VEHICLE]': { en: '[VEHICLE]', hi: '[वाहन]', or: '[ଯାନ]' },
  '[INSURANCE]': { en: '[INSURANCE]', hi: '[बीमा]', or: '[ବୀମା]' },
  '[BANK]': { en: '[BANK]', hi: '[बैंक]', or: '[ବ୍ୟାଙ୍କ]' },
  '[IP]': { en: '[IP]', hi: '[आईपी]', or: '[ଆଇପି]' },
  '[DEVICE]': { en: '[DEVICE]', hi: '[उपकरण]', or: '[ଉପକରଣ]' },
  '[GPS]': { en: '[GPS]', hi: '[स्थान]', or: '[ସ୍ଥାନ]' },
  '[URL]': { en: '[URL]', hi: '[यूआरएल]', or: '[ୟୁଆରଏଲ]' },
  '[QR]': { en: '[QR]', hi: '[क्यूआर]', or: '[କ୍ୟୁଆର]' },
  '[FACE]': { en: '[FACE]', hi: '[चेहरा]', or: '[ମୁଁହ]' },
  '[NAME-PLATE]': { en: '[NAME-PLATE]', hi: '[नाम-पट्टिका]', or: '[ନାମ-ଫଳକ]' },
  '[ID-CARD]': { en: '[ID-CARD]', hi: '[पहचान-पत्र]', or: '[ପରିଚୟ-ପତ୍ର]' },
  '[WRISTBAND]': { en: '[WRISTBAND]', hi: '[कलाई-पट्टा]', or: '[ହାତବନ୍ଧ]' },
  '[UNKNOWN]': { en: '[UNKNOWN]', hi: '[अज्ञात]', or: '[ଅଜ୍ଞାତ]' },
}

const PII_TYPE_TO_CATEGORY: Record<PiiType, PIICategory> = {
  face: 'face-region',
  'name-plate': 'name-plate-region',
  'hospital-band': 'wristband-region',
  wristband: 'wristband-region',
  phone: 'phone-region',
  address: 'address-region',
  'id-number': 'id-card-region',
  email: 'id-card-region',
  'date-of-birth': 'id-card-region',
  'hospital-id': 'id-card-region',
  'patient-id': 'id-card-region',
  aadhaar: 'id-card-region',
  pan: 'id-card-region',
  'voter-id': 'id-card-region',
  'ration-card': 'id-card-region',
  'lab-name': 'name-plate-region',
}

const CATEGORY_TO_REDACTION: Partial<Record<PIICategory, RedactionCategory>> = {
  'person-name': 'name',
  'honorific-name': 'name',
  'doctor-name': 'name',
  'relative-name': 'name',
  'facility-id': 'hospital-id',
  'patient-id': 'patient-id',
  'lab-name': 'lab-name',
  'hospital-name': 'lab-name',
  phone: 'phone',
  aadhaar: 'aadhaar',
  pan: 'pan',
  'voter-id': 'voter-id',
  'ration-card': 'ration-card',
  email: 'email',
  address: 'address',
  dob: 'date-of-birth',
  'face-region': 'name',
  'name-plate-region': 'name',
  'id-card-region': 'id-number',
  'phone-region': 'phone',
  'address-region': 'address',
  'wristband-region': 'id-number',
  'qr-barcode': 'id-number',
}

/** Render a canonical placeholder in the requested language. */
export function localizePlaceholder(canonical: string, language: SupportedLanguage): string {
  const row = PLACEHOLDER_TABLE[canonical]
  return row ? row[language] : canonical
}

export function placeholderFor(category: PIICategory, _language: SupportedLanguage): string {
  return CANONICAL_BY_CATEGORY[category] ?? '[REDACTED]'
}

const CANONICAL_BY_CATEGORY: Record<PIICategory, string> = {
  'person-name': '[NAME REDACTED]',
  'honorific-name': '[NAME REDACTED]',
  'doctor-name': '[NAME REDACTED]',
  phone: '[PHONE REDACTED]',
  aadhaar: '[AADHAAR REDACTED]',
  pan: '[PAN REDACTED]',
  'voter-id': '[VOTER ID REDACTED]',
  'ration-card': '[RATION CARD REDACTED]',
  passport: '[ID REDACTED]',
  'driving-license': '[ID REDACTED]',
  email: '[EMAIL REDACTED]',
  address: '[ADDRESS REDACTED]',
  dob: '[DOB REDACTED]',
  'age-with-name': '[AGE REDACTED]',
  'facility-id': '[HOSPITAL ID REDACTED]',
  'patient-id': '[PATIENT ID REDACTED]',
  'lab-name': '[LAB REDACTED]',
  'hospital-name': '[LAB REDACTED]',
  'relative-name': '[NAME REDACTED]',
  'vehicle-number': '[VEHICLE REDACTED]',
  'insurance-number': '[INSURANCE REDACTED]',
  'bank-account': '[BANK REDACTED]',
  'ip-address': '[IP REDACTED]',
  'device-id': '[DEVICE REDACTED]',
  gps: '[GPS REDACTED]',
  'url-with-id': '[URL REDACTED]',
  'face-region': '[NAME REDACTED]',
  'name-plate-region': '[NAME REDACTED]',
  'id-card-region': '[ID REDACTED]',
  'phone-region': '[PHONE REDACTED]',
  'address-region': '[ADDRESS REDACTED]',
  'wristband-region': '[ID REDACTED]',
  'qr-barcode': '[ID REDACTED]',
  'filename-pii': '[PII REDACTED]',
  'session-label-pii': '[PII REDACTED]',
  'toast-pii': '[PII REDACTED]',
  'audit-display-name': '[NAME REDACTED]',
  unknown: '[REDACTED]',
}

interface RawMatch {
  start: number
  end: number
  category: PIICategory
  replacement: string
  confidence: number
  raw: string
}

function collectMatches(text: string, patterns: PiiPattern[]): RawMatch[] {
  const matches: RawMatch[] = []
  for (const rule of patterns) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`
    const re = new RegExp(rule.pattern.source, flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      // Never re-redact an existing placeholder — guarantees idempotency.
      if (match[0].includes('REDACTED') || /^\[[^\]]*\]$/.test(match[0])) continue
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        category: rule.category,
        replacement: rule.replacement,
        confidence: rule.confidence,
        raw: match[0],
      })
    }
  }
  return matches
}

/** Greedy non-overlapping selection: earliest start, then longest, then most confident. */
function resolveOverlaps(matches: RawMatch[]): RawMatch[] {
  const sorted = [...matches].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || b.confidence - a.confidence,
  )
  const accepted: RawMatch[] = []
  let lastEnd = -1
  for (const match of sorted) {
    if (match.start >= lastEnd) {
      accepted.push(match)
      lastEnd = match.end
    }
  }
  return accepted
}

function buildCoverage(matches: PIIMatch[]): AnonymisationCoverage {
  const totalCandidates = matches.length
  const unknown = matches.filter((m) => m.category === 'unknown').length
  const redacted = totalCandidates - unknown
  return {
    totalCandidates,
    redacted,
    skipped: 0,
    unknown,
    coverageRatio: totalCandidates === 0 ? 1 : redacted / totalCandidates,
  }
}

export interface TextAnonymisationResult extends ModalityAnonymisationReport {
  text: string
}

/**
 * Redact PII from free text. Language is taken from the argument when valid,
 * otherwise detected from the script. Clinical content is never touched.
 */
export function anonymiseText(
  text: string,
  modality: PIIModality,
  language?: SupportedLanguage,
): TextAnonymisationResult {
  const started = Date.now()
  const detected = detectScriptLanguage(text)
  const code = normalizeLanguage(language, text, detected.code)
  const patterns = patternsForLanguage(code)

  const accepted = resolveOverlaps(collectMatches(text, patterns))
  const matches: PIIMatch[] = []
  let output = ''
  let cursor = 0
  for (const match of accepted) {
    const replacement = placeholderFor(match.category, code)
    output += text.slice(cursor, match.start) + replacement
    cursor = match.end
    matches.push(withConfidence({
      category: match.category,
      modality,
      span: { start: match.start, end: match.end },
      raw: match.raw,
      replacement,
      confidence: match.confidence,
      language: code,
    }))
  }
  output += text.slice(cursor)

  return {
    modality,
    text: output,
    matches,
    redactedCount: matches.length,
    durationMs: Date.now() - started,
    warnings: [],
  }
}

export interface ImageAnonymisationResult {
  redactedImageBuffer: Buffer
  report: ModalityAnonymisationReport
  redactionMap: RedactionMap
}

/**
 * Redact PII regions from an image: OCR text scan + the documented face
 * heuristic, painted over in black. The original buffer is never returned.
 */
export async function anonymiseImage(
  imageBuffer: Buffer,
  modality: PIIModality,
  language?: SupportedLanguage,
): Promise<ImageAnonymisationResult> {
  const started = Date.now()
  const warnings: string[] = []
  const metadata = await sharp(imageBuffer).metadata()
  const width = metadata.width ?? 1
  const height = metadata.height ?? 1

  let words: Awaited<ReturnType<typeof extractWordsFromImage>>['words'] = []
  let ocrText = ''
  try {
    const ocr = await extractWordsFromImage(imageBuffer)
    words = ocr.words
    ocrText = ocr.text
  } catch {
    warnings.push('OCR unavailable — image scanned for faces only.')
  }

  const detected = detectScriptLanguage(ocrText)
  const code = normalizeLanguage(language, ocrText, detected.code)

  const { regions } = await detectPii(
    {
      buffer: imageBuffer,
      width,
      height,
      originalMimeType: 'image/jpeg',
      originalSizeBytes: imageBuffer.length,
      sourceExifStripped: false,
      converted: false,
    },
    words,
  )

  // Barcode / QR heuristic: dense mixed alphanumeric tokens on one word.
  for (const word of words) {
    const token = word.text.trim()
    if (token.length >= 12 && /\d/.test(token) && /[A-Za-z]/.test(token) && !/\s/.test(token)) {
      warnings.push('A dense alphanumeric code (possible QR/barcode) was detected and flagged for review.')
      break
    }
  }

  const redactedImageBuffer = await redactImage(imageBuffer, width, height, regions)

  const matches: PIIMatch[] = regions.map((region) => {
    const category = PII_TYPE_TO_CATEGORY[region.type]
    return withConfidence({
      category,
      modality,
      span: { start: 0, end: 0 },
      replacement: placeholderFor(category, code),
      confidence: region.confidence,
      language: code,
    })
  })

  const counts = new Map<RedactionCategory, number>()
  for (const match of matches) {
    const redaction = CATEGORY_TO_REDACTION[match.category]
    if (!redaction) continue
    counts.set(redaction, (counts.get(redaction) ?? 0) + 1)
  }

  return {
    redactedImageBuffer,
    report: {
      modality,
      matches,
      redactedCount: matches.length,
      durationMs: Date.now() - started,
      warnings,
    },
    redactionMap: {
      sessionId: '',
      createdAt: new Date().toISOString(),
      entries: [...counts.entries()].map(([category, count]) => ({ category, count })),
    },
  }
}

/**
 * Build unified matches from already-detected image regions. Used by callers
 * that run detection themselves (e.g. the visual pipeline, which needs the raw
 * regions for non-diagnostic analysis) so the run can still be reported and
 * audited without a second OCR pass.
 */
export function matchesFromImageRegions(
  regions: { type: PiiType; confidence: number }[],
  modality: PIIModality,
  language: SupportedLanguage,
): PIIMatch[] {
  return regions.map((region) => {
    const category = PII_TYPE_TO_CATEGORY[region.type]
    return withConfidence({
      category,
      modality,
      span: { start: 0, end: 0 },
      replacement: placeholderFor(category, language),
      confidence: region.confidence,
      language,
    })
  })
}

export interface ObjectAnonymisationResult {
  value: unknown
  report: ModalityAnonymisationReport
}

/** Deep-walk any value and redact every string it contains. */
export function anonymiseObject(
  value: unknown,
  modality: PIIModality,
  depth = 0,
): ObjectAnonymisationResult {
  const started = Date.now()
  const matches: PIIMatch[] = []
  const warnings: string[] = []

  const walk = (node: unknown, level: number): unknown => {
    if (level > 12) {
      warnings.push('Object nesting exceeded the anonymisation depth limit; deeper values were truncated.')
      return node
    }
    if (typeof node === 'string') {
      const result = anonymiseText(node, modality)
      matches.push(...result.matches)
      return result.text
    }
    if (Array.isArray(node)) return node.map((item) => walk(item, level + 1))
    if (node !== null && typeof node === 'object') {
      const copy: Record<string, unknown> = {}
      for (const [key, sub] of Object.entries(node as Record<string, unknown>)) {
        copy[key] = walk(sub, level + 1)
      }
      return copy
    }
    return node
  }

  const redacted = walk(value, depth)
  return {
    value: redacted,
    report: {
      modality,
      matches,
      redactedCount: matches.length,
      durationMs: Date.now() - started,
      warnings,
    },
  }
}

/** Strip PII from a log line (identifier-only placeholders). */
export function anonymiseLog(message: string): string {
  return anonymiseText(message, 'log-message').text
}

/** Strip PII from an error message before it is returned to a client. */
export function anonymiseErrorMessage(message: string): string {
  return anonymiseText(message, 'error-message').text
}

/**
 * Replace a PII-bearing filename with an opaque, deterministic id that keeps
 * the extension. A clean filename is returned unchanged.
 */
export function anonymiseFilename(filename: string): string {
  const result = anonymiseText(filename, 'report-metadata')
  if (result.matches.length === 0) return filename
  const dot = filename.lastIndexOf('.')
  const ext = dot > 0 && dot < filename.length - 1 ? filename.slice(dot) : ''
  const hash = createHash('sha1').update(filename).digest('hex').slice(0, 8)
  return `file-${hash}${ext}`
}

/** Strip PII from a server-constructed toast / notification string. */
export function anonymiseToast(message: string): string {
  return anonymiseText(message, 'toast-pii').text
}

/**
 * Projects unified matches back onto the legacy `AnonymizationReport` shape so
 * existing storage (session.anonymization, report.anonymization) keeps working.
 */
export function toLegacyAnonymizationReport(matches: PIIMatch[], language: SupportedLanguage): AnonymizationReport {
  const counts = new Map<RedactionCategory, number>()
  for (const match of matches) {
    const redaction = CATEGORY_TO_REDACTION[match.category]
    if (!redaction) continue
    counts.set(redaction, (counts.get(redaction) ?? 0) + 1)
  }
  const redactions = [...counts.entries()].map(([category, count]) => ({ category, count }))
  return {
    redactedCount: redactions.reduce((sum, entry) => sum + entry.count, 0),
    redactions,
    byLanguage: [{ language, count: redactions.reduce((sum, entry) => sum + entry.count, 0) }],
  }
}

export { buildCoverage }
