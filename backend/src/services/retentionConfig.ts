import { HttpError } from '../middleware/errorHandler'
import type { RetentionCategory, RetentionPolicy, RetentionRule } from '../types'

/**
 * The data-retention policy (P0-6).
 *
 * 22 categories, one editable rule each. Admins edit days/enabled through
 * PUT /api/retention/policy; `RETENTION_<CATEGORY>_DAYS` env vars override the
 * defaults at boot (validated the same way, so an env typo cannot bypass the
 * 0-day allowlist or the 3650-day cap).
 */

export const POLICY_VERSION = 'v1.0-2026'
export const MAX_RETENTION_DAYS = 3650
export const DAY_MS = 86_400_000

/**
 * A soft-deleted case keeps an empty shell for this many days (so a mistaken
 * delete can be noticed in the tombstone trail) before the shell is purged.
 */
export const SHELL_PURGE_DELAY_DAYS = 7

/** Only these categories may run at 0 days (purge on the next sweep). */
export const ZERO_DAY_CATEGORIES: readonly RetentionCategory[] = [
  'original-images',
  'ocr-raw-text',
  'demo-data',
]

interface RuleSeed {
  category: RetentionCategory
  label: string
  description: string
  retentionDays: number
  scope: RetentionRule['scope']
}

const SEEDS: RuleSeed[] = [
  {
    category: 'patient-sessions',
    label: 'Patient case sessions',
    description:
      'Full case record (intake, note, attachments). Soft-deleted cases are hidden at once and the shell is purged 7 days later.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'triage-notes',
    label: 'Triage notes',
    description: 'AI-drafted and human-edited observational notes. Never a diagnosis, never a prescription.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'timeline',
    label: 'Patient timeline',
    description: 'Patient-reported chronology built from intake, reports and follow-up answers.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'reports',
    label: 'Uploaded reports',
    description: 'Anonymised report records and extracted values awaiting human verification.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'report-source-files',
    label: 'Report source files',
    description: 'Uploaded PDF/image bytes kept only so a report can be re-processed, then purged.',
    retentionDays: 7,
    scope: 'file',
  },
  {
    category: 'visuals',
    label: 'Visual captures',
    description: 'PII-redacted photographs with region overlays and non-descriptive observations.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'visual-source-files',
    label: 'Visual source files',
    description: 'Original visual uploads — never persisted by design; this rule purges anything a bug leaks.',
    retentionDays: 0,
    scope: 'file',
  },
  {
    category: 'original-images',
    label: 'Original images',
    description: 'Pre-redaction originals — never stored by design; purge-if-leaked rule.',
    retentionDays: 0,
    scope: 'file',
  },
  {
    category: 'follow-up-qa',
    label: 'Follow-up questions & answers',
    description: 'Verbatim, anonymised patient answers recorded for clinician review.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'referrals',
    label: 'Referral notes',
    description: 'Draft and approved referrals prepared for hand-off to a higher-level facility.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'audit-entries',
    label: 'Audit trail',
    description: 'Who viewed, edited, exported or decided. Ring buffer (500) retained for 5 years.',
    retentionDays: 1825,
    scope: 'system',
  },
  {
    category: 'auth-sessions',
    label: 'Login sessions',
    description: 'Server-side login tokens; expired tokens are swept after 1 day.',
    retentionDays: 1,
    scope: 'system',
  },
  {
    category: 'user-accounts',
    label: 'Deactivated user accounts',
    description: 'Accounts marked deactivated are purged after 30 days.',
    retentionDays: 30,
    scope: 'account',
  },
  {
    category: 'consent-records',
    label: 'Consent records',
    description: 'Proof of consent and revocation, kept independently of the case it covered.',
    retentionDays: 1825,
    scope: 'system',
  },
  {
    category: 'anonymisation-reports',
    label: 'Anonymisation reports',
    description: 'Counts of stripped identifiers kept with the case as evidence of redaction.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'redaction-maps',
    label: 'Redaction maps',
    description: 'Per-session map of which identifier classes were stripped and how many of each.',
    retentionDays: 1095,
    scope: 'session',
  },
  {
    category: 'ocr-raw-text',
    label: 'Raw OCR text',
    description: 'Held only while a report is processed; released text is purged on the next sweep.',
    retentionDays: 0,
    scope: 'file',
  },
  {
    category: 'extracted-text',
    label: 'Extracted report text',
    description: 'Anonymised report text kept for 1 year; extracted value rows stay with the report.',
    retentionDays: 365,
    scope: 'session',
  },
  {
    category: 'demo-data',
    label: 'Demo seed data',
    description: 'Seeded demo sessions are removed quickly so stale test data never lingers.',
    retentionDays: 1,
    scope: 'session',
  },
  {
    category: 'export-files',
    label: 'Export files',
    description: 'Generated data-export payloads are purged after 1 day.',
    retentionDays: 1,
    scope: 'file',
  },
  {
    category: 'tombstones',
    label: 'Deletion tombstones',
    description: 'Proof that data was deleted — identifiers and reasons only, no payload, kept 5 years.',
    retentionDays: 1825,
    scope: 'system',
  },
  {
    category: 'application-logs',
    label: 'Application logs',
    description: 'Operational log lines (ring buffer of 500) kept for 7 days.',
    retentionDays: 7,
    scope: 'system',
  },
  {
    category: 'feedback',
    label: 'Clinician feedback',
    description:
      'Anonymised, non-diagnostic reviewer feedback about workflow quality. Soft-deleted on expiry; the audit trail is retained.',
    retentionDays: 365,
    scope: 'system',
  },
]

