/**
 * Audit trail + hash-chain client (P2-16).
 *
 * The backend owns the chain math, verification, retention pruning and the
 * export bundle. This module only moves typed requests across the wire,
 * mirroring backend/src/routes/audit.routes.ts. RBAC is enforced server-side;
 * the UI only hides what a role may not use.
 *
 * Reads are offline-aware (`cachedRead`) so a reviewer can still see the last
 * trail they loaded. Verification and export are online-only and raise
 * `OfflineUnavailableError` when the backend is unreachable — a chain cannot be
 * verified or a file produced without the server.
 */

import { fetchBlobUrl, request } from './api'
import { OfflineUnavailableError, cachedRead, CACHE_KEYS } from './offlineApi'
import { isOffline } from './syncService'
import type {
  AuditChainMeta,
  AuditExportFormat,
  AuditExportRequest,
  AuditExportResult,
  AuditFilter,
  AuditPagedResult,
  ChainVerificationResult,
  EntryVerificationResult,
} from '../types/auditChain.types'

function requireOnline(): void {
  if (isOffline()) throw new OfflineUnavailableError()
}

function encodeFilter(filter: AuditFilter): string {
  const params = new URLSearchParams()
  const set = (key: string, value: unknown): void => {
    if (typeof value === 'string' && value) params.set(key, value)
  }
  set('since', filter.since)
  set('until', filter.until)
  set('sessionId', filter.sessionId)
  set('actor', filter.actor)
  set('search', filter.search)
  set('cursor', filter.cursor)
  set('sort', filter.sort)
  if (typeof filter.limit === 'number') params.set('limit', String(filter.limit))
  if (filter.actions?.length) params.set('actions', filter.actions.join(','))
  if (filter.categories?.length) params.set('categories', filter.categories.join(','))
  if (filter.actorRoles?.length) params.set('actorRoles', filter.actorRoles.join(','))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Stable, non-PII cache key for a filter (facility + serialised query). */
function filterCacheKey(filter: AuditFilter): string {
  return encodeFilter(filter).replace(/[?&=]/g, '-').slice(0, 120) || 'all'
}

/* ---------------- Reads (offline-aware) ---------------- */

/** One page of the facility trail, newest first by default. Offline-aware. */
export function fetchAuditPaged(filter: AuditFilter): Promise<AuditPagedResult> {
  const facilityId = filter.facilityId ?? 'default'
  return cachedRead(CACHE_KEYS.auditChain(facilityId, filterCacheKey(filter)), () =>
    request<AuditPagedResult>(`/audit/paged${encodeFilter(filter)}`),
  )
}

/** Bounded free-text search over action + detail. Offline-aware. */
export function searchAudit(filter: AuditFilter): Promise<{ entries: unknown[] }> {
  const facilityId = filter.facilityId ?? 'default'
  return cachedRead(CACHE_KEYS.auditChain(facilityId, `search-${filterCacheKey(filter)}`), () =>
    request<{ entries: unknown[] }>(`/audit/search${encodeFilter(filter)}`),
  )
}

/** The chain head metadata for a facility. Offline-aware. */
export function fetchChainMeta(facilityId: string): Promise<AuditChainMeta> {
  return cachedRead(CACHE_KEYS.auditChainMeta(facilityId), () =>
    request<AuditChainMeta>(`/audit/chain/${encodeURIComponent(facilityId)}/meta`),
  )
}

/* ---------------- Verification (online-only) ---------------- */

/** Recompute + verify a facility's whole chain. Online-only. */
export function verifyChain(facilityId: string): Promise<ChainVerificationResult> {
  requireOnline()
  return request<ChainVerificationResult>(`/audit/chain/${encodeURIComponent(facilityId)}/verify`)
}

/** Verify a single chained entry by sequence number. Online-only. */
export function verifyEntry(facilityId: string, sequenceNumber: number): Promise<EntryVerificationResult> {
  requireOnline()
  return request<EntryVerificationResult>(
    `/audit/chain/${encodeURIComponent(facilityId)}/entry/${sequenceNumber}/verify`,
  )
}

/* ---------------- Export (online-only) ---------------- */

/** Build a retention-aware, anonymised export. Online-only. */
export function exportAudit(input: AuditExportRequest): Promise<AuditExportResult> {
  requireOnline()
  return request<AuditExportResult>('/audit/export', { method: 'POST', body: JSON.stringify(input) })
}

/**
 * Download a previously built export as a file. Online-only. The export lives
 * under the short-lived (`export-files`) retention bucket, so it can expire.
 */
export async function downloadAuditExport(ref: string, format: AuditExportFormat): Promise<void> {
  requireOnline()
  const url = await fetchBlobUrl(`/audit/export/${encodeURIComponent(ref)}`)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `audit-export-${ref}.${format}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
