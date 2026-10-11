import { SecurityPolicyModel } from '../db/models/SecurityPolicyModel'
import { SecurityEventModel } from '../db/models/SecurityEventModel'
import { RefreshTokenModel } from '../db/models/RefreshTokenModel'
import { DeviceModel } from '../db/models/DeviceModel'
import { IpBlocklistModel } from '../db/models/IpBlocklistModel'
import type { SecurityEvent } from '../types/security.types'

/** Mongo-backed security collections (P1-12). Only used when persistence is on. */

/* ----------------------------- Policies ----------------------------- */

export interface StoredPolicy {
  policyId: string
  facilityId: string
  password: Record<string, unknown>
  lockout: Record<string, unknown>
  session: Record<string, unknown>
  twoFactor: Record<string, unknown>
  ipAllowlist: Record<string, unknown>
  rateLimit: Record<string, unknown>
  updatedAt: string
  updatedBy: string
}

export async function upsertPolicy(policy: StoredPolicy): Promise<void> {
  await SecurityPolicyModel.replaceOne({ facilityId: policy.facilityId }, { ...policy, _id: policy.facilityId }, { upsert: true })
}

export async function listPolicies(): Promise<StoredPolicy[]> {
  return SecurityPolicyModel.find().lean<StoredPolicy[]>().exec()
}

/* --------------------------- Security events --------------------------- */

export async function appendSecurityEvent(event: SecurityEvent): Promise<void> {
  await SecurityEventModel.replaceOne(
    { eventId: event.id },
    {
      _id: event.id,
      eventId: event.id,
      type: event.type,
      actorId: event.actorId ?? null,
      actorRole: event.actorRole ?? null,
      facilityId: event.facilityId ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      detail: event.detail,
      requestId: event.requestId ?? null,
      createdAt: new Date(event.createdAt),
    },
    { upsert: true },
  )
}

export async function listSecurityEvents(): Promise<SecurityEvent[]> {
  const rows = await SecurityEventModel.find().sort({ createdAt: -1 }).limit(2000).lean<
    Array<{
      eventId: string
      type: string
      actorId?: string | null
      actorRole?: string | null
      facilityId?: string | null
      ip?: string | null
      userAgent?: string | null
      detail: string
      requestId?: string | null
      createdAt: Date
    }>
  >().exec()
  return rows.map((row) => ({
    id: row.eventId,
    type: row.type as SecurityEvent['type'],
    actorId: row.actorId ?? undefined,
    actorRole: (row.actorRole as SecurityEvent['actorRole']) ?? undefined,
    facilityId: row.facilityId ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    detail: row.detail,
    requestId: row.requestId ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
  }))
}

/* ---------------------------- Refresh tokens ---------------------------- */

export interface StoredRefreshToken {
  tokenId: string
  userId: string
  sessionId: string
  tokenHash: string
  familyId: string
  issuedAt: string
  expiresAt: string
  usedAt?: string
  revokedAt?: string
  reason?: string
}

export async function upsertRefreshToken(record: StoredRefreshToken): Promise<void> {
  await RefreshTokenModel.replaceOne(
    { tokenId: record.tokenId },
    {
      _id: record.tokenId,
      tokenId: record.tokenId,
      userId: record.userId,
      sessionId: record.sessionId,
      tokenHash: record.tokenHash,
      familyId: record.familyId,
      issuedAt: new Date(record.issuedAt),
      expiresAt: new Date(record.expiresAt),
      usedAt: record.usedAt ? new Date(record.usedAt) : null,
      revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
      reason: record.reason ?? null,
    },
    { upsert: true },
  )
}

export async function listRefreshTokens(): Promise<
  Array<{ tokenId: string; userId: string; sessionId: string; tokenHash: string; familyId: string; issuedAt: string; expiresAt: string; usedAt: string | null; revokedAt: string | null; reason: string | null }>
> {
  const rows = await RefreshTokenModel.find().lean<
    Array<{
      tokenId: string
      userId: string
      sessionId: string
      tokenHash: string
      familyId: string
      issuedAt: Date
      expiresAt: Date
      usedAt: Date | null
      revokedAt: Date | null
      reason: string | null
    }>
  >().exec()
  return rows.map((row) => ({
    tokenId: row.tokenId,
    userId: row.userId,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    issuedAt: new Date(row.issuedAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
    usedAt: row.usedAt ? new Date(row.usedAt).toISOString() : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    reason: row.reason,
  }))
}

export async function deleteRefreshTokensForUser(userId: string): Promise<void> {
  await RefreshTokenModel.deleteMany({ userId })
}

/* ------------------------------- Devices ------------------------------- */

export async function upsertDevice(device: {
  deviceId: string
  userId: string
  fingerprintHash: string
  userAgent: string
  firstSeenAt: string
  lastSeenAt: string
  ip: string
  revokedAt?: string | null
}): Promise<void> {
  await DeviceModel.replaceOne(
    { deviceId: device.deviceId },
    {
      _id: device.deviceId,
      deviceId: device.deviceId,
      userId: device.userId,
      fingerprintHash: device.fingerprintHash,
      userAgent: device.userAgent,
      firstSeenAt: new Date(device.firstSeenAt),
      lastSeenAt: new Date(device.lastSeenAt),
      ip: device.ip,
      revokedAt: device.revokedAt ? new Date(device.revokedAt) : null,
    },
    { upsert: true },
  )
}

export async function listDevices(): Promise<
  Array<{ deviceId: string; userId: string; fingerprintHash: string; userAgent: string; firstSeenAt: string; lastSeenAt: string; ip: string; revokedAt: string | null }>
> {
  const rows = await DeviceModel.find().lean<
    Array<{
      deviceId: string
      userId: string
      fingerprintHash: string
      userAgent: string
      firstSeenAt: Date
      lastSeenAt: Date
      ip: string
      revokedAt: Date | null
    }>
  >().exec()
  return rows.map((row) => ({
    deviceId: row.deviceId,
    userId: row.userId,
    fingerprintHash: row.fingerprintHash,
    userAgent: row.userAgent,
    firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    ip: row.ip,
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
  }))
}

/* ------------------------------ IP blocklist ------------------------------ */

export async function upsertIpBlocklistEntry(entry: {
  entryId: string
  ip: string
  reason: string
  blockedAt: string
  expiresAt?: string
  blockedBy: string
}): Promise<void> {
  await IpBlocklistModel.replaceOne(
    { entryId: entry.entryId },
    {
      _id: entry.entryId,
      entryId: entry.entryId,
      ip: entry.ip,
      reason: entry.reason,
      blockedAt: new Date(entry.blockedAt),
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
      blockedBy: entry.blockedBy,
    },
    { upsert: true },
  )
}

export async function deleteIpBlocklistEntry(entryId: string): Promise<void> {
  await IpBlocklistModel.deleteOne({ entryId })
}

export async function listIpBlocklist(): Promise<
  Array<{ entryId: string; ip: string; reason: string; blockedAt: string; expiresAt: string | null; blockedBy: string }>
> {
  const rows = await IpBlocklistModel.find().lean<
    Array<{ entryId: string; ip: string; reason: string; blockedAt: Date; expiresAt: Date | null; blockedBy: string }>
  >().exec()
  return rows.map((row) => ({
    entryId: row.entryId,
    ip: row.ip,
    reason: row.reason,
    blockedAt: new Date(row.blockedAt).toISOString(),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    blockedBy: row.blockedBy,
  }))
}
