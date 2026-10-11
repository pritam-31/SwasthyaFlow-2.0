import argon2, { type HashOptions } from 'argon2'
import { scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Password hashing (P1-12).
 *
 * Argon2id is the current default. Legacy scrypt hashes (per-user random salt,
 * stored separately) still verify so nothing breaks during rollout; a successful
 * login transparently rehashes them to Argon2id via {@link rehashIfNeeded}.
 *
 * Passwords and hashes are never logged, returned or written to audit entries.
 */

export type PasswordAlgorithm = 'argon2id' | 'scrypt'

export const DEFAULT_PASSWORD_ALGORITHM: PasswordAlgorithm = 'argon2id'

/** Argon2id parameters — tuned for an interactive login on modest hardware. */
const ARGON2_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
}

export interface HashedPassword {
  hash: string
  algorithm: PasswordAlgorithm
}

/** Hash a new password with the current default algorithm (Argon2id). */
export async function hashPassword(password: string): Promise<HashedPassword> {
  const hash = await argon2.hash(password, ARGON2_OPTIONS)
  return { hash, algorithm: 'argon2id' }
}

/**
 * Verify a password against a stored hash. Argon2 encoded hashes carry their own
 * salt; legacy scrypt hashes need the separately-stored salt.
 */
export async function verifyPassword(
  password: string,
  hash: string,
  algorithm: string,
  salt?: string,
): Promise<boolean> {
  if (algorithm === 'argon2id') {
    try {
      return await argon2.verify(hash, password)
    } catch {
      return false
    }
  }
  if (algorithm === 'scrypt') {
    if (!salt) return false
    const candidate = Buffer.from(scryptSync(password, salt, 64).toString('hex'), 'hex')
    const stored = Buffer.from(hash, 'hex')
    return candidate.length === stored.length && timingSafeEqual(candidate, stored)
  }
  return false
}

/** True when the stored algorithm is not the current default. */
export function needsRehash(algorithm: string | undefined | null): boolean {
  return algorithm !== DEFAULT_PASSWORD_ALGORITHM
}

/**
 * Returns a fresh Argon2id hash when the stored one is legacy, otherwise null.
 * The caller persists the result after a successful verification.
 */
export async function rehashIfNeeded(
  user: { passwordAlgorithm?: string | null },
  password: string,
): Promise<HashedPassword | null> {
  if (!needsRehash(user.passwordAlgorithm)) return null
  return hashPassword(password)
}
