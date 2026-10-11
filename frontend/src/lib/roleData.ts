import type { CaseRecord, Role } from '../types'
import { urgencyOf } from './format'

/**
 * Patients only ever see cases they reported (surrogate id + self reporter).
 * Clinical/admin roles see the whole facility registry.
 */
export function visibleCasesForRole(role: Role, cases: CaseRecord[]): CaseRecord[] {
  if (role !== 'patient') return cases
  return cases.filter((c) => c.reporter.startsWith('Patient'))
}

export interface RoleCounts {
  total: number
  awaitingNurse: number
  awaitingDoctor: number
  reviewed: number
  closed: number
  /** Open cases = not closed. */
  active: number
  /** Cases currently waiting on a human (nurse or doctor). */
  open: number
  urgent: number
  prompt: number
  routine: number
  /** Referrals prepared but not yet approved / handed off. */
  pendingReferrals: number
  /** Urgent cases still awaiting review — the facility "at-risk" figure. */
  overdue: number
}

export function roleCounts(cases: CaseRecord[]): RoleCounts {
  const awaitingNurse = cases.filter((c) => c.reviewStatus === 'awaiting-nurse').length
  const awaitingDoctor = cases.filter((c) => c.reviewStatus === 'awaiting-doctor').length
  const reviewed = cases.filter((c) => c.reviewStatus === 'reviewed').length
  const closed = cases.filter((c) => c.reviewStatus === 'closed').length
  let urgent = 0
  let prompt = 0
  let routine = 0
  let overdue = 0
  for (const c of cases) {
    const u = urgencyOf(c)
    if (u === 'urgent') urgent += 1
    else if (u === 'prompt') prompt += 1
    else routine += 1
    const open = c.reviewStatus === 'awaiting-nurse' || c.reviewStatus === 'awaiting-doctor'
    if (open && u === 'urgent') overdue += 1
  }
  const pendingReferrals = cases.filter(
    (c) => c.referral && (c.referral.status === 'draft' || c.referral.status === 'pending-approval'),
  ).length
  return {
    total: cases.length,
    awaitingNurse,
    awaitingDoctor,
    reviewed,
    closed,
    active: cases.length - closed,
    open: awaitingNurse + awaitingDoctor,
    urgent,
    prompt,
    routine,
    pendingReferrals,
    overdue,
  }
}

/** Role-appropriate text for the header subtitle under the greeting. */
export function queueSummaryText(role: Role, counts: RoleCounts): string {
  switch (role) {
    case 'nurse': {
      const n = counts.awaitingNurse
      return n === 0 ? 'No drafts waiting to verify' : `${n} draft${n === 1 ? '' : 's'} to verify`
    }
    case 'doctor': {
      const n = counts.awaitingDoctor
      return n === 0 ? 'No cases awaiting your approval' : `${n} case${n === 1 ? '' : 's'} awaiting approval`
    }
    case 'admin':
    case 'facility-admin':
    case 'system-admin': {
      return `${counts.open} open · ${counts.overdue} overdue`
    }
    case 'patient':
    default: {
      if (counts.open > 0) return `Your intake is being reviewed (${counts.open} open)`
      if (counts.reviewed > 0) return 'Your recent intake has been reviewed'
      return 'No active intake — start one anytime'
    }
  }
}
