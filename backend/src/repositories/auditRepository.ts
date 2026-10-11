import { AuditEntryModel } from '../db/models/AuditEntry'
import { AuditChainMetaModel } from '../db/models/AuditChainMetaModel'
import type { AuditEntry } from '../types'
import type { AuditChainEntry, AuditChainMeta } from '../types/auditChain.types'

/** An audit row as stored: chain fields are optional for legacy (pre-P2-16) rows. */
export type StoredAuditEntry = AuditEntry &
  Partial<
    Pick<
      AuditChainEntry,
      'sequenceNumber' | 'previousHash' | 'hash' | 'hashAlgorithm' | 'chainId' | 'pruned' | 'prunedAt' | 'prunedBy' | 'retentionRule' | 'prunedHash'
    >
  >

export async function appendAudit(entry: AuditEntry): Promise<void> {
  await AuditEntryModel.replaceOne({ _id: entry.id }, { ...entry, _id: entry.id }, { upsert: true })
}

/** Persists the chain head for one facility. `$max` guarantees no rewind. */
export async function upsertChainMeta(meta: AuditChainMeta): Promise<void> {
  await AuditChainMetaModel.findOneAndUpdate(
    { _id: meta.chainId },
    {
      $set: {
        chainId: meta.chainId,
        facilityId: meta.facilityId,
        lastHash: meta.lastHash,
        entryCount: meta.entryCount,
        updatedAt: meta.updatedAt,
      },
      $max: { lastSequenceNumber: meta.lastSequenceNumber },
    },
    { upsert: true },
  ).exec()
}

export async function loadChainMeta(): Promise<AuditChainMeta[]> {
  return AuditChainMetaModel.find().lean<AuditChainMeta[]>().exec()
}

export async function listAudit(): Promise<StoredAuditEntry[]> {
  return AuditEntryModel.find().sort({ at: 1 }).lean<StoredAuditEntry[]>().exec()
}

export async function deleteAuditBefore(iso: string): Promise<number> {
  const result = await AuditEntryModel.deleteMany({ at: { $lt: iso } })
  return result.deletedCount ?? 0
}

export async function deleteAuditById(id: string): Promise<boolean> {
  const result = await AuditEntryModel.deleteOne({ _id: id })
  return (result.deletedCount ?? 0) > 0
}

export async function clearAudit(): Promise<void> {
  await AuditEntryModel.deleteMany({})
}