export const RETENTION_CATEGORIES: RetentionCategory[] = SEEDS.map((seed) => seed.category)

export function isRetentionCategory(value: unknown): value is RetentionCategory {
  return typeof value === 'string' && (RETENTION_CATEGORIES as string[]).includes(value)
}

function envDays(category: RetentionCategory): number | undefined {
  const key = `RETENTION_${category.toUpperCase().replace(/-/g, '_')}_DAYS`
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_RETENTION_DAYS) {
    console.warn(`[retention] Ignoring ${key}="${raw}" — expected an integer 0..${MAX_RETENTION_DAYS}.`)
    return undefined
  }
  if (parsed === 0 && !ZERO_DAY_CATEGORIES.includes(category)) {
    console.warn(`[retention] Ignoring ${key}=0 — 0 days is only allowed for: ${ZERO_DAY_CATEGORIES.join(', ')}.`)
    return undefined
  }
  return parsed
}

function buildDefaultPolicy(): RetentionPolicy {
  return {
    version: POLICY_VERSION,
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'system',
    rules: SEEDS.map((seed) => ({
      category: seed.category,
      label: seed.label,
      description: seed.description,
      retentionDays: envDays(seed.category) ?? seed.retentionDays,
      scope: seed.scope,
      enabled: true,
    })),
  }
}

let policy: RetentionPolicy = buildDefaultPolicy()

/** Per-target extensions: `${category}:${targetId}` -> ISO instant until which data is kept. */
const overrides = new Map<string, string>()

export function retentionKey(category: RetentionCategory, targetId: string): string {
  return `${category}:${targetId}`
}

export function getRetentionPolicy(): RetentionPolicy {
  return { ...policy, rules: policy.rules.map((rule) => ({ ...rule })) }
}

export function getRetentionRule(category: RetentionCategory): RetentionRule {
  const rule = policy.rules.find((entry) => entry.category === category)
  if (!rule) throw new HttpError(500, `Unknown retention category: ${category}.`)
  return { ...rule }
}

