import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { listSlaConfigs, upsertSlaConfig, type StoredSlaConfig } from '../repositories/priorityRepository'
import { HttpError } from '../middleware/errorHandler'
import { listFacilities } from './facilityService'
import { anonymiseText } from './unifiedAnonymizer'
import type { PriorityBand, SlaConfig, SlaConfigUpdateInput, UserRole } from '../types'
import { PRIORITY_BANDS } from '../types/priority.types'

/**
 * SLA configuration service (P1-11).
 *
 * Each facility carries five wait-time thresholds (minutes), one per band. An
 * SLA is breached once a case has waited at least its band's threshold. The
 * thresholds are monotonic: a more urgent band can never wait longer than a less
 * urgent one (critical <= high <= medium <= low <= routine).
 */

const MIN_MINUTES = 1
const MAX_MINUTES = 1440

export const DEFAULT_SLA_CONFIG: SlaConfig = { critical: 5, high: 15, medium: 60, low: 180, routine: 360 }

const configs = new Map<string, SlaConfig>()

export function getSlaConfig(facilityId: string): SlaConfig {
  return configs.get(facilityId) ?? { ...DEFAULT_SLA_CONFIG }
}

export function slaMinutesFor(config: SlaConfig, band: PriorityBand): number {
  return config[band]
}

function validate(input: SlaConfig): SlaConfig {
  const cleaned = {} as SlaConfig
  for (const band of PRIORITY_BANDS) {
    const value = input[band]
    if (!Number.isInteger(value) || value < MIN_MINUTES || value > MAX_MINUTES) {
      throw new HttpError(400, `sla.${band} must be an integer between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`)
    }
    cleaned[band] = value
  }
  for (let i = 1; i < PRIORITY_BANDS.length; i += 1) {
    const previous = cleaned[PRIORITY_BANDS[i - 1]]
    const current = cleaned[PRIORITY_BANDS[i]]
    if (previous > current) {
      throw new HttpError(
        400,
        `SLA thresholds must increase with decreasing urgency (${PRIORITY_BANDS[i - 1]} <= ${PRIORITY_BANDS[i]}).`,
      )
    }
  }
  return cleaned
}

export function setSlaConfig(
  facilityId: string,
  input: SlaConfigUpdateInput,
  actor: { id: string; name: string; role: UserRole },
): SlaConfig {
  const merged: SlaConfig = { ...getSlaConfig(facilityId) }
  for (const band of PRIORITY_BANDS) {
    const value = input[band]
    if (value !== undefined) merged[band] = value
  }
  const validated = validate(merged)
  configs.set(facilityId, validated)
  if (persistenceEnabled()) {
    enqueue('sla:' + facilityId, () =>
      upsertSlaConfig({
        facilityId,
        ...validated,
        updatedAt: new Date().toISOString(),
        updatedBy: anonymiseText(actor.name, 'audit-detail').text,
      }),
    )
  }
  return { ...validated }
}

/** Test / reset helper. */
export function clearSlaConfigs(): void {
  configs.clear()
}

/** Seeds the default thresholds for any facility that has none yet. */
export function seedDefaultSlaConfigs(): number {
  let seeded = 0
  for (const facility of listFacilities()) {
    if (configs.has(facility.id)) continue
    configs.set(facility.id, { ...DEFAULT_SLA_CONFIG })
    seeded += 1
    if (persistenceEnabled()) {
      enqueue('sla:' + facility.id, () =>
        upsertSlaConfig({
          facilityId: facility.id,
          ...DEFAULT_SLA_CONFIG,
          updatedAt: new Date().toISOString(),
          updatedBy: 'Seed',
        }),
      )
    }
  }
  return seeded
}

/** Loads persisted SLA configs on boot (persistent mode only). */
export async function hydrateSlaConfigs(): Promise<void> {
  const rows = await listSlaConfigs()
  configs.clear()
  for (const row of rows as StoredSlaConfig[]) {
    configs.set(row.facilityId, {
      critical: row.critical,
      high: row.high,
      medium: row.medium,
      low: row.low,
      routine: row.routine,
    })
  }
}
