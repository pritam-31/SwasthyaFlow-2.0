import { HttpError } from '../middleware/errorHandler'
import { anonymiseText } from './unifiedAnonymizer'
import { enforceNonDiagnostic, nonDiagnosticGuidance } from './nonDiagnostic'

/**
 * Shared text handling for model cards + failure modes (P2-13).
 *
 * Every string is validated against the non-diagnostic guard and then
 * anonymised before it is stored, so a card can never persist a clinical claim
 * or an identifier.
 */

/** Validate a free-text field and return the anonymised, persisted value. */
export function sanitiseField(field: string, value: string): string {
  const check = enforceNonDiagnostic(value)
  if (!check.ok) throw new HttpError(400, nonDiagnosticGuidance(check.violations), { field })
  return anonymiseText(value.trim(), 'report-text').text
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} must be a non-empty string.`)
  }
  return value
}

export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  if (!(field in body) || body[field] === undefined) return undefined
  const value = body[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} must be a non-empty string when provided.`)
  }
  return value
}

export function stringArray(body: Record<string, unknown>, field: string): string[] {
  const value = body[field]
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be an array of strings.`)
  return value.map((item) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new HttpError(400, `${field} must contain only non-empty strings.`)
    }
    return item
  })
}

export function requireEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: T[]): T {
  const value = body[field]
  if (typeof value !== 'string' || !(allowed as string[]).includes(value)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}.`)
  }
  return value as T
}