/** Validates and applies an admin policy edit. Throws HttpError(400) on bad input. */
export function updateRetentionPolicy(input: {
  rules: Array<{ category: unknown; retentionDays?: unknown; enabled?: unknown }>
  updatedBy: string
}): RetentionPolicy {
  if (!Array.isArray(input.rules) || input.rules.length === 0) {
    throw new HttpError(400, 'rules must be a non-empty array.')
  }

  const next = policy.rules.map((rule) => ({ ...rule }))
  for (const entry of input.rules) {
    if (!isRetentionCategory(entry.category)) {
      throw new HttpError(400, `Unknown retention category: ${String(entry.category)}.`)
    }
    if (entry.retentionDays !== undefined) {
      const days = entry.retentionDays
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > MAX_RETENTION_DAYS) {
        throw new HttpError(400, `retentionDays for ${entry.category} must be an integer 0..${MAX_RETENTION_DAYS}.`)
      }
      if (days === 0 && !ZERO_DAY_CATEGORIES.includes(entry.category)) {
        throw new HttpError(400, `retentionDays may be 0 only for: ${ZERO_DAY_CATEGORIES.join(', ')}.`)
      }
      const target = next.find((rule) => rule.category === entry.category)!
      target.retentionDays = days
    }
    if (entry.enabled !== undefined) {
      if (typeof entry.enabled !== 'boolean') {
        throw new HttpError(400, `enabled for ${entry.category} must be a boolean.`)
      }
      const target = next.find((rule) => rule.category === entry.category)!
      target.enabled = entry.enabled
    }
  }

  policy = {
    ...policy,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
    rules: next,
  }
  return getRetentionPolicy()
}

/** True when a record built at `baseIso` is past its rule age. */
export function shouldDelete(category: RetentionCategory, baseIso: string, nowIso?: string): boolean {
  const rule = getRetentionRule(category)
  if (!rule.enabled) return false
  const base = Date.parse(baseIso)
  if (!Number.isFinite(base)) return false
  const now = nowIso ? Date.parse(nowIso) : Date.now()
  return base + rule.retentionDays * DAY_MS <= now
}

/** `baseIso` pushed out by the rule's retention days (does not consult overrides). */
export function addRetentionDays(category: RetentionCategory, baseIso: string): string {
  const rule = getRetentionRule(category)
  return new Date(Date.parse(baseIso) + rule.retentionDays * DAY_MS).toISOString()
}

/**
 * The instant a target becomes eligible: its base timestamp plus the rule's
 * days, pushed out further when an admin granted a per-target extension.
 */
export function retentionExpiry(category: RetentionCategory, targetId: string, baseIso: string): string {
  const natural = addRetentionDays(category, baseIso)
  const extended = overrides.get(retentionKey(category, targetId))
  if (!extended) return natural
  return extended > natural ? extended : natural
}

/** Grants (or re-grants) a per-target extension. Capped at MAX_RETENTION_DAYS from now. */
export function applyRetentionOverride(category: RetentionCategory, targetId: string, extendedUntilIso: string): void {
  if (!isRetentionCategory(category)) throw new HttpError(400, `Unknown retention category: ${category}.`)
  const until = Date.parse(extendedUntilIso)
  if (!Number.isFinite(until)) throw new HttpError(400, 'extendedUntil must be an ISO date string.')
  if (until <= Date.now()) throw new HttpError(400, 'extendedUntil must be in the future.')
  if (until > Date.now() + MAX_RETENTION_DAYS * DAY_MS) {
    throw new HttpError(400, `An extension may not exceed ${MAX_RETENTION_DAYS} days from today.`)
  }
  overrides.set(retentionKey(category, targetId), new Date(until).toISOString())
}

export function listRetentionOverrides(): Array<{ key: string; category: string; targetId: string; extendedUntil: string }> {
  return [...overrides.entries()].map(([key, extendedUntil]) => {
    const separator = key.indexOf(':')
    return { key, category: key.slice(0, separator), targetId: key.slice(separator + 1), extendedUntil }
  })
}

/** Test teardown / graceful reset. */
export function clearRetentionOverrides(): void {
  overrides.clear()
}

/** Test helper: restores the shipped defaults (env overrides re-applied). */
export function resetRetentionPolicy(): void {
  policy = buildDefaultPolicy()
}


/* ------------------------------------------------------------------ */
/*  Per-facility retention overrides (P1-10)                            */
/* ------------------------------------------------------------------ */

export interface RetentionBounds {
  minDays: number
  maxDays: number
}

/** The shipped (global) default for each category — the baseline every facility inherits. */
export const GLOBAL_RETENTION_DEFAULTS: Record<RetentionCategory, number> = Object.fromEntries(
  SEEDS.map((seed) => [seed.category, envDays(seed.category) ?? seed.retentionDays]),
) as Record<RetentionCategory, number>

/**
 * The allowed range for a per-facility override. A facility-admin may only
 * shorten (or match) the global default; a system-admin may extend up to the
 * global cap. Zero-day categories stay at zero.
 */
