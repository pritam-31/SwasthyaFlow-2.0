import type { BiasSliceDimension, LayerId } from '../types/modelcard.types'
import { BIAS_SLICE_VALUES } from '../types/modelcard.types'

/**
 * Slice configuration for the bias evaluation (P2-13).
 *
 * Every dataset record carries all five slice attributes. A layer is *reported*
 * on its assigned dimension but fairness is computed across every dimension, so
 * the report can surface a disparity even on a dimension the layer does not
 * primarily target.
 */
export const LAYER_DIMENSION: Record<LayerId, BiasSliceDimension> = {
  'triage-engine': 'language',
  'multilingual-rules': 'language',
  'report-parser': 'inputModality',
  'visual-feature-service': 'inputModality',
  'timeline-extractor': 'ageBand',
  'follow-up-generator': 'language',
  anonymiser: 'inputModality',
  'priority-scoring': 'sexMarker',
}

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

/** Stable key for a slice, e.g. `language=en`, `ageBand=60+`. */
export function sliceKey(dimension: BiasSliceDimension, value: string): string {
  return `${dimension}=${value}`
}

export function sliceValues(dimension: BiasSliceDimension): string[] {
  return BIAS_SLICE_VALUES[dimension]
}

/** Fairness flag thresholds on the max−min spread of the evaluated metric. */
export const FAIRNESS_AMBER_THRESHOLD = 0.05
export const FAIRNESS_RED_THRESHOLD = 0.1

export const FAIRNESS_METHODOLOGY =
  'Disparity is the largest minus the smallest slice metric for this dimension (max−min). ' +
  'It is a screening threshold, not a statistical test. A flag means reviewers should look at the ' +
  'slice before relying on this layer for that group; it does not mean the layer is broken.'
