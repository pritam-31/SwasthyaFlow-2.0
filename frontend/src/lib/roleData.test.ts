import { describe, expect, it } from 'vitest'
import type { CaseRecord, Role, UrgencySignal } from '../types'
import { queueSummaryText, roleCounts, visibleCasesForRole } from './roleData'

const signal = (level: UrgencySignal['level']): UrgencySignal =>
  ({ id: `s-${level}`, level, label: 'signal' }) as unknown as UrgencySignal

function mkCase(overrides: Partial<CaseRecord>): CaseRecord {
  return {
    id: 'case-x',
    patientId: 'SYN-2026-001',
    language: 'English',
    mode: 'opd',
    chiefConcern: 'Fever',
    symptoms: [],
    timeline: [],
    reportedHistory: [],
    reportedMedications: [],
    missingInfo: [],
    completeness: 80,
    followUpQuestions: [],
    urgencySignals: [],
    reviewStatus: 'awaiting-nurse',
    consent: { status: 'granted', at: '10:00', purpose: ['Symptom organisation', 'Healthcare-worker review'] },
    reportIds: [],
    createdAt: '09:32',
    updatedAt: '09:32',
    reporter: 'Patient (self)',
    corrections: [],
    referral: null,
    ...overrides,
  }
}

describe('visibleCasesForRole', () => {
  const cases = [
    mkCase({ id: 'a', reporter: 'Patient (self)' }),
    mkCase({ id: 'b', reporter: 'Patient (with attendant)' }),
    mkCase({ id: 'c', reporter: 'Camp health worker' }),
    mkCase({ id: 'd', reporter: 'Industrial clinic staff' }),
  ]

  it('patients only see cases they reported', () => {
    const ids = visibleCasesForRole('patient', cases).map((c) => c.id)
    expect(ids).toEqual(['a', 'b'])
  })

  it('clinical and admin roles see the whole facility registry', () => {
    const roles: Role[] = ['nurse', 'doctor', 'admin', 'system-admin', 'facility-admin']
    for (const role of roles) {
      expect(visibleCasesForRole(role, cases)).toHaveLength(4)
    }
  })
})

describe('roleCounts', () => {
  it('counts review stages, urgency and pending referrals', () => {
    const cases = [
      mkCase({ id: '1', reviewStatus: 'awaiting-nurse', urgencySignals: [signal('urgent')] }),
      mkCase({ id: '2', reviewStatus: 'awaiting-doctor', urgencySignals: [signal('prompt')] }),
      mkCase({ id: '3', reviewStatus: 'awaiting-doctor', urgencySignals: [signal('urgent')] }),
      mkCase({ id: '4', reviewStatus: 'reviewed', urgencySignals: [signal('routine')] }),
      mkCase({ id: '5', reviewStatus: 'closed' }),
      mkCase({
        id: '6',
        reviewStatus: 'awaiting-nurse',
        referral: { id: 'r1', status: 'draft' } as CaseRecord['referral'],
      }),
      mkCase({
        id: '7',
        reviewStatus: 'reviewed',
        referral: { id: 'r2', status: 'approved' } as CaseRecord['referral'],
      }),
    ]

    const c = roleCounts(cases)
    expect(c.total).toBe(7)
    expect(c.awaitingNurse).toBe(2)
    expect(c.awaitingDoctor).toBe(2)
    expect(c.reviewed).toBe(2)
    expect(c.closed).toBe(1)
    expect(c.active).toBe(6)
    expect(c.open).toBe(4)
    // urgent over the whole set
    expect(c.urgent).toBe(2)
    expect(c.prompt).toBe(1)
    expect(c.routine).toBe(4)
    // only draft/pending-approval referrals count
    expect(c.pendingReferrals).toBe(1)
    // urgent cases still waiting on a human
    expect(c.overdue).toBe(2)
  })

  it('handles the empty registry', () => {
    const c = roleCounts([])
    expect(c).toMatchObject({
      total: 0,
      open: 0,
      urgent: 0,
      overdue: 0,
      pendingReferrals: 0,
    })
  })
})

describe('queueSummaryText', () => {
  const base = () => roleCounts([])

  it('nurse copy reflects drafts to verify', () => {
    expect(queueSummaryText('nurse', { ...base(), awaitingNurse: 0 })).toBe('No drafts waiting to verify')
    expect(queueSummaryText('nurse', { ...base(), awaitingNurse: 3 })).toBe('3 drafts to verify')
  })

  it('doctor copy reflects cases awaiting approval', () => {
    expect(queueSummaryText('doctor', { ...base(), awaitingDoctor: 0 })).toBe('No cases awaiting your approval')
    expect(queueSummaryText('doctor', { ...base(), awaitingDoctor: 1 })).toBe('1 case awaiting approval')
  })

  it('admin copy shows open and overdue', () => {
    expect(queueSummaryText('admin', { ...base(), open: 4, overdue: 2 })).toBe('4 open · 2 overdue')
    expect(queueSummaryText('system-admin', { ...base(), open: 0, overdue: 0 })).toBe('0 open · 0 overdue')
  })

  it('patient copy reflects the intake lifecycle', () => {
    expect(queueSummaryText('patient', { ...base(), open: 2 })).toBe('Your intake is being reviewed (2 open)')
    expect(queueSummaryText('patient', { ...base(), reviewed: 1 })).toBe('Your recent intake has been reviewed')
    expect(queueSummaryText('patient', base())).toBe('No active intake — start one anytime')
  })
})