/**
 * AI triage severity types.
 *
 * Mirrors the wire shape returned by the Node backend at
 * `POST /api/ai-triage/predict-severity` (which proxies the Python AI
 * service). The AI proposes a severity level for human review — it never
 * diagnoses or prescribes, and a clinician confirms or overrides.
 */

export type TriageLevel = 'LOW' | 'MODERATE' | 'URGENT' | 'CRITICAL'

export const TRIAGE_LEVELS: TriageLevel[] = ['LOW', 'MODERATE', 'URGENT', 'CRITICAL']

export type SeveritySource = 'ai-service' | 'fallback'

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
  source: SeveritySource
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

export interface AiTriageStatus {
  configured: boolean
  reachable: boolean
  detail: unknown
  fallbackAvailable: boolean
}

export interface SeverityOverrideInput {
  predictionId?: string | null
  patientId?: string
  sessionId?: string
  doctorLevel: TriageLevel
  reason: string
  aiSeverityScore?: number
  aiTriageLevel?: string
  features?: Record<string, unknown>
}

export interface SeverityOverrideResult {
  recorded: boolean
  agreement: boolean
  feedbackId: string
  message: string
  retrainQueued: boolean
}

/** Tailwind class fragments per triage level, shared by every severity surface. */
export const TRIAGE_LEVEL_STYLES: Record<TriageLevel, { pill: string; dot: string; bar: string; tone: 'rose' | 'amber' | 'sky' | 'emerald' }> = {
  CRITICAL: { pill: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', bar: 'bg-rose-500', tone: 'rose' },
  URGENT: { pill: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-500', tone: 'amber' },
  MODERATE: { pill: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', bar: 'bg-sky-500', tone: 'sky' },
  LOW: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500', tone: 'emerald' },
}
