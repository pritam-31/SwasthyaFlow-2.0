import type { ParsedLabValue, ParsedReport, ParsedVital, ReportLanguage, ReportOcrMeta, ReportType, ValueFlag } from '../types'
import { detectLabFormat } from './reportParser/extendedFormats/loader'

export const NON_DIAGNOSTIC_DISCLAIMER =
  'NON-DIAGNOSTIC EXTRACTION. An AI assistant extracted these values from the uploaded document for review by a qualified healthcare worker. They are not a diagnosis, prescription, or treatment plan. Verify every value against the original document; nothing here replaces professional medical judgement.'

export const NON_DIAGNOSTIC_SHORT = 'Non-diagnostic assistive system: AI drafts, a healthcare worker decides.'
export const CONSENT_POLICY_VERSION = 'v1.0-2026'

const BANNED_PHRASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bdiagnos(?:is|es|e|ed|ing)\b/gi, replacement: 'clinical summary' },
  { pattern: /\bprescrib(?:e|es|ed|ing|ption)\b/gi, replacement: 'clinician decision' },
  { pattern: /\btreat(?:ment|ments)\b/gi, replacement: 'clinical management' },
  { pattern: /\byou have\b/gi, replacement: 'the patient reports' },
  { pattern: /\bsuffers? from\b/gi, replacement: 'reports' },
  { pattern: /\bindicative of\b/gi, replacement: 'recorded alongside' },
  { pattern: /\bis likely (?:to be|a|an)\b/gi, replacement: 'was recorded alongside' },
  { pattern: /\btake (?:this |these )?(?:tablet|medicine|drug)s?\b/gi, replacement: 'review current medicines with a healthcare worker' },
]

export function findDiagnosticLanguage(text: string): string[] {
  return BANNED_PHRASES.flatMap(({ pattern }) => {
    const matcher = new RegExp(pattern.source, pattern.flags.replace('g', ''))
    return matcher.test(text) ? [pattern.source] : []
  })
}

export function enforceNonDiagnostic(text: string): string {
  return BANNED_PHRASES.reduce((result, { pattern, replacement }) => result.replace(pattern, replacement), text)
}

interface VitalRule {
  name: string
  aliases: string[]
  unit: string
  low: number
  high: number
  confidence: number
}

const VITAL_RULES: VitalRule[] = [
  { name: 'Systolic BP', aliases: ['systolic blood pressure', 'systolic bp', 'systolic', 'sbp'], unit: 'mmHg', low: 90, high: 140, confidence: 0.8 },
  { name: 'Diastolic BP', aliases: ['diastolic blood pressure', 'diastolic bp', 'diastolic', 'dbp'], unit: 'mmHg', low: 60, high: 90, confidence: 0.8 },
  { name: 'Pulse', aliases: ['pulse rate', 'heart rate', 'pulse', 'hr'], unit: 'bpm', low: 60, high: 100, confidence: 0.8 },
  { name: 'Temperature', aliases: ['temperature', 'temp'], unit: '°C', low: 36.1, high: 37.2, confidence: 0.7 },
  { name: 'SpO2', aliases: ['oxygen saturation', 'spo2', 'sao2', 'o2 saturation'], unit: '%', low: 95, high: 100, confidence: 0.8 },
  { name: 'Respiratory Rate', aliases: ['respiratory rate', 'breathing rate', 'rr'], unit: '/min', low: 12, high: 20, confidence: 0.55 },
]

const LAB_RULES = [
  { name: 'Haemoglobin', aliases: ['haemoglobin', 'hemoglobin', 'hb'], unit: 'g/dL', confidence: 0.95 },
  { name: 'WBC Count', aliases: ['white blood cell count', 'wbc count', 'wbc'], unit: '10^3/µL', confidence: 0.8 },
  { name: 'Platelet Count', aliases: ['platelet count', 'platelets'], unit: '10^3/µL', confidence: 0.85 },
  { name: 'Fasting Blood Glucose', aliases: ['fasting blood glucose', 'fasting glucose', 'blood glucose'], unit: 'mg/dL', confidence: 0.85 },
  { name: 'Total Cholesterol', aliases: ['total cholesterol', 'cholesterol'], unit: 'mg/dL', confidence: 0.85 },
] as const

