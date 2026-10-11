import { ConfidencePolicyModel, type DbConfidencePolicy } from '../db/models/ConfidencePolicyModel'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import {
  CONFIDENCE_POLICY_BOUNDS,
  DEFAULT_CONFIDENCE_THRESHOLDS,
} from './confidenceService'
import type {
  ConfidencePolicy,
  ConfidenceThresholds,
} from '../types/confidence.types'

/**
 * Per-facility confidence-threshold policy service (P2-14).
 *
 * The `global` policy is the system-wide default every facility inherits unless
 * it has its own row. Thresholds are validated against fixed bounds so an admin
 * can never configure an inverted or out-of-range band. A policy holds only
 * numeric workflow thresholds — never patient data, never anything clinical.
 */

export const GLOBAL_FACILITY_ID = 'global'

export interface ThresholdValidationResult {
  ok: boolean
  errors: string[]
}

const inMemoryPolicies = new Map<string, ConfidencePolicy>()

function cloneThresholds(thresholds: ConfidenceThresholds): ConfidenceThresholds {
  return { ...thresholds }
}

function clonePolicy(policy: ConfidencePolicy): ConfidencePolicy {
  return { ...policy, thresholds: cloneThresholds(policy.thresholds) }
}

function fromDoc(doc: DbConfidencePolicy): ConfidencePolicy {
  const thresholds = (doc.thresholds as unknown as ConfidenceThresholds) ?? DEFAULT_CONFIDENCE_THRESHOLDS
  return {
    facilityId: doc.facilityId,
    thresholds: {
      lowConfidenceThreshold: thresholds.lowConfidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLDS.lowConfidenceThreshold,
      veryLowConfidenceThreshold: thresholds.veryLowConfidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLDS.veryLowConfidenceThreshold,
      aggregateAlertThreshold: thresholds.aggregateAlertThreshold ?? DEFAULT_CONFIDENCE_THRESHOLDS.aggregateAlertThreshold,
    },
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  }
}

/**
 * Validates a candidate threshold set against the fixed bounds. Returns generic
 * message keys (never a value that could leak data). Hard rules:
 *  - every threshold inside [0.05, 0.99]
 *  - lowConfidenceThreshold > veryLowConfidenceThreshold (bands stay ordered)
 */
export function validateThresholds(thresholds: ConfidenceThresholds): ThresholdValidationResult {
  const errors: string[] = []
  const { lowConfidenceThreshold, veryLowConfidenceThreshold, aggregateAlertThreshold } = thresholds
  const { lowConfidenceThreshold: lowB, veryLowConfidenceThreshold: veryLowB, aggregateAlertThreshold: aggB } =
    CONFIDENCE_POLICY_BOUNDS

  const within = (v: number, b: { min: number; max: number }) =>
    Number.isFinite(v) && v >= b.min && v <= b.max

  if (!within(lowConfidenceThreshold, lowB)) errors.push('confidence.low-out-of-bounds')
  if (!within(veryLowConfidenceThreshold, veryLowB)) errors.push('confidence.very-low-out-of-bounds')
  if (!within(aggregateAlertThreshold, aggB)) errors.push('confidence.aggregate-out-of-bounds')
  if (errors.length === 0 && !(lowConfidenceThreshold > veryLowConfidenceThreshold)) {
    errors.push('confidence.low-must-exceed-very-low')
  }
  return { ok: errors.length === 0, errors }
}

/** Seeds the global default policy (idempotent). */
export async function seedGlobalConfidencePolicy(): Promise<void> {
  if (persistenceEnabled()) {
    const existing = await ConfidencePolicyModel.findOne({ facilityId: GLOBAL_FACILITY_ID }).lean().exec()
    if (existing) return
    await ConfidencePolicyModel.create({
      _id: GLOBAL_FACILITY_ID,
      policyId: GLOBAL_FACILITY_ID,
      facilityId: GLOBAL_FACILITY_ID,
      thresholds: { ...DEFAULT_CONFIDENCE_THRESHOLDS },
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    })
    return
  }
  if (!inMemoryPolicies.has(GLOBAL_FACILITY_ID)) {
    inMemoryPolicies.set(GLOBAL_FACILITY_ID, {
      facilityId: GLOBAL_FACILITY_ID,
      thresholds: cloneThresholds(DEFAULT_CONFIDENCE_THRESHOLDS),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    })
  }
}

