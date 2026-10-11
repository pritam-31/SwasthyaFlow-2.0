import { createHash } from 'node:crypto'
import { hasAnyVersionedSecret } from './env'

/**
 * Versioned secret access (P1-12).
 *
 * Secrets live only in the environment. Rotation is supported by adding a new
 * `${NAME}_V<n>` variable — the highest version wins and older versions stay
 * resolvable so rotating a key never invalidates in-flight tokens. Values are
 * never logged, returned in errors, or written to audit entries.
 */

const VERSIONED = /^(.+)_V(\d+)$/

/** The current (highest-version) secret for `name`, or undefined if unset. */
export function getSecret(name: string): string | undefined {
  let best: { version: number; value: string } | null = null
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.trim()) continue
    const match = VERSIONED.exec(key)
    if (match && match[1] === name) {
      const version = Number(match[2])
      if (!best || version > best.version) best = { version, value }
    }
  }
  if (best) return best.value
  const plain = process.env[name]
  return plain && plain.trim() ? plain : undefined
}

/** Every version of `name`, newest first, for verification during rotation. */
export function getSecretVersions(name: string): string[] {
  const versions: Array<{ version: number; value: string }> = []
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.trim()) continue
    const match = VERSIONED.exec(key)
    if (match && match[1] === name) versions.push({ version: Number(match[2]), value })
  }
  versions.sort((a, b) => b.version - a.version)
  const plain = process.env[name]
  if (plain && plain.trim()) versions.push({ version: 0, value: plain })
  return versions.map((entry) => entry.value)
}

/** True when the named secret exists in any form. */
export function hasSecret(name: string): boolean {
  return hasAnyVersionedSecret(name)
}

/**
 * Deterministic, salted hash used to pseudonymise low-entropy identifiers
 * (IPs, user agents, usernames, device fingerprints) before they reach logs or
 * the general audit trail. Not reversible; safe to store.
 */
export function pseudonymise(value: string, namespace: string): string {
  const salt = getSecret('SESSION_SECRET') ?? 'swasthyaflow-dev-salt'
  return createHash('sha256').update(`${namespace}:${salt}:${value}`).digest('hex')
}

/** A stable development key so the prototype can encrypt without config. */
export function twoFactorKey(): string {
  return getSecret('TWO_FACTOR_ENC_KEY') ?? 'swasthyaflow-development-two-factor-key'
}
