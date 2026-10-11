/**
 * Model card + bias evaluation model (P2-13).
 *
 * Governance surface over the eight AI/rule layers that make up the triage
 * assistant. A model card documents one layer; the bias evaluation measures the
 * layer's behaviour across population slices and flags disparities for review.
 *
 * Hard rules (mirrors the platform contract):
 *  - Card bodies and failure descriptions are observations/documentation only.
 *    They never diagnose, prescribe or plan treatment.
 *  - Every stored string is anonymised before persistence.
 *  - A "flag" means "review before relying on this layer for this group"; it is
 *    not a claim that the layer is broken.
 */

import type { SupportedLanguage } from './language.types'
import type { UserRole } from './index'

/** The eight layers covered by model cards. `cardId` is the stable layer id. */
export type LayerId =
  | 'triage-engine'
  | 'multilingual-rules'
  | 'report-parser'
  | 'visual-feature-service'
  | 'timeline-extractor'
  | 'follow-up-generator'
  | 'anonymiser'
  | 'priority-scoring'

export const ALL_LAYER_IDS: LayerId[] = [
  'triage-engine',
  'multilingual-rules',
  'report-parser',
  'visual-feature-service',
  'timeline-extractor',
  'follow-up-generator',
  'anonymiser',
  'priority-scoring',
]

export function isLayerId(value: unknown): value is LayerId {
  return typeof value === 'string' && (ALL_LAYER_IDS as string[]).includes(value)
}

export type ModelCardStatus = 'active' | 'deprecated' | 'retired'

export const MODEL_CARD_STATUSES: ModelCardStatus[] = ['active', 'deprecated', 'retired']

/** SemVer 2.0.0 (build metadata allowed). */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/** Parsed comparison of two SemVer strings. Returns >0 when `a` is newer. */
export function compareSemver(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .split('-')[0]
      .split('+')[0]
      .split('.')
      .map((part) => Number.parseInt(part, 10))
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export interface ModelTrainingData {
  description: string
  volume: string
  syntheticOnly: boolean
  languages: SupportedLanguage[]
  modalities: string[]
}

export interface ModelVersionEntry {
  version: string
  date: string
  changelog: string
}

export interface ModelCard {
  cardId: string
  layerId: LayerId
  name: string
  modelVersion: string
  summary: string
  description: string
  intendedUse: string
  /** Verbatim out-of-scope statement; contains the fixed forbidden-use phrases. */
  outOfScopeUse: string
  /** Fixed system text; set at seed time and never editable. */
  nonDiagnosticStatement: string
  /** Fixed system text; set at seed time and never editable. */
  humanInTheLoopStatement: string
  trainingData: ModelTrainingData
  intendedUsers: string[]
  risksAndLimitations: string[]
  versionHistory: ModelVersionEntry[]
  status: ModelCardStatus
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/**
 * Fields a client may change on a card. Ids, system text and the version are
 * handled explicitly by the service (a version bump uses `newVersion`).
 */
export const EDITABLE_MODEL_CARD_FIELDS = [
  'name',
  'summary',
  'description',
  'intendedUse',
  'outOfScopeUse',
  'intendedUsers',
  'risksAndLimitations',
  'status',
  'trainingData',
] as const

export type FailureImpact = 'high' | 'medium' | 'low'
export type FailureLikelihood = 'rare' | 'uncommon' | 'common'
export type FailureStatus = 'open' | 'mitigated' | 'accepted'

export const FAILURE_IMPACTS: FailureImpact[] = ['high', 'medium', 'low']
export const FAILURE_LIKELIHOODS: FailureLikelihood[] = ['rare', 'uncommon', 'common']
export const FAILURE_STATUSES: FailureStatus[] = ['open', 'mitigated', 'accepted']

export interface FailureMode {
  failureId: string
  layerId: LayerId
  title: string
  description: string
  triggerExample: string
  impact: FailureImpact
  likelihood: FailureLikelihood
  status: FailureStatus
  mitigation: string
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/* ------------------------------- Bias model ------------------------------- */

export type BiasSliceDimension = 'language' | 'ageBand' | 'sexMarker' | 'facilityType' | 'inputModality'

export const ALL_BIAS_DIMENSIONS: BiasSliceDimension[] = [
  'language',
  'ageBand',
  'sexMarker',
  'facilityType',
  'inputModality',
]

export const BIAS_SLICE_VALUES: Record<BiasSliceDimension, string[]> = {
  language: ['en', 'hi', 'or'],
  ageBand: ['0-17', '18-39', '40-59', '60+', 'Unknown'],
  sexMarker: ['Female', 'Male', 'Other', 'Not stated'],
  facilityType: [
    'government-hospital',
    'phc',
    'health-camp',
    'company-clinic',
    'industrial-health-unit',
    'campus-health-centre',
    'other',
  ],
  inputModality: ['text', 'voice-transcript', 'report', 'visual', 'mixed'],
}

export interface BiasSlice {
  dimension: BiasSliceDimension
  value: string
}

export type FairnessFlag = 'green' | 'amber' | 'red'

/** Slice keys with no samples in the dataset. */
export interface ModelMetric {
  correct: number
  total: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  precision: number
  recall: number
  f1: number
}

export type EvaluationMetricName = 'precision' | 'recall' | 'f1'

export interface LayerEvaluation {
  layerId: LayerId
  evaluationId: string
  /** The slice this layer is evaluated on (its assigned dimension). */
  slice: BiasSlice
  metric: ModelMetric
  /** Cases contributing to this row. */
  sampleCount: number
}

export interface FairnessReportRow {
  dimension: BiasSliceDimension
  /** The dimension under comparison (whole range). */
  slice: BiasSlice
  evaluatedMetric: EvaluationMetricName
  /** max − min of the metric across this dimension's slices. */
  maxMin: number
  flag: FairnessFlag
  /** Human-readable interpretation ("flag = review", never "broken"). */
  interpretation: string
  /** The metric value per slice value. */
  individualSlices: Array<{ value: string; metric: number; sampleCount: number }>
  methodology: string
}

export interface BiasReport {
  reportId: string
  runId: string
  engineVersion: string
  datasetVersion: string
  generatorVersion: string
  runAt: string
  createdBy: { id: string; username: string; role: UserRole }
  layers: LayerEvaluation[]
  fairness: FairnessReportRow[]
  missingSlices: string[]
  averageMetrics: Record<LayerId, ModelMetric>
  summary: {
    overallF1: number
    concerningSlices: string[]
    note: string
  }
}

export type EvaluationRunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

export interface EvaluationRun {
  runId: string
  engineVersion: string
  datasetVersion: string
  generatorVersion: string
  status: EvaluationRunStatus
  layersCompleted: LayerId[]
  startedAt: string
  completedAt?: string
  reportId?: string
  error?: string
  createdBy: { id: string; username: string; role: UserRole }
}

export interface AnonymiserLeakResult {
  passed: number
  failed: number
  failures: Array<{ case: string; leak: string }>
  byLanguage: Record<string, { passed: number; failed: number }>
  precision: number
  recall: number
  f1: number
  ranAt: string
  engineVersion: string
}

/* ------------------------------ Dataset model ------------------------------ */

export interface DatasetFileDescriptor {
  fileName: string
  count: number
  sha256: string
}

export interface DatasetManifest {
  version: string
  generatorVersion: string
  generateCommand: string
  generatedAt: string
  seed: number
  checksum: string
  files: DatasetFileDescriptor[]
  sliceCounts: Record<BiasSliceDimension, Record<string, number>>
}
