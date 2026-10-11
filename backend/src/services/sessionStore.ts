import { randomUUID } from 'node:crypto'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { loadAllSessions, persistSession, removeSession } from '../repositories/sessionRepository'
import {
  deleteConsentBySession,
  listConsent,
  listRedactionMaps as loadRedactionMaps,
  upsertConsent,
  upsertRedactionMap,
} from '../repositories/consentRepository'
import type { AnonymizationReport, ConsentRecord, ExtractedReport, FollowUpQuestion, PatientSession, RedactionMap, Timeline, TriageNote, UserRole, VisualRecord } from '../types'
import { DEFAULT_FACILITY_ID } from '../types/facility.types'
import { anonymiseText } from './unifiedAnonymizer'
import { buildSessionConfidence, DEFAULT_CONFIDENCE_THRESHOLDS } from './confidenceService'

/** In-memory session store. Nothing is persisted — prototype data only. */

const FACILITY = 'Model PHC — Triage Unit'

const sessions = new Map<string, PatientSession>()

/** Consent proof per session (P0-6) — deliberately outlives the session. */
const consentRecords = new Map<string, ConsentRecord>()

/** Which identifier classes were stripped for a session (P0-6). */
const redactionMaps = new Map<string, RedactionMap>()

/** Sessions created by the demo seeder — governed by the `demo-data` rule. */
const seededSessionIds = new Set<string>()

function persist(session: PatientSession): void {
  if (!persistenceEnabled()) return
  const seeded = seededSessionIds.has(session.id)
  enqueue('session:' + session.id, () => persistSession({ ...session, seeded }))
}

function now(): string {
  return new Date().toISOString()
}

/** Soft-deleted sessions are hidden everywhere but the retention sweep. */
function isHidden(session: PatientSession): boolean {
  return Boolean(session.deletedAt)
}

/** Attaches the consent record on read so callers always see the current state. */
function hydrate(session: PatientSession): PatientSession {
  const consent = consentRecords.get(session.id)
  return consent ? { ...session, consentRecord: consent } : session
}

export function generatePatientId(): string {
  return `PT-${randomUUID().slice(0, 8).toUpperCase()}`
}

export interface CreateSessionInput {
  patientId?: string
  displayText: string
  anonymization: AnonymizationReport
  note: TriageNote
  language: PatientSession['language']
  ageBand: PatientSession['ageBand']
  sex: PatientSession['sex']
  intakePoint: PatientSession['intakePoint']
  /** Authenticated user the session belongs to. */
  ownerId: string
  createdBy: string
  createdByRole: UserRole
  /** Tenant boundary (P1-10); defaults to the default facility. */
  facilityId?: string
  /** Human-readable facility label; defaults to the legacy model label. */
  facility?: string
}

export function listSessions(): PatientSession[] {
  return [...sessions.values()]
    .filter((session) => !isHidden(session))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(hydrate)
}

/** Sessions scoped to one facility (P1-10). */
export function listSessionsForFacility(facilityId: string): PatientSession[] {
  return listSessions().filter((session) => session.facilityId === facilityId)
}

/** Every session including soft-deleted ones — retention sweeps only. */
export function listSessionsIncludingDeleted(): PatientSession[] {
  return [...sessions.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(hydrate)
}

export function countSessions(): number {
  let total = 0
  for (const session of sessions.values()) if (!isHidden(session)) total += 1
  return total
}

export function countSessionsIncludingDeleted(): number {
  return sessions.size
}

const SYSTEM_ID_KEYS = new Set([
  'id',
  'patientId',
  'sessionId',
  'itemId',
  'eventId',
  'reportId',
  'sourceRef',
])

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
      // System-generated opaque identifiers (session id, patient id, nested
      // record ids) are not patient-authored content and can coincidentally
      // collide with PII patterns (e.g. a UUID hex run matching Aadhaar).
      if (SYSTEM_ID_KEYS.has(key)) continue
      collectStrings(sub, out, depth + 1)
    }
  }
}

/**
 * Test helper: throws if any stored string still contains detectable PII.
 * Anonymised placeholders produce no matches, so this is a strict guard.
 * System-generated identifier fields are excluded (see {@link collectStrings}).
 */
export function assertNoPII(session: PatientSession): void {
  const strings: string[] = []
  collectStrings(session, strings)
  for (const text of strings) {
    if (anonymiseText(text, 'structured-note').matches.length > 0) {
      throw new Error(`Session ${session.id} contains un-anonymised PII.`)
    }
  }
}

export function getSession(id: string): PatientSession | undefined {
  const session = sessions.get(id)
  if (!session || isHidden(session)) return undefined
  return hydrate(session)
}