/** Loads saved policies into memory on boot (persistent mode only). */
export async function hydrateConfidencePolicies(): Promise<void> {
  if (!persistenceEnabled()) {
    await seedGlobalConfidencePolicy()
    return
  }
  const rows = await ConfidencePolicyModel.find().lean<DbConfidencePolicy[]>().exec()
  inMemoryPolicies.clear()
  for (const row of rows) inMemoryPolicies.set(row.facilityId, fromDoc(row))
  if (!inMemoryPolicies.has(GLOBAL_FACILITY_ID)) await seedGlobalConfidencePolicy()
}

/** Returns the effective policy for a facility (its own row, else the global default). */
export async function getEffectivePolicy(facilityId: string): Promise<ConfidencePolicy> {
  if (persistenceEnabled()) {
    const row = await ConfidencePolicyModel.findOne({ facilityId }).lean<DbConfidencePolicy>().exec()
    if (row) return fromDoc(row)
    const global = await ConfidencePolicyModel
      .findOne({ facilityId: GLOBAL_FACILITY_ID })
      .lean<DbConfidencePolicy>()
      .exec()
    return global ? fromDoc(global) : { facilityId, thresholds: cloneThresholds(DEFAULT_CONFIDENCE_THRESHOLDS), updatedAt: new Date().toISOString(), updatedBy: 'system' }
  }
  return clonePolicy(inMemoryPolicies.get(facilityId) ?? inMemoryPolicies.get(GLOBAL_FACILITY_ID) ?? { facilityId, thresholds: DEFAULT_CONFIDENCE_THRESHOLDS, updatedAt: new Date().toISOString(), updatedBy: 'system' })
}

/** Convenience wrapper: only the thresholds in force for a facility. */
export async function getEffectiveThresholds(facilityId: string): Promise<ConfidenceThresholds> {
  const policy = await getEffectivePolicy(facilityId)
  return cloneThresholds(policy.thresholds)
}

/** Applies a validated partial threshold update, clamping every value in bounds. */
export async function updateThresholds(
  facilityId: string,
  patch: Partial<ConfidenceThresholds>,
  actor: { id: string; role: string },
): Promise<ConfidencePolicy> {
  const current = await getEffectivePolicy(facilityId)
  const next: ConfidenceThresholds = {
    lowConfidenceThreshold: clamp(patch.lowConfidenceThreshold ?? current.thresholds.lowConfidenceThreshold, CONFIDENCE_POLICY_BOUNDS.lowConfidenceThreshold.min, CONFIDENCE_POLICY_BOUNDS.lowConfidenceThreshold.max),
    veryLowConfidenceThreshold: clamp(patch.veryLowConfidenceThreshold ?? current.thresholds.veryLowConfidenceThreshold, CONFIDENCE_POLICY_BOUNDS.veryLowConfidenceThreshold.min, CONFIDENCE_POLICY_BOUNDS.veryLowConfidenceThreshold.max),
    aggregateAlertThreshold: clamp(patch.aggregateAlertThreshold ?? current.thresholds.aggregateAlertThreshold, CONFIDENCE_POLICY_BOUNDS.aggregateAlertThreshold.min, CONFIDENCE_POLICY_BOUNDS.aggregateAlertThreshold.max),
  }
  const validation = validateThresholds(next)
  if (!validation.ok) {
    const error = new Error(validation.errors.join(',')) as Error & { status?: number; code?: string }
    error.status = 400
    error.code = validation.errors[0]
    throw error
  }

  const policy: ConfidencePolicy = {
    facilityId,
    thresholds: next,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  }

  if (persistenceEnabled()) {
    await ConfidencePolicyModel.replaceOne(
      { facilityId },
      {
        _id: facilityId,
        policyId: facilityId,
        facilityId,
        thresholds: next,
        updatedAt: policy.updatedAt,
        updatedBy: policy.updatedBy,
      },
      { upsert: true },
    )
  }
  inMemoryPolicies.set(facilityId, clonePolicy(policy))
  return clonePolicy(policy)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Persistent-mode write helper used by tests/scripts. */
export function persistConfidencePolicyWrite(facilityId: string, policy: ConfidencePolicy): void {
  if (!persistenceEnabled()) return
  enqueue('confidence-policy:' + facilityId, async () => {
    await ConfidencePolicyModel.replaceOne(
      { facilityId },
      {
        _id: facilityId,
        policyId: facilityId,
        facilityId,
        thresholds: policy.thresholds,
        updatedAt: policy.updatedAt ?? new Date().toISOString(),
        updatedBy: policy.updatedBy ?? 'system',
      },
      { upsert: true },
    )
  })
}

/** Test-only reset. */
export function clearConfidencePoliciesMemory(): void {
  inMemoryPolicies.clear()
}
