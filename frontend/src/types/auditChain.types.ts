/**
 * Audit immutability + export wire types (P2-16).
 *
 * Mirrors backend/src/types/auditChain.types.ts. Every audit entry is chained
 * per facility (SHA-256), so the API returns the base audit fields plus the
 * chain position. The backend owns the chain math and the non-diagnostic guard;
 * this module only describes the shapes the UI renders.
 */

import type { AuditCategory, UserRole } from './triage'
import type { LanguageCode } from './language.types'

export const AUDIT_EXPORT_FORMATS = ['csv', 'json', 'pdf'] as const
export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number]

export const AUDIT_EXPORT_LABELS: Record<AuditExportFormat, string> = {
  csv: 'CSV (spreadsheet)',
  json: 'JSON (machine-readable)',
  pdf: 'PDF (human-readable report)',
}

/** An audit entry with its position in the per-facility hash chain. */
export interface AuditChainEntry {
  id: string
  sessionId: string
  facilityId: string
  actor: string
  role: UserRole
  action: string
  detail: string
  category: AuditCategory
  at: string
  offlineOrigin?: boolean
  queuedAt?: string
  syncedAt?: string
  sequenceNumber: number
  previousHash: string
  hash: string
  hashAlgorithm: string
  chainId: string
  pruned: boolean
  prunedAt?: string | null
  prunedBy?: string | null
  retentionRule?: string | null
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
  facilityId?: string
  since?: string
  until?: string
  actions?: string[]
  categories?: AuditCategory[]
  actorRoles?: UserRole[]
  sessionId?: string
  actor?: string
  search?: string
  limit?: number
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
  language?: LanguageCode
}

export interface AuditExportResult {
  ref: string
  sizeBytes: number
  mimeType: string
  recordCount: number
  format: AuditExportFormat
  createdAt: string
}
