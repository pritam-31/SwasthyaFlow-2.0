/**
 * Display-name parsing for greetings.
 *
 * The backend issues `displayName` strings like "Ramesh Kumar", "R. Sharma",
 * "Dr. A. Mehta" and "S. Kiro". Naively taking the first whitespace token
 * produced greetings such as "Hi R." / "Hi Dr." / "Hi S." — this helper strips
 * honorifics/initials and prefers an explicit `firstName` when one is present.
 */

/** Honorifics we keep and re-attach to the resolved name (e.g. "Dr. Mehta"). */
const KEPT_TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'shri', 'smt', 'shrimati'])

/** Role/relational titles that carry no personal name and should be dropped. */
const STRIPPED_TITLES = new Set(['nurse', 'sister', 'staff', 'health', 'worker', 'doctor'])

const FALLBACK = 'there'

function isInitial(token: string): boolean {
  const bare = token.replace(/\./g, '')
  return bare.length === 1
}

function cleanToken(token: string): string {
  return token.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '')
}

/**
 * Resolve a friendly name for greetings.
 *
 * @param displayName Full display name from the session (may include a title).
 * @param firstName   Optional explicit first name that takes precedence.
 */
export function getDisplayName(displayName?: string | null, firstName?: string | null): string {
  const explicit = firstName?.trim()
  if (explicit) return explicit

  const raw = (displayName ?? '').trim()
  if (!raw) return FALLBACK

  const tokens = raw.split(/\s+/).filter(Boolean)

  let keptTitle: string | null = null
  const names: string[] = []

  for (const token of tokens) {
    const clean = cleanToken(token)
    const lower = clean.replace(/\./g, '').toLowerCase()

    if (KEPT_TITLES.has(lower)) {
      keptTitle = keptTitle ?? (clean.endsWith('.') ? clean : `${clean}.`)
      continue
    }
    if (STRIPPED_TITLES.has(lower)) continue
    if (isInitial(clean)) continue
    if (clean) names.push(clean)
  }

  if (names.length === 0) {
    // Only titles/initials were supplied — never greet with "Dr." or "R.".
    return keptTitle ? 'Doctor' : FALLBACK
  }

  // With an honorific, greet by surname ("Dr. Mehta"); otherwise by first name.
  const name = keptTitle ? names[names.length - 1] : names[0]
  return keptTitle ? `${keptTitle} ${name}` : name
}
