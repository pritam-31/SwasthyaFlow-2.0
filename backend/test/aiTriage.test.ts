import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPayloadFromSession,
  fallbackSeverity,
} from '../src/services/aiTriageService'
import type { ExtractedReport, ExtractedVital, PatientSession } from '../src/types'

function vital(name: string, value: number, unit: string): ExtractedVital {
  return { id: `${name}-${value}`, reportId: 'rep-1', name, value, unit, flag: 'high', confidence: 1, recordedAt: null }
}

function report(overrides: Partial<ExtractedReport> = {}): ExtractedReport {
  const now = new Date().toISOString()
  return {
    id: 'rep-1',
    sessionId: 'sess-ai',
    patientId: 'PT-AI',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    source: 'pdf',
    type: 'lab',
    language: 'English',
    reportDate: null,
    status: 'verified',
    redactedText: '',
    anonymization: { redactedCount: 0, redactions: [] },
    labValues: [],
    vitals: [],
    findings: [],
    warnings: [],
    ocr: { engine: 'pdf-text', confidence: 100, pages: 1 },
    disclaimer: 'non-diagnostic',
    reviewedBy: null,
    reviewedByRole: null,
    reviewNote: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeSession(overrides: Partial<PatientSession> = {}): PatientSession {
  const now = new Date().toISOString()
  return {
    id: 'sess-ai',
    patientId: 'PT-AI',
    language: 'Hindi',
    ageBand: '40-59',
    sex: 'Male',
    intakePoint: 'OPD',
    facility: 'Test Facility',
    facilityId: 'facility-test',
    displayText: 'redacted text with diabetes mention',
    anonymization: { redactedCount: 0, redactions: [] },
    reports: [],
    visuals: [],
    note: null,
    overrides: [],
    referral: null,
    status: 'ready',
    ownerId: 'usr-1',
    createdBy: 'Tester',
    createdByRole: 'nurse',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('aiTriageService.buildPayloadFromSession', () => {
  it('maps session demographics to the AI contract', () => {
    const payload = buildPayloadFromSession(makeSession())
    assert.equal(payload.patient_id, 'PT-AI')
    assert.equal(payload.age, 49)
    assert.equal(payload.gender, 'male')
    assert.equal(payload.symptoms_language, 'hi')
    assert.equal(payload.session_id, 'sess-ai')
  })

  it('extracts vitals and labs from reports', () => {
    const session = makeSession({
      reports: [
        report({
          vitals: [vital('SpO2', 88, '%'), vital('Systolic BP', 180, 'mmHg')],
          labValues: [
            { id: 'l1', reportId: 'rep-1', name: 'Troponin', value: 0.9, unit: 'ng/mL', referenceRange: null, flag: 'high', confidence: 1 },
          ],
        }),
      ],
    })
    const payload = buildPayloadFromSession(session)
    assert.equal(payload.vitals.spo2, 88)
    assert.equal(payload.vitals.bp_systolic, 180)
    assert.equal(payload.lab_reports['troponin'], 0.9)
  })

  it('derives history keywords from the narrative', () => {
    const payload = buildPayloadFromSession(makeSession({ displayText: 'diabetes and smoker, also hypertension' }))
    assert.ok(payload.medical_history.includes('diabetes'))
    assert.ok(payload.medical_history.includes('smoker'))
    assert.ok(payload.medical_history.includes('hypertension'))
  })

  it('handles unknown age band gracefully', () => {
    const payload = buildPayloadFromSession(makeSession({ ageBand: 'Unknown' }))
    assert.equal(payload.age, null)
  })
})

describe('aiTriageService.fallbackSeverity', () => {
  it('produces a labelled fallback result with a triage level', () => {
    const session = makeSession({
      note: {
        structuredNote: { chiefComplaint: 'x', history: 'y', vitals: 'z' },
        observations: [],
        urgencyFlags: [
          { id: 'f1', label: 'Chest pain', severity: 'red', reason: 'workflow', ruleId: 'URG-01' },
          { id: 'f2', label: 'Breathlessness', severity: 'red', reason: 'workflow', ruleId: 'URG-02' },
        ],
        missingInformation: [],
        followUpQuestions: [],
        riskScore: 'High',
        status: 'ai-draft',
        generatedAt: new Date().toISOString(),
        disclaimer: 'non-diagnostic',
      },
    })
    const result = fallbackSeverity(session, 'ai-service-not-configured')
    assert.equal(result.source, 'fallback')
    assert.ok(['LOW', 'MODERATE', 'URGENT', 'CRITICAL'].includes(result.triageLevel))
    assert.equal(result.fallbacksUsed[0], 'ai-service-not-configured')
    assert.ok(result.disclaimer.length > 0)
  })
})
