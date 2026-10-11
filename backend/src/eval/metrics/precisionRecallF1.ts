import type { ModelMetric } from '../../types/modelcard.types'

/** Confusion counts; precision/recall/F1 are derived from these (P2-13). */
export interface Confusion {
  truePositives: number
  falsePositives: number
  falseNegatives: number
}

export function emptyConfusion(): Confusion {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0 }
}

export function addConfusion(target: Confusion, add: Confusion): Confusion {
  target.truePositives += add.truePositives
  target.falsePositives += add.falsePositives
  target.falseNegatives += add.falseNegatives
  return target
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * Derive precision, recall and F1. A zero denominator yields 0 (no positives to
 * score) — callers should surface the slice as thin evidence via its sample
 * count, not treat the 0 as a measured failure.
 */
export function rate(confusion: Confusion): ModelMetric {
  const { truePositives: tp, falsePositives: fp, falseNegatives: fn } = confusion
  const precisionDen = tp + fp
  const recallDen = tp + fn
  const precision = precisionDen === 0 ? 0 : tp / precisionDen
  const recall = recallDen === 0 ? 0 : tp / recallDen
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return {
    correct: tp,
    total: tp + fp + fn,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: round4(precision),
    recall: round4(recall),
    f1: round4(f1),
  }
}

/** Macro-average of a list of metrics (component-wise mean). */
export function macroAverage(metrics: ModelMetric[]): ModelMetric {
  if (metrics.length === 0) {
    const empty = rate(emptyConfusion())
    return empty
  }
  const sum = metrics.reduce(
    (acc, metric) => {
      acc.precision += metric.precision
      acc.recall += metric.recall
      acc.f1 += metric.f1
      acc.truePositives += metric.truePositives
      acc.falsePositives += metric.falsePositives
      acc.falseNegatives += metric.falseNegatives
      acc.correct += metric.correct
      acc.total += metric.total
      return acc
    },
    {
      precision: 0,
      recall: 0,
      f1: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      correct: 0,
      total: 0,
    },
  )
  const count = metrics.length
  return {
    correct: sum.correct,
    total: sum.total,
    truePositives: sum.truePositives,
    falsePositives: sum.falsePositives,
    falseNegatives: sum.falseNegatives,
    precision: round4(sum.precision / count),
    recall: round4(sum.recall / count),
    f1: round4(sum.f1 / count),
  }
}
