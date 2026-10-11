import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  bandForValue,
  buildSessionConfidence,
  clampConfidence,
  computeLanguageConfidence,
  computeMissingInfoConfidence,
  computeOcrConfidence,
  computeReportTypeConfidence,
  computeTriageNoteConfidence,
  computeUrgencyConfidence,
} from '../src/services/confidenceService'
import { validateThresholds } from '../src/services/confidencePolicyService'
import type {
  ExtractedLabValue,
  ExtractedReport,
  PatientSession,
  UrgencyFlag,
} from '../src/types'

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function flag(label: string, reason: string): UrgencyFlag {
  return { id: `flag-${label}`, label, severity: 'red', reason, ruleId: 'URG-01', language: 'en' } as UrgencyFlag
}

function lowConfidenceLab(): ExtractedLabValue {
  return {
    id: 'lab-1',
    reportId: 'rep-1',
    name: 'Creatinine',
    value: 1.2,
    unit: 'mg/dL',
    referenceRange: '0.6-1.3',
    flag: 'normal',
    confidence: 0.3,
  }
}

function makeReport(): ExtractedReport {
  const at = new Date().toISOString()
  return {
    id: 'rep-1',
    sessionId: 'sess-conf',
    patientId: 'PT-1',
    fileName: 'lab.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    source: 'pdf',
    type: 'lab',
    language: 'English',
    reportDate: null,
    status: 'pending-review',
    redactedText: 'laboratory blood test report',
    anonymization: { redactedCount: 0, redactions: [] },
    labValues: [lowConfidenceLab()],
    vitals: [],
    findings: [],
    warnings: [],
    ocr: { engine: 'tesseract', confidence: 55, pages: 1 },
    disclaimer: 'non-diagnostic',
    reviewedBy: null,
    reviewedByRole: null,
    reviewNote: null,
    rejectionReason: null,
    createdAt: at,
    updatedAt: at,
  }
}

function makeSession(): PatientSession {
  const at = new Date().toISOString()
  return {
    id: 'sess-conf',
    patientId: 'PT-1',
    language: 'English',
    ageBand: '18-39',
    sex: 'Not stated',
    intakePoint: 'OPD',
    facility: 'Clinic',
    facilityId: 'facility-default',
    displayText: 'chest pain since two days bp 120/80',
    anonymization: { redactedCount: 0, redactions: [] },
    reports: [makeReport()],
    visuals: [],
    note: {
      structuredNote: { chiefComplaint: 'chest pain', history: 'since two days', vitals: 'Not provided.' },
      observations: ['chest pain'],
      urgencyFlags: [flag('Chest pain reported', 'Chest pain is a red-flag signal.')],
      missingInformation: [],
      followUpQuestions: [],
      riskScore: 'High',
      status: 'ai-draft',
      language: 'en',
      generatedAt: at,
      disclaimer: 'non-diagnostic',
    },
    overrides: [],
    referral: null,
    status: 'ready',
    ownerId: 'u1',
    createdBy: 'nurse',
    createdByRole: 'nurse',
    createdAt: at,
    updatedAt: at,
  }
}

/* ------------------------------------------------------------------ */
/*  Bands + clamping                                                   */
/* ------------------------------------------------------------------ */

describe('confidence bands and clamping', () => {
  it('maps values to the four bands at the documented edges', () => {
    assert.equal(bandForValue(0.95), 'high')
    assert.equal(bandForValue(0.85), 'high')
    assert.equal(bandForValue(0.84), 'medium')
    assert.equal(bandForValue(0.6), 'medium')
    assert.equal(bandForValue(0.59), 'low')
    assert.equal(bandForValue(0.4), 'low')
    assert.equal(bandForValue(0.39), 'very-low')
    assert.equal(bandForValue(0.05), 'very-low')
  })

  it('clamps every value into [0.05, 0.99]', () => {
    assert.equal(clampConfidence(-5), 0.05)
    assert.equal(clampConfidence(0), 0.05)
    assert.equal(clampConfidence(1.5), 0.99)
    assert.equal(clampConfidence(0.7), 0.7)
  })
})

/* ------------------------------------------------------------------ */
/*  Layer scoring                                                      */
/* ------------------------------------------------------------------ */

describe('urgency confidence', () => {
  const sentence = 'the patient has chest pain'

  it('scores a direct (non-transliterated) match at the 0.7 base', () => {
    const score = computeUrgencyConfidence({ flag: flag('Chest pain', 'r'), sentence, viaLatin: false, corroborated: false })
    assert.equal(score.value, 0.7)
    assert.equal(score.band, 'medium')
  })

  it('scores a transliterated (latin) match lower than a direct match', () => {
    const latin = computeUrgencyConfidence({ flag: flag('Chest pain', 'r'), sentence, viaLatin: true, corroborated: false })
    assert.equal(latin.value, 0.5)
    assert.equal(latin.band, 'low')
  })

  it('adds corroboration and applies negation / hypothetical penalties', () => {
    const corroborated = computeUrgencyConfidence({ flag: flag('Chest pain', 'r'), sentence, viaLatin: false, corroborated: true })
    assert.ok(Math.abs(corroborated.value - 0.75) < 1e-9)
    const negated = computeUrgencyConfidence({ flag: flag('Chest pain', 'r'), sentence: 'no chest pain', viaLatin: false, corroborated: false })
    assert.ok(Math.abs(negated.value - 0.55) < 1e-9)
    const hypothetical = computeUrgencyConfidence({ flag: flag('Chest pain', 'r'), sentence: 'if chest pain develops', viaLatin: false, corroborated: false })
    assert.ok(Math.abs(hypothetical.value - 0.6) < 1e-9)
  })

  it('always produces a non-diagnostic, localised explanation', () => {
    const score = computeUrgencyConfidence({ flag: flag('Chest pain', 'r'), sentence, viaLatin: false, corroborated: false })
    assert.equal(score.explanation.language, 'en')
    assert.ok(score.explanation.summary.length > 0)
    assert.ok(score.explanation.signals.length > 0)
    assert.match(score.explanation.summary, /workflow label/i)
    // The non-diagnostic guard strips the literal word "diagnosis" from stored text.
    assert.doesNotMatch(score.explanation.summary, /\bdiagnos/i)
  })
})

