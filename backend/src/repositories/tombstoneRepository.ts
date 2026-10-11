import { TombstoneModel } from '../db/models/Tombstone'
import type { Tombstone } from '../types'

export async function persistTombstone(tombstone: Tombstone): Promise<void> {
  await TombstoneModel.replaceOne({ _id: tombstone.id }, { ...tombstone, _id: tombstone.id }, { upsert: true })
}

export async function listTombstones(filter?: { sessionId?: string }): Promise<Tombstone[]> {
  const query = filter?.sessionId ? { sessionId: filter.sessionId } : {}
  return TombstoneModel.find(query).sort({ deletedAt: -1 }).lean<Tombstone[]>().exec()
}

export async function countTombstones(): Promise<number> {
  return TombstoneModel.countDocuments().exec()
}

export async function deleteTombstonesBefore(iso: string): Promise<number> {
  const result = await TombstoneModel.deleteMany({ deletedAt: { $lt: iso } })
  return result.deletedCount ?? 0
}

export async function deleteTombstoneById(id: string): Promise<boolean> {
  const result = await TombstoneModel.deleteOne({ _id: id })
  return (result.deletedCount ?? 0) > 0
}

export async function clearTombstones(): Promise<void> {
  await TombstoneModel.deleteMany({})
}
