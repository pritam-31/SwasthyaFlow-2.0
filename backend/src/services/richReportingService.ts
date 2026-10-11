import { NON_DIAGNOSTIC_DISCLAIMER } from './nonDiagnostic'
import { computePriority, languageCodeOf } from './priorityScoringService'
import { getSlaConfig, slaMinutesFor } from './slaService'
import type {
  CaseSummaryOnePager,
  PatientSession,
  PriorityBand,
  ShiftHandoverCase,
  ShiftHandoverFilter,
  ShiftHandoverReport,
  SlaBreachNotification,
  SupportedLanguage,
} from '../types'

/**
 * Rich read-only reporting projections (P2-18 items V / U / W).
 *
 * These are pure functions over already-stored sessions: the case one-pager,
 * the shift-handover report and the in-app SLA breach notifications. Nothing is
 * recomputed clinically — priority is the same transparent, non-diagnostic score
 * the queue already uses, and every projection carries the disclaimer.
 */

export interface CaseSummaryOptions {
  generatedBy: string
  language?: SupportedLanguage
}

function languageOf(session: PatientSession): SupportedLanguage {
  return session.note?.language ?? languageCodeOf(session.language)
}

/** W — the one-page case summary a reviewer can scan in a single glance. */
export function buildCaseSummaryOnePager(session: PatientSession, options: CaseSummaryOptions): CaseSummaryOnePager {
  const priority = computePriority(session)
  const note = session.note
  const rationale = priority.breakdown.components
    .filter((component) => component.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((component) => `${component.label}: ${component.reasons.join('; ')}`)
    .join(' | ')

  return {
    sessionId: session.id,
    chiefComplaint: note?.structuredNote.chiefComplaint ?? '',
    timelineSummary: session.timeline?.summary ?? '',
    topUrgencyFlags: (note?.urgencyFlags ?? []).slice(0, 5).map((flag) => ({ label: flag.label, severity: flag.severity })),
    topMissingInfo: (note?.missingInformation ?? []).slice(0, 5).map((item) => ({ label: item.field, whyItMatters: item.whyItMatters })),
    priorityBand: priority.band,
    priorityRationale: rationale || 'No priority signals recorded.',
    aggregateConfidence: note?.aggregateConfidence?.value ?? 0,
    assignedTo: session.assignedTo ?? session.assignedToName ?? null,
    generatedAt: new Date().toISOString(),
    language: options.language ?? languageOf(session),
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  }
}

/* ------------------------------------------------------------------ */
/*  V — Shift handover                                                 */
/* ------------------------------------------------------------------ */

export function buildShiftHandoverCase(session: PatientSession, now: Date = new Date()): ShiftHandoverCase {
  const priority = computePriority(session, now)
  const createdMs = Date.parse(session.createdAt)
  const waitTimeMs = Number.isFinite(createdMs) ? Math.max(0, now.getTime() - createdMs) : 0
  return {
    sessionId: session.id,
    patientId: session.patientId,
    priorityBand: priority.band,
    chiefComplaint: session.note?.structuredNote.chiefComplaint ?? '',
    waitTimeMs,
    assignedTo: session.assignedTo ?? null,
    status: session.status,
  }
}

export interface ShiftHandoverInput {
  facilityId: string
  generatedBy: string
  sessions: PatientSession[]
  filter?: ShiftHandoverFilter
  language?: SupportedLanguage
  now?: Date
}

function matchesFilter(session: PatientSession, filter: ShiftHandoverFilter): boolean {
  if (filter.band && filter.band.length > 0) {
    const priority = computePriority(session)
    if (!filter.band.includes(priority.band)) return false
  }
  if (filter.assignedTo && (session.assignedTo ?? '') !== filter.assignedTo) return false
  if (filter.language && languageOf(session) !== filter.language) return false
  return true
}

/** V — the shift-handover report a worker uses to brief the next shift. */
export function buildShiftHandoverReport(input: ShiftHandoverInput): ShiftHandoverReport {
  const now = input.now ?? new Date()
  const filter = input.filter ?? {}
  const cases = input.sessions
    .filter((session) => session.facilityId === input.facilityId && !session.deletedAt)
    .filter((session) => matchesFilter(session, filter))
    .map((session) => buildShiftHandoverCase(session, now))
    .sort((a, b) => b.waitTimeMs - a.waitTimeMs)

  return {
    facilityId: input.facilityId,
    generatedAt: now.toISOString(),
    generatedBy: input.generatedBy,
    cases,
    totalCases: cases.length,
    language: input.language ?? 'en',
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
  }
}

/* ------------------------------------------------------------------ */
/*  U — SLA breach notifications (in-app only)                         */
/* ------------------------------------------------------------------ */

export function buildSlaBreachNotification(
  session: PatientSession,
  band: PriorityBand,
  breachedAt: string,
  assigneeId: string,
): SlaBreachNotification {
  return {
    sessionId: session.id,
    patientId: session.patientId,
    priorityBand: band,
    breachedAt,
    assigneeId,
  }
}

/** U — every session whose wait has exceeded its band's SLA window, in-app only. */
export function listSlaBreachNotifications(sessions: PatientSession[], now: Date = new Date()): SlaBreachNotification[] {
  const notifications: SlaBreachNotification[] = []
  for (const session of sessions) {
    if (session.deletedAt) continue
    const priority = computePriority(session, now)
    const slaMinutes = slaMinutesFor(getSlaConfig(session.facilityId), priority.band)
    if (priority.waitMinutes <= slaMinutes) continue
    const breachedAt = new Date(Date.parse(session.createdAt) + slaMinutes * 60_000).toISOString()
    notifications.push(buildSlaBreachNotification(session, priority.band, breachedAt, session.assignedTo ?? 'unassigned'))
  }
  return notifications.sort((a, b) => a.breachedAt.localeCompare(b.breachedAt))
}
