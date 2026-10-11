import type { UserRole } from './index'

/**
 * Security domain model (P1-12). Mirrors the frontend copy in
 * `frontend/src/types/security.types.ts`. No PII is ever placed in a
 * SecurityEvent — low-entropy identifiers are pseudonymised before storage.
 */

export interface PasswordPolicy {
  /** Minimum password length (default 12). */
  minLength: number
  requireLetter: boolean
  requireDigit: boolean
  requireSymbol: boolean
  /** Reject passwords found in the bundled common-password list. */
  blockCommon: boolean
  /** Reject passwords that contain the username. */
  blockUsername: boolean
  /** 0 = never expire. */
  expiryDays: number
}

export interface LockoutPolicy {
  maxFailures: number
  baseLockoutMinutes: number
  /** Each subsequent lockout doubles (capped at maxLockoutMinutes). */
  exponential: boolean
  maxLockoutMinutes: number
}

export interface SessionPolicy {
  accessTokenMinutes: number
  refreshTokenDays: number
  concurrentSessionLimit: number
  /** Soft device binding: warn (never block) when the fingerprint changes. */
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
  /** Raw IP is stored ONLY here (needed for abuse investigation/blocking). */
  ip?: string
  /** Raw user agent is stored ONLY here, and only when needed for triage. */
  userAgent?: string
  detail: string
  requestId?: string
  createdAt: string
}

export interface RefreshTokenRecord {
  id: string
  userId: string
  sessionId: string
  /** sha256 of the opaque token — the raw token is never stored. */
  tokenHash: string
  familyId: string
  issuedAt: string
  expiresAt: string
  usedAt?: string
  revokedAt?: string
  reason?: string
}

export interface DeviceFingerprint {
  hash: string
  firstSeenAt: string
  lastSeenAt: string
  userAgent: string
  ip: string
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

export interface AuthAuditContext {
  ip: string
  userAgent: string
  userAgentHash: string
  facilityId: string
  deviceFingerprintHash: string
  requestId: string
}

export interface IpBlocklistEntry {
  entryId: string
  ip: string
  reason: string
  blockedAt: string
  expiresAt?: string
  blockedBy: string
}

export interface ActiveLockout {
  usernameHash: string
  ipHash: string
  failures: number
  lockedUntil?: string
  lockCount: number
}

/** Result of a password-policy check. Errors are message keys, never values. */
export interface PasswordValidationResult {
  ok: boolean
  errors: string[]
}
