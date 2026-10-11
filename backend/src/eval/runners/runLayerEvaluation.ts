import type { BiasSliceDimension, LayerEvaluation, LayerId, ModelMetric } from '../../types/modelcard.types'
import { ALL_BIAS_DIMENSIONS, ALL_LAYER_IDS } from '../../types/modelcard.types'
import type { DatasetRecord } from '../dataset.types'
import { LAYER_DIMENSION, sliceKey, sliceValues } from '../slices'
import { addConfusion, emptyConfusion, macroAverage, rate, type Confusion } from '../metrics/precisionRecallF1'
import type { SliceBucket } from '../metrics/fairness'

/**
 * Per-layer, per-slice evaluation (P2-13). Each layer is reported on its
 * assigned dimension; the same samples are also pooled per dimension so the
 * fairness pass can compare slices regardless of which layer produced them.
 */

export interface LayerEvaluationResult {
  evaluations: LayerEvaluation[]
  /** Macro-average metric per layer (over the measured slices of its dimension). */
  layerMacro: Record<LayerId, ModelMetric>
  /** Pooled buckets per dimension, used by the fairness pass. */
  pooled: Map<BiasSliceDimension, Map<string, SliceBucket>>
  /** Slice keys (e.g. `language=en`) with no samples. */
  missingSlices: string[]
  completedLayers: LayerId[]
}

function recordValue(record: DatasetRecord, dimension: BiasSliceDimension): string {
  return record[dimension]
}

function bucketAdd(bucket: SliceBucket, sample: { truePositives: number; falsePositives: number; falseNegatives: number }): void {
  const add: Confusion = {
    truePositives: sample.truePositives,
    falsePositives: sample.falsePositives,
    falseNegatives: sample.falseNegatives,
  }
  addConfusion(bucket.confusion, add)
  bucket.sampleCount += 1
}

export function runLayerEvaluation(records: DatasetRecord[]): LayerEvaluationResult {
  const layerBuckets = new Map<LayerId, Map<string, SliceBucket>>()
  for (const layerId of ALL_LAYER_IDS) layerBuckets.set(layerId, new Map())

  const pooled = new Map<BiasSliceDimension, Map<string, SliceBucket>>()
  for (const dimension of ALL_BIAS_DIMENSIONS) {
    const byValue = new Map<string, SliceBucket>()
    for (const value of sliceValues(dimension)) byValue.set(value, { confusion: emptyConfusion(), sampleCount: 0 })
    pooled.set(dimension, byValue)
  }

  for (const record of records) {
    for (const sample of record.samples) {
      const dimension = LAYER_DIMENSION[sample.layerId]
      const value = recordValue(record, dimension)
      const layerMap = layerBuckets.get(sample.layerId)
      if (layerMap) {
        const bucket = layerMap.get(value) ?? { confusion: emptyConfusion(), sampleCount: 0 }
        bucketAdd(bucket, sample)
        layerMap.set(value, bucket)
      }
      // Pool every dimension so fairness can compare slices a layer does not
      // primarily target (e.g. facilityType, which no layer is assigned to).
      for (const pooledDimension of ALL_BIAS_DIMENSIONS) {
        const pooledMap = pooled.get(pooledDimension)
        if (!pooledMap) continue
        const pooledValue = recordValue(record, pooledDimension)
        const bucket = pooledMap.get(pooledValue) ?? { confusion: emptyConfusion(), sampleCount: 0 }
        bucketAdd(bucket, sample)
        pooledMap.set(pooledValue, bucket)
      }
    }
  }

  const evaluations: LayerEvaluation[] = []
  const layerMacro: Record<LayerId, ModelMetric> = {} as Record<LayerId, ModelMetric>
  const completedLayers: LayerId[] = []

  for (const layerId of ALL_LAYER_IDS) {
    const dimension = LAYER_DIMENSION[layerId]
    const layerMap = layerBuckets.get(layerId) ?? new Map<string, SliceBucket>()
    const measured: ModelMetric[] = []
    for (const value of sliceValues(dimension)) {
      const bucket = layerMap.get(value) ?? { confusion: emptyConfusion(), sampleCount: 0 }
      const metric = rate(bucket.confusion)
      evaluations.push({
        layerId,
        evaluationId: `${layerId}-${dimension}-${value}`,
        slice: { dimension, value },
        metric,
        sampleCount: bucket.sampleCount,
      })
      if (bucket.sampleCount > 0) measured.push(metric)
    }
    layerMacro[layerId] = macroAverage(measured)
    if (measured.length > 0) completedLayers.push(layerId)
  }

  const missingSlices: string[] = []
  for (const dimension of ALL_BIAS_DIMENSIONS) {
    const byValue = pooled.get(dimension)
    if (!byValue) continue
    for (const [value, bucket] of byValue.entries()) {
      if (bucket.sampleCount === 0) missingSlices.push(sliceKey(dimension, value))
    }
  }

  return { evaluations, layerMacro, pooled, missingSlices, completedLayers }
}
