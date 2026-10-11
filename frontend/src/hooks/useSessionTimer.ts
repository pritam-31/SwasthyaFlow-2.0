import { useEffect, useState } from 'react'

/**
 * Ticks once per second while an ISO expiry timestamp is in the future and
 * returns the time remaining. Used by the session list to show live counts.
 */
export function useSessionTimer(expiresAt?: string): { secondsLeft: number; formatted: string; expired: boolean } {
  const target = expiresAt ? Date.parse(expiresAt) : NaN
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!Number.isFinite(target)) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [target])

  const secondsLeft = Number.isFinite(target) ? Math.max(0, Math.floor((target - now) / 1000)) : 0
  const h = Math.floor(secondsLeft / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)
  const s = secondsLeft % 60
  const formatted =
    h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`

  return { secondsLeft, formatted, expired: secondsLeft === 0 }
}