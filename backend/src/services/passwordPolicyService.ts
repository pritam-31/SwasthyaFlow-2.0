import { SecurityPolicyModel, type DbSecurityPolicy } from '../db/models/SecurityPolicyModel'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { record as recordSecurityEvent } from './securityEventService'
import { isCommonPasswordValue } from './commonPasswords'
import type {
  LockoutPolicy,
  PasswordPolicy,
  PasswordValidationResult,
  RateLimitPolicy,
  SecurityPolicy,
  SessionPolicy,
  TwoFactorPolicy,
  IpAllowlistPolicy,
} from '../types/security.types'

/**
 * Per-facility security policy service (P1-12).
 *
 * The `global` policy is the system-wide default that every facility inherits
 * unless it has its own row. Policies are validated against fixed bounds so an
 * admin can never configure an insecure value. Every change is audit-logged.
 *
 * No secrets live in a policy. Usernames/passwords are never stored here.
 */

export const GLOBAL_FACILITY_ID = 'global'

/** Fixed bounds every facility policy must stay inside (system-level). */
export const POLICY_BOUNDS = {
  password: {
    minLength: { min: 8, max: 128 },
    expiryDays: { min: 0, max: 365 },
  },
  lockout: {
    maxFailures: { min: 1, max: 20 },
    baseLockoutMinutes: { min: 1, max: 1440 },
    maxLockoutMinutes: { min: 1, max: 1440 },
  },
  session: {
    accessTokenMinutes: { min: 5, max: 1440 },
    refreshTokenDays: { min: 1, max: 90 },
    concurrentSessionLimit: { min: 1, max: 50 },
  },
  rateLimit: {
    globalPerMinute: { min: 1, max: 10000 },
    authPerMinute: { min: 1, max: 1000 },
    sensitivePerMinute: { min: 1, max: 1000 },
    uploadPerMinute: { min: 1, max: 500 },
    syncPerMinute: { min: 1, max: 500 },
  },
} as const

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireLetter: true,
  requireDigit: true,
  requireSymbol: true,
  blockCommon: true,
  blockUsername: true,
  expiryDays: 0,
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailures: 5,
  baseLockoutMinutes: 15,
  exponential: true,
  maxLockoutMinutes: 1440,
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  accessTokenMinutes: 15,
  refreshTokenDays: 30,
  concurrentSessionLimit: 6,
  deviceBinding: true,
}

export const DEFAULT_TWO_FACTOR_POLICY: TwoFactorPolicy = {
  required: false,
  allowedRoles: ['system-admin', 'facility-admin'],
}

export const DEFAULT_IP_ALLOWLIST_POLICY: IpAllowlistPolicy = {
  enabled: false,
  cidrs: [],
}

export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  globalPerMinute: 100,
  authPerMinute: 10,
  sensitivePerMinute: 5,
  uploadPerMinute: 5,
  syncPerMinute: 10,
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  facilityId: GLOBAL_FACILITY_ID,
  password: DEFAULT_PASSWORD_POLICY,
  lockout: DEFAULT_LOCKOUT_POLICY,
  session: DEFAULT_SESSION_POLICY,
  twoFactor: DEFAULT_TWO_FACTOR_POLICY,
  ipAllowlist: DEFAULT_IP_ALLOWLIST_POLICY,
  rateLimit: DEFAULT_RATE_LIMIT_POLICY,
}

const inMemoryPolicies = new Map<string, SecurityPolicy>()

function clonePolicies(policy: SecurityPolicy): SecurityPolicy {
  return {
    ...policy,
    password: { ...policy.password },
    lockout: { ...policy.lockout },
    session: { ...policy.session },
    twoFactor: { ...policy.twoFactor, allowedRoles: [...policy.twoFactor.allowedRoles] },
    ipAllowlist: { ...policy.ipAllowlist, cidrs: [...policy.ipAllowlist.cidrs] },
    rateLimit: { ...policy.rateLimit },
  }
}

function toApi(policy: SecurityPolicy): SecurityPolicy {
  return {
    facilityId: policy.facilityId,
    password: { ...policy.password },
    lockout: { ...policy.lockout },
    session: { ...policy.session },
    twoFactor: { ...policy.twoFactor, allowedRoles: [...policy.twoFactor.allowedRoles] },
    ipAllowlist: { ...policy.ipAllowlist, cidrs: [...policy.ipAllowlist.cidrs] },
    rateLimit: { ...policy.rateLimit },
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  }
}

