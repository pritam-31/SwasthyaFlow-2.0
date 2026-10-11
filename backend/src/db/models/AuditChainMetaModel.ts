import mongoose, { Schema } from 'mongoose'

/**
 * Per-facility audit hash-chain head (P2-16).
 *
 * One document per facility. `lastSequenceNumber`/`lastHash` are the tip of the
 * chain; `appendToChain` allocates the next sequence and links to `lastHash`.
 * The upsert uses `$max` on the sequence so a stale writer can never rewind it.
 */
export interface DbAuditChainMeta {
  _id: string
  chainId: string
  facilityId: string
  lastSequenceNumber: number
  lastHash: string
  entryCount: number
  updatedAt: string
}

const AuditChainMetaSchema = new Schema<DbAuditChainMeta>(
  {
    _id: { type: String, required: true },
    chainId: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true },
    lastSequenceNumber: { type: Number, required: true, default: 0 },
    lastHash: { type: String, required: true },
    entryCount: { type: Number, required: true, default: 0 },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

export const AuditChainMetaModel = mongoose.model<DbAuditChainMeta>(
  'AuditChainMeta',
  AuditChainMetaSchema,
  'audit_chain_meta',
)
