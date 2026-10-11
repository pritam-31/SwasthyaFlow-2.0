import { ConsentRecordModel } from '../db/models/ConsentRecord'
import { ConsentEventModel } from '../db/models/ConsentEventModel'
import { ConsentPolicyVersionModel } from '../db/models/ConsentPolicyVersionModel'
import { RedactionMapModel } from '../db/models/RedactionMap'
import type { ConsentEvent, ConsentPolicyVersion, ConsentRecord } from '../types'

export async function upsertConsent(record: ConsentRecord): Promise<void> {
  await ConsentRecordModel.replaceOne({ _id: record.consentRecordId }, { ...record, _id: record.consentRecordId }, { upsert: true })
}

export async function listConsent(): Promise<ConsentRecord[]> {
  return ConsentRecordModel.find().sort({ grantedAt: -1 }).lean<ConsentRecord[]>().exec()
}

export async function deleteConsentBySession(sessionId: string): Promise<boolean> {
  const result = await ConsentRecordModel.deleteOne({ sessionId })
  await ConsentEventModel.deleteMany({ sessionId })
  return (result.deletedCount ?? 0) > 0
}

export async function upsertConsentEvent(event: ConsentEvent): Promise<void> {
  await ConsentEventModel.replaceOne({ _id: event.id }, { ...event, _id: event.id }, { upsert: true })
}

export async function listConsentEvents(): Promise<ConsentEvent[]> {
  return ConsentEventModel.find().sort({ at: -1 }).lean<ConsentEvent[]>().exec()
}

export interface RedactionMapRecord {
  id: string
  sessionId: string
  createdAt: string
  entries: Array<{ category: string; count: number }>
}

export async function upsertRedactionMap(record: { id: string; sessionId: string; createdAt: string; entries: Array<{ category: string; count: number }> }): Promise<void> {
  await RedactionMapModel.replaceOne({ _id: record.id }, { ...record, _id: record.id }, { upsert: true })
}

export async function listRedactionMaps(): Promise<Array<Record<string, unknown>>> {
  return RedactionMapModel.find().lean<Array<Record<string, unknown>>>().exec()
}

export async function deleteRedactionMap(sessionId: string): Promise<void> {
  await RedactionMapModel.deleteOne({ sessionId })
}

export async function clearConsent(): Promise<void> {
  await ConsentRecordModel.deleteMany({})
  await ConsentEventModel.deleteMany({})
  await RedactionMapModel.deleteMany({})
}

export async function upsertConsentPolicyVersion(version: ConsentPolicyVersion): Promise<void> {
  await ConsentPolicyVersionModel.replaceOne({ _id: version.version }, { ...version, _id: version.version }, { upsert: true })
}

export async function listConsentPolicyVersions(): Promise<ConsentPolicyVersion[]> {
  return ConsentPolicyVersionModel.find().sort({ publishedAt: -1 }).lean<ConsentPolicyVersion[]>().exec()
}