function fromDb(doc: DbSecurityPolicy): SecurityPolicy {
  return toApi({
    facilityId: doc.facilityId,
    password: (doc.password as unknown as PasswordPolicy) ?? DEFAULT_PASSWORD_POLICY,
    lockout: (doc.lockout as unknown as LockoutPolicy) ?? DEFAULT_LOCKOUT_POLICY,
    session: (doc.session as unknown as SessionPolicy) ?? DEFAULT_SESSION_POLICY,
    twoFactor: (doc.twoFactor as unknown as TwoFactorPolicy) ?? DEFAULT_TWO_FACTOR_POLICY,
    ipAllowlist: (doc.ipAllowlist as unknown as IpAllowlistPolicy) ?? DEFAULT_IP_ALLOWLIST_POLICY,
    rateLimit: (doc.rateLimit as unknown as RateLimitPolicy) ?? DEFAULT_RATE_LIMIT_POLICY,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  })
}

/** Seeds the global default policy (idempotent). */
export async function seedGlobalSecurityPolicy(): Promise<void> {
  if (persistenceEnabled()) {
    const existing = await SecurityPolicyModel.findOne({ facilityId: GLOBAL_FACILITY_ID }).lean().exec()
    if (existing) return
    await SecurityPolicyModel.create({
      _id: GLOBAL_FACILITY_ID,
      policyId: GLOBAL_FACILITY_ID,
      facilityId: GLOBAL_FACILITY_ID,
      password: DEFAULT_PASSWORD_POLICY,
      lockout: DEFAULT_LOCKOUT_POLICY,
      session: DEFAULT_SESSION_POLICY,
      twoFactor: DEFAULT_TWO_FACTOR_POLICY,
      ipAllowlist: DEFAULT_IP_ALLOWLIST_POLICY,
      rateLimit: DEFAULT_RATE_LIMIT_POLICY,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    })
    return
  }
  if (!inMemoryPolicies.has(GLOBAL_FACILITY_ID)) {
    inMemoryPolicies.set(GLOBAL_FACILITY_ID, clonePolicies(DEFAULT_SECURITY_POLICY))
  }
}

/** Loads saved policies into memory on boot (persistent mode only). */
export async function hydrateSecurityPolicies(): Promise<void> {
  if (!persistenceEnabled()) {
    await seedGlobalSecurityPolicy()
    return
  }
  const rows = await SecurityPolicyModel.find().lean<DbSecurityPolicy[]>().exec()
  inMemoryPolicies.clear()
  for (const row of rows) inMemoryPolicies.set(row.facilityId, fromDb(row))
  if (!inMemoryPolicies.has(GLOBAL_FACILITY_ID)) await seedGlobalSecurityPolicy()
}

/**
 * Returns the effective policy for a facility: its own row when present,
 * otherwise the global default.
 */
export async function getEffectivePolicy(facilityId: string): Promise<SecurityPolicy> {
  if (persistenceEnabled()) {
    const row = await SecurityPolicyModel.findOne({ facilityId }).lean<DbSecurityPolicy>().exec()
    if (row) return fromDb(row)
    const global = await SecurityPolicyModel.findOne({ facilityId: GLOBAL_FACILITY_ID }).lean<DbSecurityPolicy>().exec()
    return global ? fromDb(global) : clonePolicies(DEFAULT_SECURITY_POLICY)
  }
  return clonePolicies(inMemoryPolicies.get(facilityId) ?? inMemoryPolicies.get(GLOBAL_FACILITY_ID) ?? DEFAULT_SECURITY_POLICY)
}

