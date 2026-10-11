import { createHash } from 'node:crypto'
import type { AuditEntry, UserRole } from './index'
import type { SupportedLanguage } from './language.types'

/**
 * Audit immutability + export (P2-16).
 *
 * Every `AuditEntry` is chained per facility: the SHA-256 hash of an entry binds
 * its fields to the previous entry's hash, so altering any past entry breaks
 * every following hash. The chain is append-only; the retention sweep "prunes"
 * entries (tombstones) rather than deleting them so continuity survives.
 *
 * Note on field names: the persisted audit entry uses `at` (ISO timestamp),
 * `actor` (display name) and `role`, so the canonical serialisation and the
 * chain metadata use those names. No PII is ever part of a hash input.
 */

/** Documented genesis constant — sha256 of the chain seed string. */
const GENESIS_SEED = 'SwasthyaFlow:audit:genesis:v1'
export const GENESIS_HASH = createHash('sha256').update(GENESIS_SEED, 'utf8').digest('hex')

export const HASH_ALGORITHM = 'sha256-v1' as const

export const AUDIT_EXPORT_FORMATS = ['csv', 'json', 'pdf'] as const
export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number]

export const AUDIT_EXPORT_MIME: Record<AuditExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  pdf: 'application/pdf',
}

/** 50 MB hard cap per export file. */
export const AUDIT_EXPORT_MAX_BYTES = 50 * 1024 * 1024

export type AuditCategory = AuditEntry['category']

/**
 * An audit entry with its position in the per-facility hash chain.
 *
 * `pruned` entries keep `id`, `sequenceNumber`, `previousHash`, `hash` and
 * `hashAlgorithm` (so the chain still links), but drop `detail`, `sessionId`,
 * `actor` and offline-origin metadata. `prunedHash` binds the tombstone shape
 * to the original hash, so pruned entries remain verifiable.
 */
export interface AuditChainEntry extends AuditEntry {
  /** Per-facility monotonic position, starting at 1. */
  sequenceNumber: number
  /** Previous entry's hash, or GENESIS_HASH for the first entry of a facility. */
  previousHash: string
  /** sha256(sha256-v1) over the canonical serialisation. */
  hash: string
  hashAlgorithm: typeof HASH_ALGORITHM
  /** Equals facilityId — one chain per facility. */
  chainId: string
  /** True once the retention sweep replaced the original content with a tombstone. */
  pruned: boolean
  prunedAt?: string | null
  prunedBy?: string | null
  retentionRule?: string | null
  /** sha256 of the pruned shape + the original hash (verification for pruned rows). */
  prunedHash?: string | null
}

export interface ChainVerificationResult {
  valid: boolean
  checkedEntries: number
  firstInvalidSequence?: number
  reason?: string
  verifiedAt: string
  facilityId: string
}

export interface EntryVerificationResult {
  valid: boolean
  sequenceNumber: number
  reason?: string
  verifiedAt: string
  facilityId: string
}

export interface AuditChainMeta {
  chainId: string
  facilityId: string
  lastSequenceNumber: number
  lastHash: string
  entryCount: number
  updatedAt: string
}

export interface AuditFilter {
  facilityId: string
  since?: string
  until?: string
  actions?: string[]
  categories?: AuditCategory[]
  actorRoles?: UserRole[]
  sessionId?: string
  actor?: string
  /** Free-text over action + detail (1..100 chars, regex-bounded). */
  search?: string
  /** 1..1000; defaults to 50. */
  limit?: number
  /** base64 of the last sequenceNumber seen (pagination). */
  cursor?: string
  sort?: 'asc' | 'desc'
}

export interface AuditPagedResult {
  items: AuditChainEntry[]
  nextCursor: string | null
  total: number
}

export interface AuditExportRequest {
  filter: AuditFilter
  format: AuditExportFormat
  language?: SupportedLanguage
}

export interface AuditExportResult {
  ref: string
  sizeBytes: number
  mimeType: string
  recordCount: number
  format: AuditExportFormat
  createdAt: string
}
