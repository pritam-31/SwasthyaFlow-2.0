/**
 * Offline sync contract (P1-8). Mirrored verbatim on the frontend in
 * `frontend/src/types/sync.types.ts` — keep both in step.
 *
 * Wire-safe: no Date objects, ISO strings only. Payloads are always already
 * anonymised; raw PII never appears in a queued item.
 */

import type { UserRole } from './index'

/** The offline-capable write actions. */
export type QueueActionType =
  | 'intake.create-text'
  | 'intake.create-voice'
  | 'report.attach-metadata'
  | 'visual.attach-metadata'
  | 'followup.add'
  | 'followup.answer'
  | 'note.edit'
  | 'note.accept'
  | 'note.finalize'
  | 'note.review'
  | 'note.reject'
  | 'note.return-to-intake'
  | 'note.escalate-senior'
  | 'note.escalation-decision'
  | 'timeline.add'
  | 'timeline.edit'
  | 'timeline.delete'
  | 'referral.draft'
  | 'referral.approve'
  | 'referral.checklist'
  | 'referral.checklist-override'
  | 'referral.status'
  | 'voice.metrics'
  | 'consent.revoke'
  | 'audit.log'
  | 'feedback.create'
  | 'feedback.update'
  | 'feedback.delete'

export const QUEUE_ACTION_TYPES: QueueActionType[] = [
  'intake.create-text',
  'intake.create-voice',
  'report.attach-metadata',
  'visual.attach-metadata',
  'followup.add',
  'followup.answer',
  'note.edit',
  'note.accept',
  'note.finalize',
  'note.review',
  'note.reject',
  'note.return-to-intake',
  'note.escalate-senior',
  'note.escalation-decision',
  'timeline.add',
  'timeline.edit',
  'timeline.delete',
  'referral.draft',
  'referral.approve',
  'referral.checklist',
  'referral.checklist-override',
  'referral.status',
  'voice.metrics',
  'consent.revoke',
  'audit.log',
  'feedback.create',
  'feedback.update',
  'feedback.delete',
]

export type QueueMethod = 'POST' | 'PATCH' | 'DELETE'

export type QueueStatus = 'pending' | 'in-flight' | 'failed' | 'conflict' | 'synced' | 'abandoned'

export interface ConflictField {
  name: string
  serverValue: unknown
  clientValue: unknown
}

export interface ConflictInfo {
  conflict: true
  entity: string
  serverVersion: string
  clientVersion: string
  fields: ConflictField[]
}

export interface QueuedItem {
  id: string
  actionType: QueueActionType
  endpoint: string
  method: QueueMethod
  /** Anonymised request payload. */
  payload: Record<string, unknown>
  sessionId?: string
  actorId: string
  actorRole: UserRole
  createdAt: string
  attemptCount: number
  lastAttemptAt: string | null
  /** Anonymised, human-readable failure reason. */
  lastError: string | null
  status: QueueStatus
  idempotencyKey: string
  /** Ids of queue items that must reach `synced` before this one may run. */
  dependencies: string[]
  conflictInfo: ConflictInfo | null
}

export type SyncItemStatus = 'synced' | 'conflict' | 'failed'

export interface SyncResult {
  id: string
  status: SyncItemStatus
  response?: unknown
  conflict?: ConflictInfo
  error?: string
  /** Field names for a validation failure. */
  fields?: string[]
}

export interface BatchResult {
  results: SyncResult[]
  serverVersion: string
}

export interface IdempotencyRecord {
  key: string
  payloadHash: string
  responseStatus: number
  responseBody: unknown
  createdAt: string
  expiresAt: string
}
