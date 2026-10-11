import { randomBytes } from 'node:crypto'
import { DeviceModel } from '../db/models/DeviceModel'
import { persistenceEnabled } from '../db/mongoose'
import { enqueue } from '../repositories/writeQueue'
import { upsertDevice as persistDevice } from '../repositories/securityRepository'
import { pseudonymise } from '../config/secrets'
import type { Device } from '../types/security.types'

/**
 * Device fingerprinting service (P1-12).
 *
 * A fingerprint is a salted hash of the user agent plus a coarse client hint —
 * enough to tell "this is the same browser" apart, never enough to identify a
 * person. Device binding is *soft*: a changed fingerprint produces a
 * `suspicious-ua` audit event and nothing more, so no one is ever locked out of
 * their own account on a browser update. The UI can warn without blocking.
 */

const devices = new Map<string, Device>()

/** Stable pseudonymous fingerprint for a client. */
export function fingerprintFor(userId: string, userAgent: string): string {
  return pseudonymise(`${userId}:${userAgent}`, 'device')
}

function deviceIdFor(userId: string, fingerprintHash: string): string {
  return `dev-${pseudonymise(`${userId}:${fingerprintHash}`, 'device-id').slice(0, 32)}`
}

async function persist(device: Device): Promise<void> {
  if (!persistenceEnabled()) return
  await persistDevice({
    deviceId: device.deviceId,
    userId: device.userId,
    fingerprintHash: device.fingerprintHash,
    userAgent: device.userAgent,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    ip: device.ip,
    revokedAt: device.revokedAt ?? null,
  })
}

export interface TouchDeviceInput {
  userId: string
  userAgent: string
  ip: string
}

export interface TouchDeviceResult {
  device: Device
  /** True when this user had never been seen with this fingerprint before. */
  isNew: boolean
  /** True when the user has an older, different active device on record. */
  changedFingerprint: boolean
}

/** Records a sign-in for a user agent and returns what we know about it. */
export async function touchDevice(input: TouchDeviceInput): Promise<TouchDeviceResult> {
  const fingerprintHash = fingerprintFor(input.userId, input.userAgent)
  const deviceId = deviceIdFor(input.userId, fingerprintHash)
  const now = new Date().toISOString()

  const knownForUser = [...devices.values()].filter((device) => device.userId === input.userId && !device.revokedAt)
  const changedFingerprint = knownForUser.some((device) => device.fingerprintHash !== fingerprintHash)
  const existing = devices.get(deviceId)

  if (existing) {
    existing.lastSeenAt = now
    existing.ip = input.ip
    await persist(existing)
    return { device: existing, isNew: false, changedFingerprint }
  }

  const device: Device = {
    deviceId,
    userId: input.userId,
    fingerprintHash,
    userAgent: input.userAgent,
    firstSeenAt: now,
    lastSeenAt: now,
    ip: input.ip,
  }
  devices.set(deviceId, device)
  await persist(device)
  return { device, isNew: true, changedFingerprint }
}

/** Active devices on record for a user. */
export function listDevices(userId: string): Device[] {
  return [...devices.values()]
    .filter((device) => device.userId === userId && !device.revokedAt)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}

/** Soft device binding: warn (never block) when the fingerprint changed. */
export function currentFingerprint(userId: string, userAgent: string): string {
  return fingerprintFor(userId, userAgent)
}

/** Marks a device revoked and returns the number of live devices left. */
export async function revokeDevice(userId: string, deviceId: string): Promise<Device | undefined> {
  const device = devices.get(deviceId)
  if (!device || device.userId !== userId || device.revokedAt) return undefined
  device.revokedAt = new Date().toISOString()
  await persist(device)
  return device
}

/** Drops devices the user no longer has, by fingerprint. */
export async function revokeByFingerprint(userId: string, fingerprintHash: string): Promise<number> {
  let count = 0
  for (const device of devices.values()) {
    if (device.userId === userId && device.fingerprintHash === fingerprintHash && !device.revokedAt) {
      device.revokedAt = new Date().toISOString()
      await persist(device)
      count += 1
    }
  }
  return count
}

/** Loads persisted devices on boot (persistent mode only). */
export async function hydrateDevices(): Promise<void> {
  if (!persistenceEnabled()) return
  const rows = await DeviceModel.find().lean().exec()
  devices.clear()
  for (const row of rows) {
    devices.set(row.deviceId, {
      deviceId: row.deviceId,
      userId: row.userId,
      fingerprintHash: row.fingerprintHash,
      userAgent: row.userAgent,
      firstSeenAt: new Date(row.firstSeenAt).toISOString(),
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
      ip: row.ip,
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : undefined,
    })
  }
}

/** Ensures a device row exists even without a sign-in (tests, admin views). */
export function ensureDevice(device: Device): Device {
  const existing = devices.get(device.deviceId)
  if (existing) return existing
  devices.set(device.deviceId, device)
  enqueue('device:' + device.deviceId, () => persistDevice(device))
  return device
}

/** Test-only reset. */
export function clearDevicesMemory(): void {
  devices.clear()
}

/** Random id helper shared with the session/device glue code. */
export function randomId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`
}