/** Lists every policy row (system-admin view). */
export async function listSecurityPolicies(): Promise<SecurityPolicy[]> {
  if (persistenceEnabled()) {
    const rows = await SecurityPolicyModel.find().lean<DbSecurityPolicy[]>().exec()
    return rows.map(fromDb)
  }
  return [...inMemoryPolicies.values()].map(clonePolicies)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Applies an allowed partial update to a policy, validating every value against
 * the fixed bounds. `changedFields` names the keys that actually changed, used
 * by the audit trail. Returns the merged policy.
 */
export async function updatePolicy(
  facilityId: string,
  patch: Partial<SecurityPolicy>,
  actor: { id: string; role: string },
): Promise<SecurityPolicy> {
  const current = await getEffectivePolicy(facilityId)
  const facilityIsGlobal = facilityId === GLOBAL_FACILITY_ID

  if (patch.password) {
    current.password = {
      minLength: clamp(patch.password.minLength ?? current.password.minLength, POLICY_BOUNDS.password.minLength.min, POLICY_BOUNDS.password.minLength.max),
      requireLetter: patch.password.requireLetter ?? current.password.requireLetter,
      requireDigit: patch.password.requireDigit ?? current.password.requireDigit,
      requireSymbol: patch.password.requireSymbol ?? current.password.requireSymbol,
      blockCommon: patch.password.blockCommon ?? current.password.blockCommon,
      blockUsername: patch.password.blockUsername ?? current.password.blockUsername,
      expiryDays: clamp(patch.password.expiryDays ?? current.password.expiryDays, POLICY_BOUNDS.password.expiryDays.min, POLICY_BOUNDS.password.expiryDays.max),
    }
    if (current.password.minLength >= 8 && !current.password.requireLetter && !current.password.requireDigit) {
      // Reactivate at least the letter requirement so the policy stays sane.
      current.password.requireLetter = true
    }
  }
  if (patch.lockout) {
    current.lockout = {
      maxFailures: clamp(patch.lockout.maxFailures ?? current.lockout.maxFailures, POLICY_BOUNDS.lockout.maxFailures.min, POLICY_BOUNDS.lockout.maxFailures.max),
      baseLockoutMinutes: clamp(patch.lockout.baseLockoutMinutes ?? current.lockout.baseLockoutMinutes, POLICY_BOUNDS.lockout.baseLockoutMinutes.min, POLICY_BOUNDS.lockout.baseLockoutMinutes.max),
      exponential: patch.lockout.exponential ?? current.lockout.exponential,
      maxLockoutMinutes: clamp(patch.lockout.maxLockoutMinutes ?? current.lockout.maxLockoutMinutes, POLICY_BOUNDS.lockout.maxLockoutMinutes.min, POLICY_BOUNDS.lockout.maxLockoutMinutes.max),
    }
    if (current.lockout.maxLockoutMinutes < current.lockout.baseLockoutMinutes) {
      current.lockout.maxLockoutMinutes = current.lockout.baseLockoutMinutes
    }
  }
  if (patch.session) {
    current.session = {
      accessTokenMinutes: clamp(patch.session.accessTokenMinutes ?? current.session.accessTokenMinutes, POLICY_BOUNDS.session.accessTokenMinutes.min, POLICY_BOUNDS.session.accessTokenMinutes.max),
      refreshTokenDays: clamp(patch.session.refreshTokenDays ?? current.session.refreshTokenDays, POLICY_BOUNDS.session.refreshTokenDays.min, POLICY_BOUNDS.session.refreshTokenDays.max),
      concurrentSessionLimit: clamp(patch.session.concurrentSessionLimit ?? current.session.concurrentSessionLimit, POLICY_BOUNDS.session.concurrentSessionLimit.min, POLICY_BOUNDS.session.concurrentSessionLimit.max),
      deviceBinding: patch.session.deviceBinding ?? current.session.deviceBinding,
    }
  }
  if (patch.twoFactor) {
    const allowedRoles = patch.twoFactor.allowedRoles ?? current.twoFactor.allowedRoles
    current.twoFactor = {
      required: patch.twoFactor.required ?? current.twoFactor.required,
      allowedRoles: allowedRoles.filter((role) => role !== 'patient'),
    }
  }
  if (patch.ipAllowlist) {
    current.ipAllowlist = {
      enabled: patch.ipAllowlist.enabled ?? current.ipAllowlist.enabled,
      cidrs: patch.ipAllowlist.cidrs ?? current.ipAllowlist.cidrs,
    }
  }
  if (patch.rateLimit) {
    current.rateLimit = {
      globalPerMinute: clamp(patch.rateLimit.globalPerMinute ?? current.rateLimit.globalPerMinute, POLICY_BOUNDS.rateLimit.globalPerMinute.min, POLICY_BOUNDS.rateLimit.globalPerMinute.max),
      authPerMinute: clamp(patch.rateLimit.authPerMinute ?? current.rateLimit.authPerMinute, POLICY_BOUNDS.rateLimit.authPerMinute.min, POLICY_BOUNDS.rateLimit.authPerMinute.max),
      sensitivePerMinute: clamp(patch.rateLimit.sensitivePerMinute ?? current.rateLimit.sensitivePerMinute, POLICY_BOUNDS.rateLimit.sensitivePerMinute.min, POLICY_BOUNDS.rateLimit.sensitivePerMinute.max),
      uploadPerMinute: clamp(patch.rateLimit.uploadPerMinute ?? current.rateLimit.uploadPerMinute, POLICY_BOUNDS.rateLimit.uploadPerMinute.min, POLICY_BOUNDS.rateLimit.uploadPerMinute.max),
      syncPerMinute: clamp(patch.rateLimit.syncPerMinute ?? current.rateLimit.syncPerMinute, POLICY_BOUNDS.rateLimit.syncPerMinute.min, POLICY_BOUNDS.rateLimit.syncPerMinute.max),
    }
  }

  current.updatedAt = new Date().toISOString()
  current.updatedBy = actor.id

  if (persistenceEnabled()) {
    await SecurityPolicyModel.replaceOne(
      { facilityId },
      {
        _id: facilityId,
        policyId: facilityId,
        facilityId,
        password: current.password,
        lockout: current.lockout,
        session: current.session,
        twoFactor: current.twoFactor,
        ipAllowlist: current.ipAllowlist,
        rateLimit: current.rateLimit,
        updatedAt: current.updatedAt,
        updatedBy: current.updatedBy,
      },
      { upsert: true },
    )
  }
  inMemoryPolicies.set(facilityId, clonePolicies(current))

  const changedKeys = Object.keys(patch)
  await recordSecurityEvent({
    type: 'security.policy-updated',
    actorId: actor.id,
    actorRole: actor.role as never,
    facilityId,
    requestId: undefined,
    detail: `Security policy updated for facility ${facilityIsGlobal ? '(global)' : facilityId}: ${changedKeys.join(', ')}.`,
  })

  return toApi(current)
}

/**
 * Validates a candidate password against the effective policy and (optionally)
 * the username it is bound to. Errors are generic message keys — never a value.
 */
export function validatePassword(password: string, policy: PasswordPolicy, username?: string): PasswordValidationResult {
  const errors: string[] = []
  if (password.length < policy.minLength) errors.push('password.too-short')
  if (policy.requireLetter && !/[a-zA-Z]/.test(password)) errors.push('password.requires-letter')
  if (policy.requireDigit && !/\d/.test(password)) errors.push('password.requires-digit')
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) errors.push('password.requires-symbol')
  if (policy.blockCommon && isCommonPasswordValue(password)) errors.push('password.common')
  if (policy.blockUsername && username && containsUsername(password, username)) errors.push('password.contains-username')
  if (password.length > 128) errors.push('password.too-long')
  return { ok: errors.length === 0, errors }
}

