import type { UserRole } from '../types/triage'

/**
 * Security domain model (P1-12) — mirrors
 * `backend/src/types/security.types.ts`. Security events contain no PII;
 * identifiers are pseudonymised server-side before storage.
 */

export interface PasswordPolicy {
  minLength: number
  requireLetter: boolean
  requireDigit: boolean
  requireSymbol: boolean
  blockCommon: boolean
  blockUsername: boolean
  /** 0 = never expire. */
  expiryDays: number
}

export interface LockoutPolicy {
  maxFailures: number
  baseLockoutMinutes: number
  exponential: boolean
  maxLockoutMinutes: number
}

export interface SessionPolicy {
  accessTokenMinutes: number
  refreshTokenDays: number
  concurrentSessionLimit: number
  deviceBinding: boolean
}

export interface TwoFactorPolicy {
  required: boolean
  allowedRoles: UserRole[]
}

export interface IpAllowlistPolicy {
  enabled: boolean
  cidrs: string[]
}

export interface RateLimitPolicy {
  globalPerMinute: number
  authPerMinute: number
  sensitivePerMinute: number
  uploadPerMinute: number
  syncPerMinute: number
}

export interface SecurityPolicy {
  facilityId: string
  password: PasswordPolicy
  lockout: LockoutPolicy
  session: SessionPolicy
  twoFactor: TwoFactorPolicy
  ipAllowlist: IpAllowlistPolicy
  rateLimit: RateLimitPolicy
  updatedAt?: string
  updatedBy?: string
}

export type SecurityEventType =
  | 'auth.login-success'
  | 'auth.login-failure'
  | 'auth.logout'
  | 'auth.logout-all'
  | 'auth.token-refresh'
  | 'auth.token-refresh-reuse-detected'
  | 'auth.password-changed'
  | 'auth.password-reset-requested'
  | 'auth.session-revoked'
  | 'auth.all-sessions-revoked'
  | 'auth.device-revoked'
  | 'auth.2fa-enabled'
  | 'auth.2fa-disabled'
  | 'auth.2fa-verified'
  | 'auth.2fa-failed'
  | 'security.rate-limit-exceeded'
  | 'security.csrf-failure'
  | 'security.invalid-input'
  | 'security.nosql-injection-attempt'
  | 'security.path-traversal-attempt'
  | 'security.suspicious-ua'
  | 'security.ip-blocked'
  | 'security.ip-unblocked'
  | 'security.ip-not-allowed'
  | 'security.policy-updated'
  | 'security.lockout-triggered'
  | 'security.lockout-cleared'

export interface SecurityEvent {
  id: string
  type: SecurityEventType
  actorId?: string
  actorRole?: UserRole
  facilityId?: string
  ip?: string
  userAgent?: string
  detail: string
  requestId?: string
  createdAt: string
}

export interface Device {
  deviceId: string
  userId: string
  fingerprintHash: string
  userAgent: string
  firstSeenAt: string
  lastSeenAt: string
  ip: string
  revokedAt?: string
}

export interface IpBlocklistEntry {
  entryId: string
  ip: string
  reason: string
  blockedAt: string
  expiresAt?: string
  blockedBy: string
}

/** Lockout rows expose the hashed key only — never a username/IP. */
export interface LockoutView {
  key: string
  failures: number
  locked: boolean
  lockedUntil?: string
  lockCount: number
}

/** A live access session (the SHORT-lived window, not the refresh token). */
export interface AccountSession {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
  lastSeenAt?: string
  ip?: string
  userAgent?: string
  deviceFingerprintHash?: string
  activeFacilityId?: string
  /** True when this row is the session currently issuing requests. */
  current?: boolean
}

export interface TwoFactorEnrollment {
  otpauthUrl: string
  qrDataUrl: string
  secret: string
}

export function defaultPasswordPolicy(): PasswordPolicy {
  return {
    minLength: 12,
    requireLetter: true,
    requireDigit: true,
    requireSymbol: true,
    blockCommon: true,
    blockUsername: true,
    expiryDays: 0,
  }
}

export function defaultLockoutPolicy(): LockoutPolicy {
  return { maxFailures: 5, baseLockoutMinutes: 15, exponential: true, maxLockoutMinutes: 1440 }
}

export function defaultSessionPolicy(): SessionPolicy {
  return { accessTokenMinutes: 15, refreshTokenDays: 30, concurrentSessionLimit: 6, deviceBinding: true }
}

export function defaultTwoFactorPolicy(): TwoFactorPolicy {
  return { required: false, allowedRoles: ['system-admin', 'facility-admin'] }
}

export function defaultIpAllowlistPolicy(): IpAllowlistPolicy {
  return { enabled: false, cidrs: [] }
}

export function defaultRateLimitPolicy(): RateLimitPolicy {
  return { globalPerMinute: 100, authPerMinute: 10, sensitivePerMinute: 5, uploadPerMinute: 5, syncPerMinute: 10 }
}