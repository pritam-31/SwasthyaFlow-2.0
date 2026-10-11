import { useState } from 'react'

/**
 * Reads the backend double-submit token from the readable `swasthyaflow.csrf`
 * cookie once. The hook exists so consumers have a stable value across
 * renders; the backend re-issues the cookie on every login/refresh.
 */
export function useCsrf(): string | null {
  const [value] = useState<string | null>(() => readCsrfCookie())
  return value
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === 'swasthyaflow.csrf') return part.slice(eq + 1).trim()
  }
  return null
}