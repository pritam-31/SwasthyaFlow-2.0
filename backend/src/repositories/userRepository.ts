import { UserModel, type DbUser } from '../db/models/User'
import { LoginSessionModel } from '../db/models/LoginSession'
import type { UserRole } from '../types'

/** Mongo-backed user directory + server-side login sessions (P1-9). */

export interface UserRecord {
  id: string
  username: string
  displayName: string
  role: UserRole
  facilityId: string
  createdAt: string
  passwordHash: string
  salt: string
  deactivatedAt?: string
  passwordAlgorithm?: string
  passwordChangedAt?: string
  lastLoginAt?: string
  lastLoginIp?: string
  failedLoginCount?: number
  lockedUntil?: string
  twoFactorEnabled?: boolean
  twoFactorSecret?: string
  roleChangedAt?: string
  facilityChangedAt?: string
}

export interface LoginSessionRecord {
  token: string
  userId: string
  expiresAt: string
}

function toDoc(record: UserRecord): DbUser {
  return {
    _id: record.id,
    username: record.username,
    displayName: record.displayName,
    role: record.role,
    facilityId: record.facilityId,
    createdAt: record.createdAt,
    passwordHash: record.passwordHash,
    salt: record.salt,
    deactivatedAt: record.deactivatedAt ?? null,
    passwordAlgorithm: record.passwordAlgorithm ?? 'scrypt',
    passwordChangedAt: record.passwordChangedAt ?? null,
    lastLoginAt: record.lastLoginAt ?? null,
    lastLoginIp: record.lastLoginIp ?? null,
    failedLoginCount: record.failedLoginCount ?? 0,
    lockedUntil: record.lockedUntil ?? null,
    twoFactorEnabled: record.twoFactorEnabled ?? false,
    twoFactorSecret: record.twoFactorSecret ?? null,
    roleChangedAt: record.roleChangedAt ?? null,
    facilityChangedAt: record.facilityChangedAt ?? null,
  }
}

export async function upsertUser(record: UserRecord): Promise<void> {
  await UserModel.replaceOne({ _id: record.id }, toDoc(record), { upsert: true })
}

export async function listUsers(): Promise<Array<Record<string, unknown>>> {
  const rows = await UserModel.find().sort({ username: 1 }).lean<Array<Record<string, unknown>>>().exec()
  return rows.map((row) => ({ ...row, id: row._id }))
}

export async function deleteUser(id: string): Promise<void> {
  await UserModel.deleteOne({ _id: id })
}

export async function upsertLoginSession(input: {
  id: string
  token: string
  userId: string
  expiresAt: string
  ip?: string
  userAgent?: string
  deviceFingerprintHash?: string
  lastSeenAt?: string
  revokedAt?: string
  revokedReason?: string
}): Promise<void> {
  await LoginSessionModel.replaceOne(
    { _id: input.id },
    {
      _id: input.id,
      token: input.token,
      userId: input.userId,
      expiresAt: input.expiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      deviceFingerprintHash: input.deviceFingerprintHash ?? null,
      lastSeenAt: input.lastSeenAt ?? null,
      revokedAt: input.revokedAt ?? null,
      revokedReason: input.revokedReason ?? null,
    },
    { upsert: true },
  )
}

export async function deleteLoginSession(token: string): Promise<void> {
  await LoginSessionModel.deleteOne({ token })
}

export async function deleteLoginSessionsForUser(userId: string): Promise<void> {
  await LoginSessionModel.deleteMany({ userId })
}

export async function listLoginSessions(): Promise<Array<Record<string, unknown>>> {
  return LoginSessionModel.find().lean<Array<Record<string, unknown>>>().exec()
}
