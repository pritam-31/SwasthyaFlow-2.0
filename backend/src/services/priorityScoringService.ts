import { enforceNonDiagnostic } from './reportParser'
import { NON_DIAGNOSTIC_DISCLAIMER } from './nonDiagnostic'
import { computePriorityComponentConfidence } from './confidenceService'
import type {
  AgeBand,
  ExtractedReport,
  ExtractedVital,
  PatientSession,
  PriorityBand,
  PriorityBreakdown,
  PriorityComponent,
  PriorityComponentKey,
  SupportedLanguage,
  VisualRecord,
} from '../types'

/**
 * Deterministic, transparent, non-diagnostic priority scoring (P1-11).
 *
 * Nothing here diagnoses, prescribes, predicts an outcome or learns from data:
 * every point is the direct consequence of an observable input, and every
 * component returns the human-readable reasons behind its points. Language for
 * the reason strings follows the session's intake language.
 */

/* ------------------------------------------------------------------ */
/*  Weights (single source of truth)                                   */
/* ------------------------------------------------------------------ */

const URGENCY_MAX = 40
const VITALS_MAX = 20
const AGE_MAX = 18
const WAIT_MAX = 20
const LABS_MAX = 15
const VISUAL_MAX = 12
const COMPLETENESS_MIN = -10

export const PRIORITY_BAND_THRESHOLDS: Array<{ band: PriorityBand; min: number }> = [
  { band: 'critical', min: 80 },
  { band: 'high', min: 60 },
  { band: 'medium', min: 40 },
  { band: 'low', min: 20 },
  { band: 'routine', min: 0 },
]

export const AGE_BAND_POINTS: Record<AgeBand, number> = {
  '0-17': 18,
  '60+': 15,
  '40-59': 8,
  '18-39': 0,
  Unknown: 5,
}