describe('missing-information confidence', () => {
  it('starts at 0.85 and adjusts for multi-pattern and short text', () => {
    const base = computeMissingInfoConfidence({ patternCount: 1, narrativeLength: 120, language: 'en' })
    assert.ok(Math.abs(base.value - 0.85) < 1e-9)
    const multi = computeMissingInfoConfidence({ patternCount: 3, narrativeLength: 120, language: 'en' })
    assert.ok(Math.abs(multi.value - 0.9) < 1e-9)
    const short = computeMissingInfoConfidence({ patternCount: 1, narrativeLength: 8, language: 'en' })
    assert.ok(Math.abs(short.value - 0.75) < 1e-9)
  })
})

describe('report-type confidence', () => {
  it('scales with the number of matched keyword groups', () => {
    const many = computeReportTypeConfidence('discharge summary prescription laboratory blood test report', 'en')
    assert.equal(many.value, 0.9)
    const none = computeReportTypeConfidence('random unrelated text', 'en')
    assert.equal(none.value, 0.3)
  })
})

describe('language confidence', () => {
  it('rewards a strong single-script ratio and softens mixed scripts', () => {
    const strong = computeLanguageConfidence({ code: 'en', confidence: 0.96, script: 'latin', isMixed: false })
    assert.ok(Math.abs(strong.value - 0.95) < 1e-9)
    const mixed = computeLanguageConfidence({ code: 'hi', confidence: 0.96, script: 'mixed', isMixed: true })
    assert.ok(Math.abs(mixed.value - 0.9) < 1e-9)
  })
})

describe('OCR confidence', () => {
  it('returns full confidence when nothing was read and scales OCR otherwise', () => {
    const none = computeOcrConfidence({ engine: 'nothing', confidence: 0, pages: 0 })
    assert.equal(none.value, 0.99)
    const ocr = computeOcrConfidence({ engine: 'tesseract', confidence: 80, pages: 1 })
    assert.ok(Math.abs(ocr.value - 0.8) < 1e-9)
    const pdf = computeOcrConfidence({ engine: 'pdf-text', confidence: 100, pages: 1 })
    assert.equal(pdf.value, 0.95)
  })
})

describe('triage-note aggregate', () => {
  it('computes the weighted mean across the five layers', () => {
    const score = computeTriageNoteConfidence({ urgency: 0.5, missing: 1, labs: 1, vitals: 1, timeline: 1, language: 'en' })
    assert.ok(Math.abs(score.value - 0.8) < 1e-9)
    assert.equal(score.band, 'medium')
  })
})

/* ------------------------------------------------------------------ */
/*  Session assembly                                                   */
/* ------------------------------------------------------------------ */

describe('buildSessionConfidence', () => {
  it('surfaces a low-confidence lab as a reviewable item', () => {
    const confidence = buildSessionConfidence(makeSession(), DEFAULT_CONFIDENCE_THRESHOLDS)
    assert.equal(confidence.sessionId, 'sess-conf')
    assert.ok(confidence.aggregate.value > 0 && confidence.aggregate.value <= 0.99)
    assert.ok(confidence.items.some((item) => item.itemType === 'lab' && item.itemId === 'lab-1'))
    assert.ok(typeof confidence.limitingFactor === 'string' && confidence.limitingFactor.length > 0)
    for (const item of confidence.items) {
      assert.ok(item.value < DEFAULT_CONFIDENCE_THRESHOLDS.lowConfidenceThreshold)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  Policy validation                                                  */
/* ------------------------------------------------------------------ */

describe('confidence threshold validation', () => {
  it('accepts a well-ordered, in-bounds threshold set', () => {
    const result = validateThresholds({ lowConfidenceThreshold: 0.6, veryLowConfidenceThreshold: 0.4, aggregateAlertThreshold: 0.6 })
    assert.equal(result.ok, true)
    assert.equal(result.errors.length, 0)
  })

  it('rejects inverted bands (low must exceed very-low)', () => {
    const result = validateThresholds({ lowConfidenceThreshold: 0.4, veryLowConfidenceThreshold: 0.6, aggregateAlertThreshold: 0.6 })
    assert.equal(result.ok, false)
    assert.ok(result.errors.includes('confidence.low-must-exceed-very-low'))
  })

  it('rejects equal bands and out-of-bounds values', () => {
    const equal = validateThresholds({ lowConfidenceThreshold: 0.5, veryLowConfidenceThreshold: 0.5, aggregateAlertThreshold: 0.6 })
    assert.equal(equal.ok, false)
    const out = validateThresholds({ lowConfidenceThreshold: 1.5, veryLowConfidenceThreshold: 0.4, aggregateAlertThreshold: 0.6 })
    assert.equal(out.ok, false)
    assert.ok(out.errors.includes('confidence.low-out-of-bounds'))
  })
})
