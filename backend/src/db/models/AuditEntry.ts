import mongoose, { Schema } from 'mongoose'

export interface DbAuditEntry {
  _id: string
  id: string
  sessionId: string
  facilityId: string
  actor: string
  role: string
  action: string
  detail: string
  category: 'view' | 'edit' | 'decision' | 'export' | 'auth' | 'system'
  at: string
  offlineOrigin?: boolean
  queuedAt?: string
  syncedAt?: string
  /** Per-facility hash-chain fields (P2-16). */
  sequenceNumber?: number
  previousHash?: string
  hash?: string
  hashAlgorithm?: string
  chainId?: string
  pruned?: boolean
  prunedAt?: string | null
  prunedBy?: string | null
  retentionRule?: string | null
  prunedHash?: string | null
}

const AuditEntrySchema = new Schema<DbAuditEntry>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    sessionId: { type: String, required: true, index: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    actor: { type: String, required: true },
    role: { type: String, required: true },
    action: { type: String, required: true },
    detail: { type: String, required: true },
    category: { type: String, enum: ['view', 'edit', 'decision', 'export', 'auth', 'system'], required: true },
    at: { type: String, required: true, index: true },
    offlineOrigin: { type: Boolean, required: false },
    queuedAt: { type: String, required: false },
    syncedAt: { type: String, required: false },
    sequenceNumber: { type: Number, required: false, index: true },
    previousHash: { type: String, required: false },
    hash: { type: String, required: false },
    hashAlgorithm: { type: String, required: false },
    chainId: { type: String, required: false, index: true },
    pruned: { type: Boolean, required: false, default: false },
    prunedAt: { type: String, required: false, default: null },
    prunedBy: { type: String, required: false, default: null },
    retentionRule: { type: String, required: false, default: null },
    prunedHash: { type: String, required: false, default: null },
  },
  { versionKey: false, _id: false },
)

// Sparse compound indexes so pre-chain (legacy) rows never collide on build.
AuditEntrySchema.index({ chainId: 1, sequenceNumber: 1 }, { unique: true, sparse: true })
AuditEntrySchema.index({ chainId: 1, hash: 1 }, { unique: true, sparse: true })

export const AuditEntryModel = mongoose.model<DbAuditEntry>('AuditEntry', AuditEntrySchema, 'audit_entries')
