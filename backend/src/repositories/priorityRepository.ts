import { PriorityOverrideModel } from '../db/models/PriorityOverrideModel'
import { SlaConfigModel } from '../db/models/SlaConfigModel'
import type { PriorityOverride, SlaConfig } from '../types'

/** Persistence for priority overrides + per-facility SLA config (P1-11). */

export interface StoredSlaConfig extends SlaConfig {
  facilityId: string
  updatedAt: string
  updatedBy: string
}

export async function appendOverride(entry: PriorityOverride): Promise<void> {
  await PriorityOverrideModel.replaceOne({ _id: entry.id }, { ...entry, _id: entry.id }, { upsert: true })
}

export async function listOverrides(): Promise<PriorityOverride[]> {
  return PriorityOverrideModel.find().sort({ createdAt: 1 }).lean<PriorityOverride[]>().exec()
}

export async function deleteOverride(id: string): Promise<void> {
  await PriorityOverrideModel.deleteOne({ _id: id })
}

export async function deleteOverridesForSession(sessionId: string): Promise<void> {
  await PriorityOverrideModel.deleteMany({ sessionId })
}

export async function upsertSlaConfig(config: StoredSlaConfig): Promise<void> {
  await SlaConfigModel.replaceOne(
    { _id: config.facilityId },
    { ...config, _id: config.facilityId },
    { upsert: true },
  )
}

export async function listSlaConfigs(): Promise<StoredSlaConfig[]> {
  return SlaConfigModel.find().lean<StoredSlaConfig[]>().exec()
}
