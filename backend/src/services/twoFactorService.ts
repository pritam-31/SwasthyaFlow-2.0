import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'
import { twoFactorKey } from '../config/secrets'
import { getTwoFactorSecret, setTwoFactor, type AuthUser } from './authStore'

/**
 * TOTP two-factor service (P1-12).
 *
 * Enrolment returns a Base32 secret, an `otpauth://` URI and a QR data URL; the
 * secret is held in memory only until the user proves possession of the
 * authenticator, then stored **encrypted** (AES-256-GCM) — never in plaintext.
 * Verification uses otplib's constant-time comparison with a one-step window.
 */

const ISSUER = 'SwasthyaFlow'
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'

const pendingEnrollments = new Map<string, string>()

function encryptionKey(): Buffer {
  return createHash('sha256').update(twoFactorKey()).digest()
}

/** Encrypts a TOTP secret for storage. Format: `iv:tag:ciphertext` (base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':')
}

/** Decrypts a stored TOTP secret; undefined when the payload is unreadable. */
export function decryptSecret(payload: string): string | undefined {
  try {
    const [ivPart, tagPart, dataPart] = payload.split(':')
    if (!ivPart || !tagPart || !dataPart) return undefined
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), Buffer.from(ivPart, 'base64'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return undefined
  }
}

export interface EnrollmentStart {
  secret: string
  otpauthUrl: string
  qrDataUrl: string
}

/** Begins enrolment: generates a secret + QR and remembers it as pending. */
export async function beginEnrollment(user: AuthUser): Promise<EnrollmentStart> {
  const secret = generateSecret()
  pendingEnrollments.set(user.id, secret)
  const otpauthUrl = generateURI({ issuer: ISSUER, label: user.username, secret })
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl)
  return { secret, otpauthUrl, qrDataUrl }
}

/** Verifies a code against a base32 secret (constant-time, ±1 step). */
export async function verifyCode(secret: string, token: string): Promise<boolean> {
  const result = await verify({ secret, token, epochTolerance: 30 })
  return result.valid
}

/** Confirms a pending enrolment and persists the encrypted secret. */
export async function confirmEnrollment(userId: string, token: string): Promise<boolean> {
  const pending = pendingEnrollments.get(userId)
  if (!pending) return false
  if (!(await verifyCode(pending, token))) return false
  setTwoFactor(userId, true, encryptSecret(pending))
  pendingEnrollments.delete(userId)
  return true
}

/** Verifies a login/disable code against the user's stored secret. */
export async function verifyStoredCode(userId: string, token: string): Promise<boolean> {
  const cipher = getTwoFactorSecret(userId)
  if (!cipher) return false
  const secret = decryptSecret(cipher)
  if (!secret) return false
  return verifyCode(secret, token)
}

/** Disables 2FA after verifying a final code. */
export async function disable(userId: string, token: string): Promise<boolean> {
  if (!(await verifyStoredCode(userId, token))) return false
  setTwoFactor(userId, false)
  return true
}

/** Clears any pending enrollment (e.g. the user navigates away). */
export function cancelEnrollment(userId: string): void {
  pendingEnrollments.delete(userId)
}

/** Test-only reset. */
export function clearTwoFactorMemory(): void {
  pendingEnrollments.clear()
}