export const GLOBAL_RETENTION_BOUNDS: Record<RetentionCategory, RetentionBounds> = Object.fromEntries(
  SEEDS.map((seed) => {
    const globalDefault = GLOBAL_RETENTION_DEFAULTS[seed.category]
    const minDays = ZERO_DAY_CATEGORIES.includes(seed.category) ? 0 : 1
    return [seed.category, { minDays, maxDays: globalDefault }]
  }),
) as Record<RetentionCategory, RetentionBounds>

/** facilityId -> (category -> { retentionDays, enabled }) */
const facilityRules = new Map<string, Map<RetentionCategory, { retentionDays: number; enabled: boolean }>>()

function facilityMap(facilityId: string): Map<RetentionCategory, { retentionDays: number; enabled: boolean }> {
  let map = facilityRules.get(facilityId)
  if (!map) {
    map = new Map()
    facilityRules.set(facilityId, map)
  }
  return map
}

/** The effective policy for a facility: the global policy with per-facility tweaks folded in. */
export function getRetentionPolicyForFacility(facilityId: string): RetentionPolicy {
  const overridesForFacility = facilityRules.get(facilityId)
  const rules = policy.rules.map((rule) => {
    const override = overridesForFacility?.get(rule.category)
    return override ? { ...rule, retentionDays: override.retentionDays, enabled: override.enabled } : { ...rule }
  })
  return { ...policy, rules }
}

/**
 * Applies per-facility overrides. A facility-admin may only shorten (within
 * bounds). A system-admin may extend up to `MAX_RETENTION_DAYS`. Always keeps
 * the zero-day allowlist and the global cap.
 */
export function updateRetentionPolicyForFacility(
  facilityId: string,
  updates: Array<{ category: RetentionCategory; retentionDays?: number; enabled?: boolean }>,
  actorRole: 'system-admin' | 'facility-admin',
): RetentionPolicy {
  const map = facilityMap(facilityId)
  for (const update of updates) {
    if (!isRetentionCategory(update.category)) {
      throw new HttpError(400, `Unknown retention category: ${String(update.category)}.`)
    }
    const bounds = GLOBAL_RETENTION_BOUNDS[update.category]
    const current = map.get(update.category) ?? {
      retentionDays: GLOBAL_RETENTION_DEFAULTS[update.category],
      enabled: true,
    }
    const next = { ...current }
    if (update.retentionDays !== undefined) {
      const days = update.retentionDays
      if (!Number.isInteger(days) || days < 0) {
        throw new HttpError(400, `${update.category}: retentionDays must be a non-negative integer.`)
      }
      if (days > MAX_RETENTION_DAYS) {
        throw new HttpError(400, `${update.category}: retentionDays cannot exceed ${MAX_RETENTION_DAYS}.`)
      }
      if (days === 0 && !ZERO_DAY_CATEGORIES.includes(update.category)) {
        throw new HttpError(400, `${update.category}: 0 days is not permitted for this category.`)
      }
      const maxAllowed = actorRole === 'system-admin' ? MAX_RETENTION_DAYS : bounds.maxDays
      if (days > maxAllowed) {
        throw new HttpError(403, `${update.category}: retentionDays cannot exceed ${maxAllowed} for your role.`)
      }
      if (days < bounds.minDays) {
        throw new HttpError(400, `${update.category}: retentionDays must be at least ${bounds.minDays}.`)
      }
      next.retentionDays = days
    }
    if (update.enabled !== undefined) next.enabled = update.enabled
    map.set(update.category, next)
  }
  return getRetentionPolicyForFacility(facilityId)
}

/** Drops all per-facility retention overrides for one facility. */
export function clearFacilityRetentionOverrides(facilityId: string): void {
  facilityRules.delete(facilityId)
}

export function applyStoredRuleState(stored: Array<{ category: string; retentionDays: number; enabled: boolean }>): void {
  const next = policy.rules.map((rule) => {
    const match = stored.find((entry) => entry.category === rule.category)
    return match ? { ...rule, retentionDays: match.retentionDays, enabled: match.enabled } : rule
  })
  policy = { ...policy, rules: next }
}
