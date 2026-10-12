/**
 * AI triage severity client (data-driven decision support).
 *
 * Calls the external Python AI service (`AI_SERVICE_URL`) which runs the full
 * multi-model pipeline (NEWS2/qSOFA + Isolation Forest, multilingual symptom
 * NLP, lab thresholds, history risk model, learned fusion, SHAP explanations).
 *
 * When the service is not configured or unreachable this module degrades
 * gracefully to the in-process deterministic priority scorer, so the feature
 * never takes down triage. Every result is explicitly flagged via
 * `fallbacksUsed` / `source`.
 *
 * Nothing here diagnoses or prescribes. The AI proposes a severity level; a
 * qualified clinician confirms or overrides it.
 */

import { aiServiceTimeoutMs, aiServiceToken, aiServiceUrl } from '../config/env'
import { computePriority } from './priorityScoringService'
import type { ExtractedReport, PatientSession, PriorityBand } from '../types'

export type TriageLevel = 'LOW' | 'MODERATE' | 'URGENT' | 'CRITICAL'

export interface AiComponentScore {
  key: string
  label: string
  score: number
  weight: number
  available: boolean
  signals: string[]
}

export interface AiFactor {
  name: string
  category: string
  contribution: number
  direction: 'increases' | 'decreases'
  detail: string
}

export interface AiActionPlan {
  level: string
  title: string
  actions: string[]
  notify: string[]
  targetResponseMinutes: number | null
}

export interface AiSeverityResult {
  /** Where the result came from: the AI service, or the local fallback. */
  source: 'ai-service' | 'fallback'
  patientIdHash: string
  sessionId?: string
  severityScore: number
  triageLevel: TriageLevel
  confidence: number
  components: AiComponentScore[]
  topFactors: AiFactor[]
  action: AiActionPlan
  redFlags: string[]
  missingData: string[]
  modelVersions: Record<string, string>
  fallbacksUsed: string[]
  predictionId: string | null
  generatedAt: string
  disclaimer: string
}

/** The raw JSON contract the Python service accepts. */
export interface AiPatientPayload {
  patient_id: string
  age: number | null
  gender: 'male' | 'female' | 'other' | null
  vitals: Record<string, number | null>
  symptoms_text: string
  symptoms_language: string
  medical_history: string[]
  medications: string[]
  lab_reports: Record<string, number>
  past_admissions: number | null
  last_visit_days_ago: number | null
  ecg_image_url: string | null
  xray_image_url: string | null
  facility_id?: string
  session_id?: string
}

export interface AiOverrideInput {
  predictionId?: string | null
  patientId?: string
  sessionId?: string
  doctorLevel: TriageLevel
  reason: string
  doctorId?: string
  doctorRole?: string
  aiSeverityScore?: number
  aiTriageLevel?: string
  features?: Record<string, unknown>
}

export interface AiOverrideResult {
  recorded: boolean
  agreement: boolean
  feedbackId: string
  message: string
  retrainQueued: boolean
}

const AGE_BAND_MIDPOINT: Record<string, number> = {
  '0-17': 10,
  '18-39': 28,
  '40-59': 49,
  '60+': 68,
}

const LANGUAGE_CODE: Record<string, string> = {
  English: 'en',
  Hindi: 'hi',
  Odia: 'or',
}

const HISTORY_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /diabet|sugar|मधुमेह/i, label: 'diabetes' },
  { pattern: /hypertens|high bp|blood pressure|उच्च रक्तचाप/i, label: 'hypertension' },
  { pattern: /smok|tobacco|धूम्रपान/i, label: 'smoker' },
  { pattern: /kidney|renal|ckd|गुर्दा/i, label: 'kidney disease' },
  { pattern: /heart|cardiac|cad|हृदय/i, label: 'heart disease' },
  { pattern: /asthma|copd|lung|tb/i, label: 'lung disease' },
  { pattern: /cancer|carcinoma|कैंसर/i, label: 'cancer' },
]

function normaliseVitalName(name: string): string | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.includes('spo2') || key.includes('saturation') || key.includes('o2sat')) return 'spo2'
  if (key.includes('systolic') || key === 'sbp') return 'bp_systolic'
  if (key.includes('diastolic') || key === 'dbp') return 'bp_diastolic'
  if (key.includes('heartrate') || key.includes('pulse') || key === 'hr') return 'heart_rate'
  if (key.includes('respiratory') || key === 'rr' || key.includes('respiration')) return 'respiratory_rate'
  if (key.includes('temp')) return 'temperature'
  if (key.includes('glucose') || key.includes('sugar')) return 'blood_glucose'
  return null
}

