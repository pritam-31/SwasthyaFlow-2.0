/**
 * Model card + bias evaluation types (P2-13) — frontend mirror of
 * backend/src/types/modelcard.types.ts.
 *
 * The backend remains the source of truth for validation, the non-diagnostic
 * guard, anonymisation and the evaluation engine. This file only mirrors the
 * wire shapes the UI renders.
 */

import type { LanguageCode } from './language.types'
import type { Role } from './index'

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

export const LAYER_LABEL: Record<LayerId, string> = {
  'triage-engine': 'Triage Intake Engine',
  'multilingual-rules': 'Multilingual Clinical Language Rules',
  'report-parser': 'Report & Document Parser',
  'visual-feature-service': 'Visual Feature Service',
  'timeline-extractor': 'Timeline & Temporal Extractor',
  'follow-up-generator': 'Follow-up Question Generator',
  anonymiser: 'Unified Anonymisation Pipeline',
  'priority-scoring': 'Priority Scoring Engine',
}

export type ModelCardStatus = 'active' | 'deprecated' | 'retired'

export const MODEL_CARD_STATUSES: ModelCardStatus[] = ['active', 'deprecated', 'retired']

export interface ModelTrainingData {
  description: string
  volume: string
  syntheticOnly: boolean
  languages: LanguageCode[]
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
  outOfScopeUse: string
  nonDiagnosticStatement: string
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

export interface FailureModeInput {
  layerId: LayerId
  title: string
  description: string
  triggerExample: string
  impact: FailureImpact
  likelihood: FailureLikelihood
  status: FailureStatus
  mitigation: string
}

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
  slice: BiasSlice
  metric: ModelMetric
  sampleCount: number
}

export interface FairnessReportRow {
  dimension: BiasSliceDimension
  slice: BiasSlice
  evaluatedMetric: EvaluationMetricName
  maxMin: number
  flag: FairnessFlag
  interpretation: string
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
  createdBy: { id: string; username: string; role: Role }
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
  createdBy: { id: string; username: string; role: Role }
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