export function bandForScore(score: number): PriorityBand {
  for (const { band, min } of PRIORITY_BAND_THRESHOLDS) {
    if (score >= min) return band
  }
  return 'routine'
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

/** Mean of the underlying per-item confidences; 1.0 when there are none. */
function meanOf(values: number[]): number {
  if (values.length === 0) return 1
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function languageCodeOf(language: PatientSession['language']): SupportedLanguage {
  return language === 'Hindi' ? 'hi' : language === 'Odia' ? 'or' : 'en'
}

/* ------------------------------------------------------------------ */
/*  Localised strings                                                  */
/* ------------------------------------------------------------------ */

interface PriorityStrings {
  language: SupportedLanguage
  component: Record<PriorityComponentKey, string>
  urgencyRed: (label: string) => string
  urgencyAmber: (label: string) => string
  noUrgency: string
  vital: (name: string, value: string) => string
  noVitals: string
  age: (band: string) => string
  ageUnknown: string
  wait: (minutes: number) => string
  lab: (name: string, flag: string) => string
  noLabs: string
  visual: (label: string) => string
  noVisual: string
  missing: (count: number) => string
  complete: string
}

const STRINGS: Record<SupportedLanguage, PriorityStrings> = {
  en: {
    language: 'en',
    component: {
      urgency: 'Urgency signals',
      vitals: 'Vital signs',
      age: 'Age band',
      wait: 'Wait time',
      labs: 'Lab values',
      visual: 'Visual findings',
      completeness: 'Data completeness',
    },
    urgencyRed: (label) => `Red urgency flag: ${label}.`,
    urgencyAmber: (label) => `Amber urgency flag: ${label}.`,
    noUrgency: 'No urgency flags were recorded.',
    vital: (name, value) => `Abnormal vital reading: ${name} ${value}.`,
    noVitals: 'No vital-sign readings were available.',
    age: (band) => `Age band ${band}.`,
    ageUnknown: 'Age band was not provided.',
    wait: (minutes) => `Waiting ${minutes} minute(s).`,
    lab: (name, flag) => `Lab value flagged ${flag}: ${name}.`,
    noLabs: 'No abnormal lab values were available.',
    visual: (label) => `Visual finding recorded: ${label}.`,
    noVisual: 'No visual findings were recorded.',
    missing: (count) => `${count} unresolved missing-information item(s).`,
    complete: 'No missing information is outstanding.',
  },
  hi: {
    language: 'hi',
    component: {
      urgency: 'प्राथमिकता संकेत',
      vitals: 'जीवन-संकेत',
      age: 'आयु वर्ग',
      wait: 'प्रतीक्षा समय',
      labs: 'प्रयोगशाला मान',
      visual: 'दृश्य निष्कर्ष',
      completeness: 'जानकारी की पूर्णता',
    },
    urgencyRed: (label) => `लाल प्राथमिकता संकेत: ${label}।`,
    urgencyAmber: (label) => `पीला प्राथमिकता संकेत: ${label}।`,
    noUrgency: 'कोई प्राथमिकता संकेत दर्ज नहीं है।',
    vital: (name, value) => `असामान्य जीवन-संकेत माप: ${name} ${value}।`,
    noVitals: 'कोई जीवन-संकेत माप उपलब्ध नहीं था।',
    age: (band) => `आयु वर्ग ${band}।`,
    ageUnknown: 'आयु वर्ग नहीं दिया गया।',
    wait: (minutes) => `${minutes} मिनट की प्रतीक्षा।`,
    lab: (name, flag) => `प्रयोगशाला मान ${flag}: ${name}।`,
    noLabs: 'कोई असामान्य प्रयोगशाला मान उपलब्ध नहीं था।',
    visual: (label) => `दृश्य निष्कर्ष दर्ज: ${label}।`,
    noVisual: 'कोई दृश्य निष्कर्ष दर्ज नहीं है।',
    missing: (count) => `${count} अनसुलझी अनुपलब्ध जानकारी।`,
    complete: 'कोई अनुपलब्ध जानकारी शेष नहीं है।',
  },
  or: {
    language: 'or',
    component: {
      urgency: 'ପ୍ରାଥମିକତା ସଙ୍କେତ',
      vitals: 'ଜୀବନ-ଚିହ୍ନ',
      age: 'ବୟସ ବର୍ଗ',
      wait: 'ଅପେକ୍ଷା ସମୟ',
      labs: 'ଲାବୋରେଟୋରୀ ମୂଲ୍ୟ',
      visual: 'ଦୃଶ୍ୟ ପାଠ୍ୟ',
      completeness: 'ସୂଚନାର ସମ୍ପୂର୍ଣ୍ଣତା',
    },
    urgencyRed: (label) => `ଲାଲ ପ୍ରାଥମିକତା ସଙ୍କେତ: ${label}।`,
    urgencyAmber: (label) => `ହଳଦିଆ ପ୍ରାଥମିକତା ସଙ୍କେତ: ${label}।`,
    noUrgency: 'କୌଣସି ପ୍ରାଥମିକତା ସଙ୍କେତ ଲିପିବଦ୍ଧ ହୋଇନାହିଁ।',
    vital: (name, value) => `ଅସ୍ୱାଭାବିକ ଜୀବନ-ଚିହ୍ନ ମାପ: ${name} ${value}।`,
    noVitals: 'କୌଣସି ଜୀବନ-ଚିହ୍ନ ମାପ ଉପଲବ୍ଧ ନଥିଲା।',
    age: (band) => `ବୟସ ବର୍ଗ ${band}।`,
    ageUnknown: 'ବୟସ ବର୍ଗ ଦିଆଯାଇନାହିଁ।',
    wait: (minutes) => `${minutes} ମିନିଟ ଅପେକ୍ଷା।`,
    lab: (name, flag) => `ଲାବୋରେଟୋରୀ ମୂଲ୍ୟ ${flag}: ${name}।`,
    noLabs: 'କୌଣସି ଅସ୍ୱାଭାବିକ ଲାବୋରେଟୋରୀ ମୂଲ୍ୟ ଉପଲବ୍ଧ ନଥିଲା।',
    visual: (label) => `ଦୃଶ୍ୟ ପାଠ୍ୟ ଲିପିବଦ୍ଧ: ${label}।`,
    noVisual: 'କୌଣସି ଦୃଶ୍ୟ ପାଠ୍ୟ ଲିପିବଦ୍ଧ ହୋଇନାହିଁ।',
    missing: (count) => `${count} ଅନିସ୍ପନ୍ନ ଅନୁପସ୍ଥିତ ସୂଚନା।`,
    complete: 'କୌଣସି ଅନୁପସ୍ଥିତ ସୂଚନା ବାକି ନାହିଁ।',
  },
}

function safeReason(text: string): string {
  return enforceNonDiagnostic(text)
}

function component(
  key: PriorityComponentKey,
  maxPoints: number,
  strings: PriorityStrings,
  points: number,
  reasons: string[],
  dataConfidence = 1,
  hasSignal = true,
): PriorityComponent {
  return {
    key,
    label: strings.component[key],
    points,
    maxPoints,
    reasons: reasons.map(safeReason),
    confidenceScore: computePriorityComponentConfidence({
      componentKey: key,
      dataConfidence,
      hasSignal,
      language: strings.language,
    }),
  }
}

/* ------------------------------------------------------------------ */
/*  A. Urgency signals                                                 */
/* ------------------------------------------------------------------ */

function scoreUrgency(session: PatientSession, s: PriorityStrings): PriorityComponent {
  const flags = session.note?.urgencyFlags ?? []
  const seen = new Set<string>()
  let redCount = 0
  let amberCount = 0
  const reasons: string[] = []
  for (const flag of flags) {
    const dedupeKey = flag.ruleId || flag.id || flag.label
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    if (flag.severity === 'red') {
      redCount += 1
      reasons.push(s.urgencyRed(flag.label))
    } else {
      amberCount += 1
      reasons.push(s.urgencyAmber(flag.label))
    }
  }
  const redPoints = Math.min(redCount * 15, URGENCY_MAX)
  let amberPoints = Math.min(amberCount * 6, 20)
  if (redCount > 0) amberPoints = Math.floor(amberPoints / 2)
  const points = Math.min(redPoints + amberPoints, URGENCY_MAX)
  if (reasons.length === 0) reasons.push(s.noUrgency)
  return component(
    'urgency',
    URGENCY_MAX,
    s,
    points,
    reasons,
    meanOf(flags.map((flag) => flag.confidenceScore?.value ?? 0.9)),
    flags.length > 0,
  )
}

/* ------------------------------------------------------------------ */
/*  B. Vital signs (latest report with vitals)                         */
/* ------------------------------------------------------------------ */

function latestReportWithVitals(reports: ExtractedReport[]): ExtractedReport | undefined {
  const withVitals = reports.filter((report) => report.vitals.length > 0)
  if (withVitals.length === 0) return undefined
  return withVitals.reduce((latest, report) => (report.createdAt > latest.createdAt ? report : latest))
}

interface VitalBand {
  test: (value: number) => boolean
  points: number
}

const VITAL_RULES: Array<{ match: RegExp; bands: VitalBand[] }> = [
  {
    match: /spo2|o2 ?sat|oxygen saturation|\bspo₂\b|saturation/i,
    bands: [
      { test: (v) => v < 90, points: 20 },
      { test: (v) => v >= 90 && v <= 93, points: 12 },
      { test: (v) => v >= 94 && v <= 95, points: 6 },
    ],
  },
  {
    match: /respiratory|\brr\b|breath|respiration/i,
    bands: [
      { test: (v) => v < 8 || v > 30, points: 15 },
      { test: (v) => (v >= 8 && v <= 11) || (v >= 25 && v <= 29), points: 8 },
    ],
  },
  {
    match: /systolic|\bsbp\b/i,
    bands: [
      { test: (v) => v < 90 || v > 180, points: 15 },
      { test: (v) => (v >= 90 && v <= 95) || (v > 140 && v <= 180), points: 8 },
    ],
  },
  {
    match: /diastolic|\bdbp\b/i,
    bands: [
      { test: (v) => v < 60 || v > 100, points: 10 },
      { test: (v) => (v >= 60 && v <= 64) || (v >= 91 && v <= 100), points: 5 },
    ],
  },
  {
    match: /temp/i,
    bands: [
      { test: (v) => v < 35 || v > 39, points: 15 },
      { test: (v) => (v >= 35 && v < 36) || (v > 37.5 && v <= 39), points: 8 },
    ],
  },
  {
    match: /heart rate|pulse|\bhr\b|heartrate/i,
    bands: [
      { test: (v) => v < 50 || v > 120, points: 10 },
      { test: (v) => v >= 111 && v <= 120, points: 5 },
    ],
  },
]

function vitalPoints(vital: ExtractedVital): number {
  for (const rule of VITAL_RULES) {
    if (!rule.match.test(vital.name)) continue
    for (const band of rule.bands) {
      if (band.test(vital.value)) return band.points
    }
  }
  return 0
}

function scoreVitals(session: PatientSession, s: PriorityStrings): PriorityComponent {
  const report = latestReportWithVitals(session.reports)
  if (!report) return component('vitals', VITALS_MAX, s, 0, [s.noVitals])
  const reasons: string[] = []
  let total = 0
  for (const vital of report.vitals) {
    const points = vitalPoints(vital)
    if (points <= 0) continue
    total += points
    reasons.push(s.vital(vital.name, `${vital.value}${vital.unit ? ` ${vital.unit}` : ''}`))
  }
  const capped = Math.min(total, VITALS_MAX)
  if (reasons.length === 0) reasons.push(s.noVitals)
  return component(
    'vitals',
    VITALS_MAX,
    s,
    capped,
    reasons,
    meanOf(report.vitals.map((vital) => vital.confidenceScore?.value ?? vital.confidence)),
    report.vitals.length > 0,
  )
}

/* ------------------------------------------------------------------ */
/*  C. Age band                                                        */
/* ------------------------------------------------------------------ */

function scoreAge(session: PatientSession, s: PriorityStrings): PriorityComponent {
  const band = session.ageBand
  const points = AGE_BAND_POINTS[band] ?? 0
  const reason = band === 'Unknown' ? s.ageUnknown : s.age(band)
  return component('age', AGE_MAX, s, points, [reason], 1, band !== 'Unknown')
}

/* ------------------------------------------------------------------ */
/*  D. Wait time                                                       */
/* ------------------------------------------------------------------ */

function waitMinutesFor(session: PatientSession, now: Date): number {
  const created = Date.parse(session.createdAt)
  if (!Number.isFinite(created)) return 0
  const reference = session.status === 'accepted' ? Date.parse(session.updatedAt) : now.getTime()
  const minutes = Math.floor((reference - created) / 60000)
  return minutes > 0 ? minutes : 0
}

function waitPoints(minutes: number): number {
  if (minutes < 15) return 0
  if (minutes < 30) return 4
  if (minutes < 60) return 8
  if (minutes < 120) return 12
  return 20
}

function scoreWait(session: PatientSession, s: PriorityStrings, now: Date): { component: PriorityComponent; minutes: number } {
  const minutes = waitMinutesFor(session, now)
  const points = waitPoints(minutes)
  const waitComponent = component('wait', WAIT_MAX, s, points, [s.wait(minutes)], 1, minutes > 0)
  return { component: waitComponent, minutes }
}

/* ------------------------------------------------------------------ */
/*  E. Lab values                                                      */
/* ------------------------------------------------------------------ */

function scoreLabs(session: PatientSession, s: PriorityStrings): PriorityComponent {
  const reasons: string[] = []
  const seen = new Set<string>()
  const confidences: number[] = []
  let total = 0
  for (const report of session.reports) {
    for (const lab of report.labValues) {
      if (lab.flag !== 'high' && lab.flag !== 'low') continue
      if (seen.has(lab.name)) continue
      seen.add(lab.name)
      total += 5
      confidences.push(lab.confidenceScore?.value ?? lab.confidence)
      reasons.push(s.lab(lab.name, lab.flag))
    }
  }
  const capped = Math.min(total, LABS_MAX)
  if (reasons.length === 0) reasons.push(s.noLabs)
  return component('labs', LABS_MAX, s, capped, reasons, meanOf(confidences), confidences.length > 0)
}

/* ------------------------------------------------------------------ */
/*  F. Visual findings                                                 */
/* ------------------------------------------------------------------ */

function normalizeFeatureLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function visualFeaturePoints(label: string, value: string): number {
  const key = normalizeFeatureLabel(label)
  const normalValue = normalizeFeatureLabel(value)
  if (key.includes('bleed')) return 8
  if (key.includes('foreign')) return 6
  if (key.includes('burn') || key.includes('scald')) return 8
  if (key.includes('discharge') && normalValue.includes('pus')) return 6
  return 0
}

function scoreVisual(session: PatientSession, s: PriorityStrings): PriorityComponent {
  const reasons: string[] = []
  const seen = new Set<string>()
  const confidences: number[] = []
  let total = 0
  for (const visual of session.visuals as VisualRecord[]) {
    const extraction = visual.extraction
    if (!extraction) continue
    for (const feature of extraction.features ?? []) {
      const points = visualFeaturePoints(feature.label, feature.value)
      if (points <= 0) continue
      const dedupeKey = normalizeFeatureLabel(feature.label)
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      total += points
      confidences.push(feature.confidenceScore?.value ?? feature.confidence)
      reasons.push(s.visual(feature.label))
    }
    for (const concern of extraction.concerns ?? []) {
      const dedupeKey = `concern:${concern.ruleId || concern.id || concern.label}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      total += 2
      confidences.push(0.9)
      reasons.push(s.visual(concern.label))
    }
  }
  const capped = Math.min(total, VISUAL_MAX)
  if (reasons.length === 0) reasons.push(s.noVisual)
  return component('visual', VISUAL_MAX, s, capped, reasons, meanOf(confidences), confidences.length > 0)
}

/* ------------------------------------------------------------------ */
/*  G. Data completeness (penalty)                                     */
/* ------------------------------------------------------------------ */

function scoreCompleteness(session: PatientSession, s: PriorityStrings): PriorityComponent {
  if (!session.note) return component('completeness', COMPLETENESS_MIN, s, -10, [s.missing(3)], 1, false)
  const missing = session.note.missingInformation.length
  if (missing === 0) return component('completeness', COMPLETENESS_MIN, s, 0, [s.complete], 1, true)
  if (missing <= 2) return component('completeness', COMPLETENESS_MIN, s, -5, [s.missing(1)], 1, true)
  return component('completeness', COMPLETENESS_MIN, s, COMPLETENESS_MIN, [s.missing(3)], 1, true)
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface PriorityScoreComputation {
  breakdown: PriorityBreakdown
  score: number
  band: PriorityBand
  waitMinutes: number
  language: SupportedLanguage
}

/** Computes the transparent breakdown + raw score for one session. */
export function computePriority(session: PatientSession, now: Date = new Date()): PriorityScoreComputation {
  const language = languageCodeOf(session.language)
  const strings = STRINGS[language]

  const urgency = scoreUrgency(session, strings)
  const vitals = scoreVitals(session, strings)
  const age = scoreAge(session, strings)
  const { component: wait, minutes } = scoreWait(session, strings, now)
  const labs = scoreLabs(session, strings)
  const visual = scoreVisual(session, strings)
  const completeness = scoreCompleteness(session, strings)

  const components = [urgency, vitals, age, wait, labs, visual, completeness]
  const totalRaw = components.reduce((sum, entry) => sum + entry.points, 0)
  const totalClamped = clampScore(totalRaw)
  const breakdown: PriorityBreakdown = { components, totalRaw, totalClamped }

  return {
    breakdown,
    score: totalClamped,
    band: bandForScore(totalClamped),
    waitMinutes: minutes,
    language,
  }
}

export interface PriorityScoreComputation {
  breakdown: PriorityBreakdown
  score: number
  band: PriorityBand
  waitMinutes: number
  language: SupportedLanguage
}

export { NON_DIAGNOSTIC_DISCLAIMER }
