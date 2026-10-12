/** Small date helpers shared by the appointment pages (all local-time safe). */

/** Today's date as YYYY-MM-DD (local). */
export function todayISO(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/** ISO date (YYYY-MM-DD) plus `days` days. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, (d || 1) + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** "Mon, 12 Oct 2026" style label, TZ-safe. */
export function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "24h HH:MM" → "09:30 AM". */
export function formatHumanTime(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm
  const date = new Date(`2000-01-01T${hhmm}:00`)
  if (Number.isNaN(date.getTime())) return hhmm
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}