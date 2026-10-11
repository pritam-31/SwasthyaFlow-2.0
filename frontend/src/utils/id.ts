/** Client-side ID/timestamp helpers (no PII, no analysis logic). */

export function generateId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}-${random}`
}

/** Anonymized surrogate shown before submission — never a real identifier. */
export function generatePatientId(): string {
  return `PT-${generateId('').replace('PT-', '').slice(0, 8).toUpperCase()}`
}

export function timestamp(): string {
  return new Date().toISOString()
}