/** Map a patient session onto the AI service's JSON contract. */
export function buildPayloadFromSession(session: PatientSession): AiPatientPayload {
  const vitals: Record<string, number | null> = {}
  const labReports: Record<string, number> = {}

  const reports: ExtractedReport[] = session.reports ?? []
  const latestWithVitals = reports
    .filter((report) => report.vitals.length > 0)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0]

  for (const vital of latestWithVitals?.vitals ?? []) {
    const key = normaliseVitalName(vital.name)
    if (key && vitals[key] === undefined) vitals[key] = vital.value
  }

  for (const report of reports) {
    for (const lab of report.labValues) {
      const key = lab.name.toLowerCase().trim()
      if (key && labReports[key] === undefined) labReports[key] = lab.value
    }
  }

  const history: string[] = []
  for (const { pattern, label } of HISTORY_KEYWORDS) {
    if (pattern.test(session.displayText) && !history.includes(label)) history.push(label)
  }

  const gender: AiPatientPayload['gender'] =
    session.sex === 'Male' ? 'male' : session.sex === 'Female' ? 'female' : session.sex === 'Other' ? 'other' : null

  return {
    patient_id: session.patientId,
    age: AGE_BAND_MIDPOINT[session.ageBand] ?? null,
    gender,
    vitals,
    symptoms_text: session.displayText,
    symptoms_language: LANGUAGE_CODE[session.language] ?? 'en',
    medical_history: history,
    medications: [],
    lab_reports: labReports,
    past_admissions: null,
    last_visit_days_ago: null,
    ecg_image_url: null,
    xray_image_url: null,
    facility_id: session.facilityId,
    session_id: session.id,
  }
}

/** True when the external AI service is configured. */
export function aiServiceConfigured(): boolean {
  return aiServiceUrl() !== null
}

function mapBandToLevel(band: PriorityBand): TriageLevel {
  if (band === 'critical') return 'CRITICAL'
  if (band === 'high') return 'URGENT'
  if (band === 'medium') return 'MODERATE'
  return 'LOW'
}

/**
 * Deterministic fallback that reuses the in-process priority scorer. Used when
 * the AI service is unconfigured or unreachable so the caller always gets a
 * usable (and clearly labelled) result.
 */
export function fallbackSeverity(session: PatientSession, reason: string): AiSeverityResult {
  const computation = computePriority(session)
  const level = mapBandToLevel(computation.band)
  const components: AiComponentScore[] = computation.breakdown.components.map((entry) => ({
    key: entry.key,
    label: entry.label,
    score: Math.max(0, Math.min(100, Math.round((entry.points / Math.max(entry.maxPoints, 1)) * 100))),
    weight: 0,
    available: entry.reasons.length > 0,
    signals: entry.reasons.slice(0, 4),
  }))
  return {
    source: 'fallback',
    patientIdHash: session.patientId,
    sessionId: session.id,
    severityScore: computation.score,
    triageLevel: level,
    confidence: 0.5,
    components,
    topFactors: computation.breakdown.components
      .filter((entry) => entry.points > 0)
      .map((entry) => ({
        name: entry.label,
        category: entry.key,
        contribution: entry.points,
        direction: 'increases' as const,
        detail: entry.reasons[0] ?? entry.label,
      }))
      .slice(0, 5),
    action: {
      level,
      title: 'Local priority estimate',
      actions: ['Follow the local priority queue ordering.'],
      notify: [],
      targetResponseMinutes: null,
    },
    redFlags: [],
    missingData: [],
    modelVersions: { fusion: 'in-process-priority-scorer' },
    fallbacksUsed: [reason],
    predictionId: null,
    generatedAt: new Date().toISOString(),
    disclaimer:
      'Decision support only — not a diagnosis. The AI severity service was unavailable; this is the in-process deterministic priority estimate. The treating doctor makes the final call.',
  }
}