type ParsedReportResult = ParsedReport & { parsed: ParsedReport; detectedLabFormat: string | null }

function flagFor(value: number, low: number, high: number): ValueFlag {
  if (value < low) return 'low'
  if (value > high) return 'high'
  return 'normal'
}

function confidenceFor(base: number, ocr?: ReportOcrMeta): number {
  return Math.round(base * (ocr?.engine === 'tesseract' ? Math.max(0, Math.min(100, ocr.confidence)) / 100 : 1) * 100) / 100
}

export function detectLanguage(text: string): ReportLanguage {
  if (text.trim().length <= 2) return 'Unknown'
  const hindi = (text.match(/[\u0900-\u097f]/g) ?? []).length
  const odia = (text.match(/[\u0b00-\u0b7f]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  const total = hindi + odia + latin
  if (total === 0) return 'Unknown'
  const scripts = [hindi, odia, latin].filter((count) => count > total * 0.15).length
  if (scripts > 1) return 'Mixed'
  if (hindi > odia && hindi > latin) return 'Hindi'
  if (odia > hindi && odia > latin) return 'Odia'
  return latin > 0 ? 'English' : 'Unknown'
}

const REPORT_TYPE_KEYWORDS: Array<{ type: ReportType; patterns: RegExp[] }> = [
  { type: 'discharge', patterns: [/\bdischarge summary\b/i, /\bdischarge advice\b/i] },
  { type: 'prescription', patterns: [/\brx\b/i, /\bprescription\b/i, /\bdosage\b/i] },
  { type: 'imaging', patterns: [/\bx[- ]?ray\b/i, /\bultrasound\b/i, /\bmri\b/i, /\bct scan\b/i, /\bpa view\b/i] },
  { type: 'vaccination', patterns: [/\bvaccin(?:e|ation)\b/i, /\bimmuni[sz]ation\b/i, /\bbcg\b/i] },
  { type: 'lab', patterns: [/\bcbc\b/i, /\blab(?:oratory)? report\b/i, /\blaboratory\b|\bblood test\b|\btest report\b/i, /\bhaemoglobin\b|\bhemoglobin\b/i, /\bplatelet count\b/i, /\bglucose\b/i] },
  { type: 'vitals', patterns: [/\bbp\b|\bblood pressure\b/i, /\bpulse\b|\bheart rate\b/i, /\bspo2\b|\boxygen saturation\b/i, /\btemperature\b/i, /\brespiratory rate\b/i] },
]

export function reportTypeKeywordHits(text: string): number {
  return REPORT_TYPE_KEYWORDS.reduce((total, group) => total + (group.patterns.some((pattern) => pattern.test(text)) ? 1 : 0), 0)
}

export function detectReportType(text: string): ReportType {
  for (const { type, patterns } of REPORT_TYPE_KEYWORDS) {
    if (patterns.some((pattern) => pattern.test(text))) return type
  }
  return 'other'
}

export function parseReportDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/)
  if (numeric) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    const month = first > 12 ? second : second > 12 ? first : second
    const day = first > 12 ? first : second > 12 ? second : first
    return makeDate(Number(numeric[3]), month, day)
  }

  const named = text.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-,\s]+(20\d{2})\b/)
  if (!named) return null
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const month = monthNames.findIndex((name) => named[2].toLowerCase().startsWith(name)) + 1
  return month ? makeDate(Number(named[3]), month, Number(named[1])) : null
}

function makeDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null
}

