import type {
  BiasSliceDimension,
  EvaluationMetricName,
  FairnessFlag,
  FairnessReportRow,
} from '../../types/modelcard.types'
import { FAIRNESS_AMBER_THRESHOLD, FAIRNESS_METHODOLOGY, FAIRNESS_RED_THRESHOLD, sliceValues } from '../slices'
import { rate, type Confusion } from './precisionRecallF1'

export interface SliceBucket {
  confusion: Confusion
  sampleCount: number
}

/** Map a max−min spread to a review flag. */
export function flagFor(spread: number): FairnessFlag {
  if (spread >= FAIRNESS_RED_THRESHOLD) return 'red'
  if (spread >= FAIRNESS_AMBER_THRESHOLD) return 'amber'
  return 'green'
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function interpretationFor(flag: FairnessFlag, spread: number, lowest: string): string {
  const spreadText = spread.toFixed(4)
  if (flag === 'red') {
    return `Large disparity on this dimension (max−min ${spreadText}). The lowest slice is "${lowest}". Review before relying on this layer for that group; this is not a claim that the layer is broken.`
  }
  if (flag === 'amber') {
    return `Moderate disparity on this dimension (max−min ${spreadText}). The lowest slice is "${lowest}". Review before relying on this layer for that group; this is not a claim that the layer is broken.`
  }
  return `No material disparity detected on this dimension (max−min ${spreadText}). Continue routine monitoring.`
}

/**
 * Build one fairness row for a dimension + metric from pooled buckets.
 * Slices with no samples are still reported (metric 0, sampleCount 0).
 */
export function buildFairnessRow(
  dimension: BiasSliceDimension,
  metric: EvaluationMetricName,
  buckets: Map<string, SliceBucket>,
): FairnessReportRow {
  const individualSlices = sliceValues(dimension).map((value) => {
    const bucket = buckets.get(value)
    const metricValue = rate(bucket?.confusion ?? { truePositives: 0, falsePositives: 0, falseNegatives: 0 })
    return { value, metric: metricValue[metric], sampleCount: bucket?.sampleCount ?? 0 }
  })

  const measured = individualSlices.filter((slice) => slice.sampleCount > 0)
  const values = (measured.length > 0 ? measured : individualSlices).map((slice) => slice.metric)
  const max = values.length > 0 ? Math.max(...values) : 0
  const min = values.length > 0 ? Math.min(...values) : 0
  const spread = round4(max - min)
  const flag = flagFor(spread)
  const lowest = [...(measured.length > 0 ? measured : individualSlices)].sort((a, b) => a.metric - b.metric)[0]?.value ?? 'n/a'

  return {
    dimension,
    slice: { dimension, value: 'all' },
    evaluatedMetric: metric,
    maxMin: spread,
    flag,
    interpretation: interpretationFor(flag, spread, lowest),
    individualSlices,
    methodology: FAIRNESS_METHODOLOGY,
  }
}

export { FAIRNESS_AMBER_THRESHOLD, FAIRNESS_RED_THRESHOLD }