interface AiRawResponse {
  patient_id_hash: string
  severity_score: number
  triage_level: TriageLevel
  confidence: number
  components: Array<{ key: string; label: string; score: number; weight: number; available: boolean; signals: string[] }>
  top_factors: Array<{ name: string; category: string; contribution: number; direction: 'increases' | 'decreases'; detail: string }>
  action: { level: string; title: string; actions: string[]; notify: string[]; target_response_minutes: number | null }
  red_flags: string[]
  missing_data: string[]
  model_versions: Record<string, string>
  fallbacks_used: string[]
  prediction_id: string | null
  generated_at: string
  disclaimer: string
}

function mapResponse(raw: AiRawResponse, sessionId?: string): AiSeverityResult {
  return {
    source: 'ai-service',
    patientIdHash: raw.patient_id_hash,
    sessionId,
    severityScore: raw.severity_score,
    triageLevel: raw.triage_level,
    confidence: raw.confidence,
    components: raw.components.map((c) => ({
      key: c.key,
      label: c.label,
      score: c.score,
      weight: c.weight,
      available: c.available,
      signals: c.signals,
    })),
    topFactors: raw.top_factors.map((f) => ({
      name: f.name,
      category: f.category,
      contribution: f.contribution,
      direction: f.direction,
      detail: f.detail,
    })),
    action: {
      level: raw.action.level,
      title: raw.action.title,
      actions: raw.action.actions,
      notify: raw.action.notify,
      targetResponseMinutes: raw.action.target_response_minutes,
    },
    redFlags: raw.red_flags ?? [],
    missingData: raw.missing_data ?? [],
    modelVersions: raw.model_versions ?? {},
    fallbacksUsed: raw.fallbacks_used ?? [],
    predictionId: raw.prediction_id ?? null,
    generatedAt: raw.generated_at ?? new Date().toISOString(),
    disclaimer: raw.disclaimer,
  }
}

/** Low-level POST with timeout; throws on transport/HTTP error. */
async function postJson<T>(path: string, body: unknown, timeoutMs = aiServiceTimeoutMs()): Promise<T> {
  const base = aiServiceUrl()
  if (!base) throw new Error('AI_SERVICE_URL is not configured.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const token = aiServiceToken()
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`AI service responded ${response.status}: ${text.slice(0, 200)}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** Predict severity for a raw payload (no fallback — throws on failure). */
export async function predictSeverityPayload(payload: AiPatientPayload): Promise<AiSeverityResult> {
  const raw = await postJson<AiRawResponse>('/predict-severity', payload)
  return mapResponse(raw, payload.session_id)
}

/** Predict severity for a stored session, falling back gracefully on error. */
export async function predictSeverityForSession(session: PatientSession): Promise<AiSeverityResult> {
  if (!aiServiceConfigured()) {
    return fallbackSeverity(session, 'ai-service-not-configured')
  }
  try {
    return await predictSeverityPayload(buildPayloadFromSession(session))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return fallbackSeverity(session, `ai-service-unavailable: ${message}`)
  }
}

/** Send a doctor confirmation/override to the learning loop. */
export async function submitSeverityOverride(input: AiOverrideInput): Promise<AiOverrideResult> {
  const body = {
    prediction_id: input.predictionId ?? null,
    patient_id: input.patientId ?? null,
    session_id: input.sessionId ?? null,
    doctor_level: input.doctorLevel,
    reason: input.reason,
    doctor_id: input.doctorId ?? null,
    doctor_role: input.doctorRole ?? null,
    ai_severity_score: input.aiSeverityScore ?? null,
    ai_triage_level: input.aiTriageLevel ?? null,
    features: input.features ?? {},
  }
  const raw = await postJson<{
    recorded: boolean
    agreement: boolean
    feedback_id: string
    message: string
    retrain_queued: boolean
  }>('/override', body)
  return {
    recorded: raw.recorded,
    agreement: raw.agreement,
    feedbackId: raw.feedback_id,
    message: raw.message,
    retrainQueued: raw.retrain_queued,
  }
}

/** Liveness probe for the AI service (GET /health). */
export async function aiServiceHealth(): Promise<{ configured: boolean; reachable: boolean; detail?: unknown }> {
  const base = aiServiceUrl()
  if (!base) return { configured: false, reachable: false }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), aiServiceTimeoutMs())
  try {
    const response = await fetch(`${base}/health`, { signal: controller.signal })
    if (!response.ok) return { configured: true, reachable: false }
    return { configured: true, reachable: true, detail: await response.json() }
  } catch {
    return { configured: true, reachable: false }
  } finally {
    clearTimeout(timer)
  }
}