/** Soft-deleted or live — retention sweeps only. */
export function getSessionIncludingDeleted(id: string): PatientSession | undefined {
  const session = sessions.get(id)
  return session ? hydrate(session) : undefined
}

/** Hides a case from every user-facing surface without destroying the shell. */
export function softDeleteSession(id: string): PatientSession | undefined {
  const session = sessions.get(id)
  if (!session) return undefined
  if (!session.deletedAt) {
    sessions.set(id, { ...session, deletedAt: now() })
    persist(sessions.get(id)!)
  }
  return hydrate(sessions.get(id)!)
}

/** Destroys the shell (called once its 7-day purge delay has elapsed). */
export function hardDeleteSession(id: string): PatientSession | undefined {
  const session = sessions.get(id)
  if (!session) return undefined
  sessions.delete(id)
  redactionMaps.delete(id)
  seededSessionIds.delete(id)
  if (persistenceEnabled()) enqueue('session:' + id, () => removeSession(id))
  return hydrate(session)
}

export function createSession(input: CreateSessionInput): PatientSession {
  const timestamp = now()
  const session: PatientSession = {
    id: `sess-${randomUUID()}`,
    patientId: input.patientId || generatePatientId(),
    language: input.language,
    ageBand: input.ageBand,
    sex: input.sex,
    intakePoint: input.intakePoint,
    facility: input.facility ?? FACILITY,
    facilityId: input.facilityId ?? DEFAULT_FACILITY_ID,
    displayText: input.displayText,
    anonymization: input.anonymization,
    reports: [],
    visuals: [],
    note: input.note,
    overrides: [],
    referral: null,
    status: 'ready',
    ownerId: input.ownerId,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  session.sessionConfidence = buildSessionConfidence(session, DEFAULT_CONFIDENCE_THRESHOLDS)
  sessions.set(session.id, session)
  persist(session)
  redactionMaps.set(session.id, {
    sessionId: session.id,
    createdAt: timestamp,
    entries: input.anonymization.redactions.map((redaction) => ({
      category: redaction.category,
      count: redaction.count,
    })),
  })
  return hydrate(session)
}

export function updateSession(id: string, patch: Partial<PatientSession>): PatientSession | undefined {
  const existing = sessions.get(id)
  if (!existing) return undefined
  // Consent is hydrated on read; never persist a stale copy with the session.
  const applied: Partial<PatientSession> = { ...patch }
  delete applied.consentRecord
  const updated: PatientSession = { ...existing, ...applied, id: existing.id, updatedAt: now() }
  sessions.set(id, updated)
  persist(updated)
  return hydrate(updated)
}

/* ------------------------------------------------------------------ */
/*  Report storage (P0-1)                                              */
/* ------------------------------------------------------------------ */

export function getReportsForSession(sessionId: string): ExtractedReport[] {
  return sessions.get(sessionId)?.reports ?? []
}

export function addReportToSession(sessionId: string, report: ExtractedReport): PatientSession | undefined {
  const existing = sessions.get(sessionId)
  if (!existing) return undefined
  return updateSession(sessionId, { reports: [...existing.reports, report] })
}

/** Locates a report across sessions; used by the /api/reports/:id routes. */
export function findReport(reportId: string): { session: PatientSession; report: ExtractedReport } | undefined {
  for (const session of sessions.values()) {
    const report = session.reports.find((r) => r.id === reportId)
    if (report) return { session, report }
  }
  return undefined
}

export function replaceReport(sessionId: string, report: ExtractedReport): PatientSession | undefined {
  const existing = sessions.get(sessionId)
  if (!existing) return undefined
  return updateSession(sessionId, {
    reports: existing.reports.map((r) => (r.id === report.id ? report : r)),
  })
}

export function removeReport(sessionId: string, reportId: string): PatientSession | undefined {
  const existing = sessions.get(sessionId)
  if (!existing) return undefined
  return updateSession(sessionId, {
    reports: existing.reports.filter((r) => r.id !== reportId),
  })
}

/* ------------------------------------------------------------------ */
/*  Visual input storage (P0-2)                                        */
/* ------------------------------------------------------------------ */

export function getVisualsForSession(sessionId: string): VisualRecord[] {
  return sessions.get(sessionId)?.visuals ?? []
}

export function addVisualToSession(sessionId: string, visual: VisualRecord): PatientSession | undefined {
  const existing = sessions.get(sessionId)
  if (!existing) return undefined
  return updateSession(sessionId, { visuals: [...existing.visuals, visual] })
}

/** Locates a visual across sessions; used by the /api/visuals/:id routes. */
export function findVisual(visualId: string): { session: PatientSession; visual: VisualRecord } | undefined {
  for (const session of sessions.values()) {
    const visual = session.visuals.find((v) => v.id === visualId)
    if (visual) return { session, visual }
  }
  return undefined
}

export function replaceVisual(sessionId: string, visual: VisualRecord): PatientSession | undefined {
  const existing = sessions.get(sessionId)
  if (!existing) return undefined
  return updateSession(sessionId, {
    visuals: existing.visuals.map((v) => (v.id === visual.id ? visual : v)),
  })
}

export function removeVisual(sessionId: string, visualId: string): PatientSession | undefined {
  const existing = sessions.get(sessionId)
  if (!existing) return undefined
  return updateSession(sessionId, {
    visuals: existing.visuals.filter((v) => v.id !== visualId),
  })
}

/* ------------------------------------------------------------------ */
/*  Timeline storage (P0-4)                                            */
/* ------------------------------------------------------------------ */

export function getTimeline(sessionId: string): Timeline | undefined {
  return sessions.get(sessionId)?.timeline
}

export function setTimeline(sessionId: string, timeline: Timeline): PatientSession | undefined {
  return updateSession(sessionId, { timeline })
}

/* ------------------------------------------------------------------ */
/*  Follow-up question storage (P0-5)                                  */
/* ------------------------------------------------------------------ */

export function getFollowUpsForSession(sessionId: string): FollowUpQuestion[] {
  return sessions.get(sessionId)?.note?.followUpQuestions ?? []
}

export function setFollowUpsForSession(sessionId: string, questions: FollowUpQuestion[]): PatientSession | undefined {
  const session = sessions.get(sessionId)
  if (!session?.note) return undefined
  return updateSession(sessionId, { note: { ...session.note, followUpQuestions: questions } })
}

/* ------------------------------------------------------------------ */
/*  Consent proof + redaction maps (P0-6)                              */
/* ------------------------------------------------------------------ */

export function getConsentRecord(sessionId: string): ConsentRecord | undefined {
  return consentRecords.get(sessionId)
}

export function setConsentRecord(record: ConsentRecord): void {
  consentRecords.set(record.sessionId, record)
  if (persistenceEnabled()) enqueue('consent:' + record.sessionId, () => upsertConsent(record))
}

export function listConsentRecords(): ConsentRecord[] {
  return [...consentRecords.values()].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
}

export function findConsentByRecordId(consentRecordId: string): ConsentRecord | undefined {
  return [...consentRecords.values()].find((record) => record.consentRecordId === consentRecordId)
}

export function deleteConsentRecord(consentRecordId: string): boolean {
  const record = findConsentByRecordId(consentRecordId)
  if (!record) return false
  if (persistenceEnabled()) enqueue('consent:' + record.sessionId, () => deleteConsentBySession(record.sessionId))
  return consentRecords.delete(record.sessionId)
}

export function countConsentRecords(): number {
  return consentRecords.size
}

export function getRedactionMap(sessionId: string): RedactionMap | undefined {
  return redactionMaps.get(sessionId)
}

export function setRedactionMap(map: RedactionMap): void {
  redactionMaps.set(map.sessionId, map)
  if (persistenceEnabled()) enqueue('redaction:' + map.sessionId, () => upsertRedactionMap({ id: map.sessionId, sessionId: map.sessionId, createdAt: map.createdAt, entries: map.entries }))
}

export function listRedactionMaps(): RedactionMap[] {
  return [...redactionMaps.values()]
}

export function deleteRedactionMap(sessionId: string): boolean {
  return redactionMaps.delete(sessionId)
}

export function countRedactionMaps(): number {
  return redactionMaps.size
}

/* ------------------------------------------------------------------ */
/*  Lifecycle helpers for retention (P0-6)                             */
/* ------------------------------------------------------------------ */

/** Session ids the demo seeder created — governed by the `demo-data` rule. */
export function listSeededSessionIds(): string[] {
  return [...seededSessionIds]
}

/** Test teardown / graceful reset. */
export function clearSessions(): void {
  sessions.clear()
  consentRecords.clear()
  redactionMaps.clear()
  seededSessionIds.clear()
}

/** Owner assigned to the seeded demo sessions (staff-created, never a patient). */
export interface SeedOwner {
  id: string
  displayName: string
}

let seedOwner: SeedOwner = { id: 'usr-system', displayName: 'System' }

/** Seeds two demo sessions so the queue is never empty. */
export function seedSessions(owner: SeedOwner): void {
  if (sessions.size > 0) return
  seedOwner = owner

  createSeeded(
    'PT-DEMO0001',
    'Chest pain since morning, radiating to the left arm, with sweating.',
    'English',
    '40-59',
    'Male',
    'OPD',
    {
      chiefComplaint: 'Chest pain since morning, radiating to the left arm, with sweating.',
      history: 'Pain present since morning and reported to be increasing.',
      vitals: 'Not provided in the intake.',
    },
    'High',
    [
      { label: 'Chest pain reported', severity: 'red' as const, reason: 'Reported chest discomfort needs immediate clinician assessment.', ruleId: 'URG-01' },
    ],
  )

  createSeeded(
    'PT-DEMO0002',
    'तीन दिन से बुखार और कमजोरी, खाना नहीं खा पा रहे।',
    'Hindi',
    '60+',
    'Female',
    'Health camp',
    {
      chiefComplaint: 'तीन दिन से बुखार और कमजोरी।',
      history: 'तीन दिन से लगातार लक्षण, गिरावट बताई गई है।',
      vitals: 'Not provided in the intake.',
    },
    'Medium',
    [
      { label: 'Persistent vomiting / dehydration', severity: 'amber' as const, reason: 'Risk of dehydration needs prompt assessment.', ruleId: 'URG-06' },
    ],
  )
}

function languageCodeOf(language: PatientSession['language']): 'en' | 'hi' | 'or' {
  return language === 'Hindi' ? 'hi' : language === 'Odia' ? 'or' : 'en'
}

function seedQuestion(
  question: string,
  category: string,
  target: 'patient' | 'staff',
  priority: number,
  sourceRef: string,
): Omit<FollowUpQuestion, 'language'> {
  const stamp = now()
  return {
    id: `fu-${randomUUID()}`,
    question,
    status: 'suggested',
    category,
    target,
    priority,
    reason: 'Standard intake follow-up to clarify what was reported.',
    sourceType: 'missing-info',
    sourceRef,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

function createSeeded(
  patientId: string,
  text: string,
  language: PatientSession['language'],
  ageBand: PatientSession['ageBand'],
  sex: PatientSession['sex'],
  intakePoint: PatientSession['intakePoint'],
  structuredNote: TriageNote['structuredNote'],
  riskScore: TriageNote['riskScore'],
  flags: Array<Pick<TriageNote['urgencyFlags'][number], 'label' | 'severity' | 'reason' | 'ruleId'>>,
): void {
  const seeded = createSession({
    patientId,
    displayText: text,
    anonymization: { redactedCount: 0, redactions: [] },
    language,
    ageBand,
    sex,
    intakePoint,
    ownerId: seedOwner.id,
    createdBy: seedOwner.displayName,
    createdByRole: 'nurse',
    note: {
      structuredNote,
      observations: [text],
      urgencyFlags: flags.map((f) => ({ id: randomUUID(), ...f })),
      missingInformation: [
        { id: randomUUID(), field: 'Vital signs (BP, pulse, temperature, SpO2)', whyItMatters: 'Vitals anchor triage priority and escalation decisions.' },
        { id: randomUUID(), field: 'Current medications and allergies', whyItMatters: 'Needed before any clinician decision; this system never advises medication.' },
      ],
      followUpQuestions: [
        seedQuestion('When did the symptoms start, and have they got worse, better or stayed the same?', 'timeline', 'patient', 1, 'missing-info'),
        seedQuestion('Is the patient able to drink water and keep it down?', 'hydration', 'patient', 2, 'missing-info'),
      ].map((q) => ({ ...q, language: languageCodeOf(language) })),
      riskScore,
      status: 'ai-draft',
      generatedAt: now(),
      disclaimer:
        'This note is prepared by an AI assistant for review by a qualified healthcare worker. It does not diagnose, does not prescribe and does not replace professional medical judgement.',
    },
  })
  seededSessionIds.add(seeded.id)
}


/** Loads persisted sessions, consent + redaction maps on boot (persistent mode only). */
export async function hydrateSessions(): Promise<void> {
  const rows = await loadAllSessions()
  sessions.clear()
  seededSessionIds.clear()
  for (const row of rows) {
    const { seeded, ...session } = row
    sessions.set(session.id, session)
    if (seeded) seededSessionIds.add(session.id)
  }
  const consent = await listConsent()
  consentRecords.clear()
  for (const record of consent) consentRecords.set(record.sessionId, record)
  const maps = await loadRedactionMaps()
  redactionMaps.clear()
  for (const raw of maps) {
    const map = raw as { sessionId: string; createdAt: string; entries: Array<{ category: string; count: number }> }
    redactionMaps.set(map.sessionId, { sessionId: map.sessionId, createdAt: map.createdAt, entries: map.entries as RedactionMap['entries'] })
  }
}