/** True when `password` contains the username as a case-insensitive substring. */
export function containsUsername(password: string, username: string): boolean {
  const needle = username.toLowerCase()
  const haystack = password.toLowerCase()
  return needle.length >= 3 && haystack.includes(needle)
}

/** Convenience wrapper used by routes that only have a facility id. */
export async function validatePasswordForFacility(password: string, facilityId: string, username?: string): Promise<PasswordValidationResult> {
  const policy = (await getEffectivePolicy(facilityId)).password
  return validatePassword(password, policy, username)
}

/** Persistent-mode write helper used by tests/scripts; never returns secrets. */
export function persistPolicyWrite(facilityId: string, policy: SecurityPolicy): void {
  if (!persistenceEnabled()) return
  enqueue('policy:' + facilityId, async () => {
    await SecurityPolicyModel.replaceOne(
      { facilityId },
      {
        _id: facilityId,
        policyId: facilityId,
        facilityId,
        password: policy.password,
        lockout: policy.lockout,
        session: policy.session,
        twoFactor: policy.twoFactor,
        ipAllowlist: policy.ipAllowlist,
        rateLimit: policy.rateLimit,
        updatedAt: policy.updatedAt ?? new Date().toISOString(),
        updatedBy: policy.updatedBy ?? 'system',
      },
      { upsert: true },
    )
  })
}

/** Test-only reset. */
export function clearSecurityPoliciesMemory(): void {
  inMemoryPolicies.clear()
}