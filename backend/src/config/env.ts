import { z } from 'zod'

/**
 * Centralised environment validation (P1-12).
 *
 * Parsing is lenient so the in-memory prototype and every test keep booting
 * without a `.env` file. {@link assertProductionEnv} is the fail-closed gate:
 * it is called on boot and refuses to start when a required secret is missing
 * in production. Values are never logged.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value
    return value.trim().toLowerCase() === 'true' || value.trim() === '1'
  })

const portish = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === 'number' ? value : Number(value)))
  .refine((value) => Number.isInteger(value) && value >= 1 && value <= 65535, {
    message: 'PORT must be an integer between 1 and 65535.',
  })

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: portish.default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/swasthyaflow'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  COOKIE_DOMAIN: z.string().default('localhost'),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  TRUST_PROXY: z.string().default('false'),
  ENABLE_BODY_TOKEN: z.string().optional(),
  ENABLE_2FA: booleanish.default(false),
  ENABLE_RATE_LIMIT: z.string().optional(),
  CSP_REPORT_ONLY: booleanish.default(false),
  SECURITY_LOG_LEVEL: z.string().default('info'),
})

export type Env = z.infer<typeof EnvSchema>

function rawEnv(): Record<string, string | undefined> {
  return process.env
}

let cached: Env | null = null

/** Parsed, defaulted environment. Lenient — never throws in development. */
export function env(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(rawEnv())
  if (!parsed.success) {
    // Never echo values; only the offending keys.
    const keys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration for: ${keys}`)
  }
  cached = parsed.data
  return cached
}

/** True when running the production profile. */
export function isProduction(): boolean {
  return env().NODE_ENV === 'production'
}

/**
 * Whether the login response may include the access token in the body.
 *
 * Defaults to true outside production so existing clients/tests keep working
 * during the token → cookie migration; production defaults to false (fail
 * closed) unless explicitly enabled. Documented in MIGRATION.md.
 */
export function bodyTokenEnabled(): boolean {
  const raw = env().ENABLE_BODY_TOKEN
  if (raw === undefined) return !isProduction()
  return raw.trim().toLowerCase() === 'true'
}

/**
 * Whether request rate limiting is enforced. Off by default outside production
 * so the prototype and the deterministic test suite are not throttled; always
 * on in production. Documented trade-off in MIGRATION.md.
 */
export function rateLimitEnabled(): boolean {
  const raw = env().ENABLE_RATE_LIMIT
  if (raw === undefined) return isProduction()
  return raw.trim().toLowerCase() === 'true'
}

const REQUIRED_IN_PRODUCTION = [
  'MONGODB_URI',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const

/**
 * Fail-closed production check. Returns the list of missing/invalid keys and,
 * when non-empty, the caller aborts boot with a sanitised message.
 */
export function assertProductionEnv(): string[] {
  if (!isProduction()) return []
  const missing: string[] = []
  for (const key of REQUIRED_IN_PRODUCTION) {
    const value = process.env[key]
    if (!value || !value.trim()) missing.push(key)
  }
  if (!hasAnyVersionedSecret('SESSION_SECRET')) missing.push('SESSION_SECRET_V1')
  if (!hasAnyVersionedSecret('REFRESH_SECRET')) missing.push('REFRESH_SECRET_V1')
  if (!hasAnyVersionedSecret('CSRF_SECRET')) missing.push('CSRF_SECRET_V1')
  if (!hasAnyVersionedSecret('TWO_FACTOR_ENC_KEY')) missing.push('TWO_FACTOR_ENC_KEY_V1')
  return missing
}

/** True when `<name>` or any `<name>_V<n>` is present and non-empty. */
export function hasAnyVersionedSecret(name: string): boolean {
  if (typeof process.env[name] === 'string' && process.env[name]!.trim()) return true
  for (const key of Object.keys(process.env)) {
    if (new RegExp(`^${name}_V\\d+$`).test(key) && process.env[key]?.trim()) return true
  }
  return false
}