function extractLabValues(text: string, ocr?: ReportOcrMeta): ParsedLabValue[] {
  const results: ParsedLabValue[] = []
  for (const rule of LAB_RULES) {
    const aliases = [...rule.aliases].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')
    const expression = new RegExp(`(?:^|[^\\w])(?:${aliases})\\s*[:=]?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*([^\\d\\s]+)?(?:\\s+([0-9]+(?:\\.[0-9]+)?\\s*[-–]\\s*[0-9]+(?:\\.[0-9]+)?))?`, 'i')
    for (const line of text.split(/\r?\n/)) {
      const match = expression.exec(line)
      if (!match) continue
      const value = Number(match[1].replace(',', '.'))
      if (!Number.isFinite(value)) continue
      const tail = line.slice((match.index ?? 0) + match[0].length)
      const referenceRange = (match[3] ?? tail.match(/\b([0-9]+(?:\.[0-9]+)?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?)\b/)?.[1])?.replace(/\s+/g, '') ?? null
      const rangeValues = referenceRange?.split(/[-–]/).map(Number)
      results.push({
        name: rule.name,
        value,
        unit: match[2] ?? rule.unit,
        referenceRange,
        flag: rangeValues?.length === 2 ? flagFor(value, rangeValues[0], rangeValues[1]) : 'unknown',
        confidence: confidenceFor(rule.confidence, ocr),
      })
      break
    }
  }
  return results
}

function extractVitals(text: string, ocr?: ReportOcrMeta): ParsedVital[] {
  const results: ParsedVital[] = []
  const lines = text.split(/\r?\n/)
  const bp = /\b(?:bp|blood pressure)\b\s*[:=]?\s*(\d{2,3})\s*\/\s*(\d{2,3})\b/i
  for (const line of lines) {
    const bpMatch = bp.exec(line)
    if (bpMatch) {
      results.push(makeVital(VITAL_RULES[0], Number(bpMatch[1]), 'mmHg', ocr), makeVital(VITAL_RULES[1], Number(bpMatch[2]), 'mmHg', ocr))
    }
    for (const rule of VITAL_RULES.slice(2)) {
      const aliases = [...rule.aliases].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')
      const match = new RegExp(`(?:^|[^\\w])(?:${aliases})\\s*[:=]?\\s*(-?\\d+(?:\\.\\d+)?)\\s*([a-zA-Z°/%]+)?`, 'i').exec(line)
      if (!match) continue
      const value = Number(match[1])
      const unit = rule.name === 'Respiratory Rate' ? rule.unit : match[2] ?? rule.unit
      if (!Number.isFinite(value) || results.some((vital) => vital.name === rule.name)) continue
      results.push(makeVital(rule, value, unit, ocr))
    }
  }
  return results
}

function makeVital(rule: VitalRule, value: number, unit: string, ocr?: ReportOcrMeta): ParsedVital {
  const fahrenheit = rule.name === 'Temperature' && /^f(?:ahrenheit)?$/i.test(unit)
  const low = fahrenheit ? 97 : rule.low
  const high = fahrenheit ? 99.5 : rule.high
  return {
    name: rule.name,
    value,
    unit,
    flag: flagFor(value, low, high),
    confidence: confidenceFor(rule.confidence, ocr),
    recordedAt: null,
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseReport(text: string, options: { ocr?: ReportOcrMeta } = {}): ParsedReportResult {
  const detectedLabFormat = detectLabFormat(text)
  const type = detectReportType(text)
  const labValues = extractLabValues(text, options.ocr)
  const vitals = extractVitals(text, options.ocr)
  const diagnosticPresent = findDiagnosticLanguage(text).length > 0
  const findings = text.split(/\r?\n/)
    .filter((line) => /^\s*(?:impression|finding|findings|observation)\s*:/i.test(line))
    .map((line) => enforceNonDiagnostic(line.replace(/^\s*(?:impression|finding|findings|observation)\s*:\s*/i, '').trim()))
    .filter(Boolean)
  const warnings: string[] = []
  if (diagnosticPresent) warnings.push('Diagnostic or treatment phrasing was neutralised by the non-diagnostic policy.')
  if (type === 'lab' && labValues.length === 0) warnings.push('No known lab values could be extracted; verify the report manually.')
  if (options.ocr?.engine === 'tesseract' && options.ocr.confidence < 70) warnings.push('OCR confidence is low; verify every extracted value against the original.')
  const parsed: ParsedReport = {
    type,
    language: detectLanguage(text),
    reportDate: parseReportDate(text),
    labValues,
    vitals,
    findings,
    warnings,
  }
  return { ...parsed, parsed, detectedLabFormat }
}