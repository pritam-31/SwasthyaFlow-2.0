/**
 * Security administration + account-security API (P1-12).
 *
 * Personal endpoints (`/auth/...`) work for any signed-in account; the admin
 * endpoints under `/security` require a system-admin / facility-admin session
 * and are always rejected server-side otherwise.
 */

import { request } from './api'
import type { AuthUser } from './api'
import type {
  AccountSession,
  Device,
  IpBlocklistEntry,
  LockoutView,
  SecurityEvent,
  SecurityPolicy,
  TwoFactorEnrollment,
} from '../types/security.types'

/* ---------------- Personal account security ------------- */

export interface ChangePasswordResult {
  ok: boolean
}

export function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  return request<ChangePasswordResult>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function fetchSessions(): Promise<AccountSession[]> {
  const res = await request<{ sessions: AccountSession[] }>('/auth/sessions')
  return res.sessions
}

export function revokeSession(sessionId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await request<{ devices: Device[] }>('/auth/devices')
  return res.devices
}

export function revokeDevice(deviceId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/auth/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
}

export async function startTwoFactorSetup(): Promise<TwoFactorEnrollment> {
  return request<TwoFactorEnrollment>('/auth/2fa/setup', { method: 'POST', body: '{}' })
}

export function enableTwoFactor(code: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) })
}

export function disableTwoFactor(code: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) })
}

/* ---------------- Admin security administration ------------- */

export async function fetchEffectivePolicy(): Promise<SecurityPolicy> {
  const res = await request<{ policy: SecurityPolicy }>('/security/policy')
  return res.policy
}

export async function listPolicies(): Promise<SecurityPolicy[]> {
  const res = await request<{ policies: SecurityPolicy[] }>('/security/policies')
  return res.policies
}

export function updatePolicy(patch: Partial<SecurityPolicy>): Promise<{ policy: SecurityPolicy }> {
  return request<{ policy: SecurityPolicy }>('/security/policy', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export interface SecurityEventFilter {
  type?: string
  since?: string
  scope?: 'facility' | 'all'
}

export async function fetchSecurityEvents(filter: SecurityEventFilter = {}): Promise<SecurityEvent[]> {
  const params = new URLSearchParams()
  if (filter.type) params.set('type', filter.type)
  if (filter.since) params.set('since', filter.since)
  if (filter.scope === 'all') params.set('scope', 'all')
  const query = params.toString()
  const res = await request<{ events: SecurityEvent[] }>(`/security/events${query ? `?${query}` : ''}`)
  return res.events
}

export async function fetchLockouts(): Promise<LockoutView[]> {
  const res = await request<{ lockouts: LockoutView[] }>('/security/lockouts')
  return res.lockouts
}

export function clearLockoutByKey(key: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/security/lockouts/${encodeURIComponent(key)}`, { method: 'DELETE' })
}

export async function fetchBlocklist(): Promise<IpBlocklistEntry[]> {
  const res = await request<{ entries: IpBlocklistEntry[] }>('/security/ip-blocklist')
  return res.entries
}

export interface BlockIpInput {
  ip: string
  reason: string
  durationMinutes?: number
}

export function blockIp(input: BlockIpInput): Promise<{ entry: IpBlocklistEntry }> {
  return request<{ entry: IpBlocklistEntry }>('/security/ip-blocklist', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function unblockIp(entryId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/security/ip-blocklist/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
}

export type { AuthUser }