import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTH_EXPIRED_EVENT, fetchBlobUrl, request, setAuthToken } from './api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('API authentication recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setAuthToken(null)
    document.cookie = 'swasthyaflow.csrf=; Max-Age=0; path=/'
  })

  it('sends the CSRF cookie value when rotating the cookie-based session', async () => {
    document.cookie = 'swasthyaflow.csrf=csrf-value; path=/'
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, init })
        if (url.endsWith('/auth/refresh')) return jsonResponse(200, { user: { id: 'user-1' } })
        if (calls.filter((call) => call.url.endsWith('/protected')).length === 1) {
          return jsonResponse(401, { error: 'Authentication required.' })
        }
        return jsonResponse(200, { ok: true })
      }),
    )

    await expect(request<{ ok: boolean }>('/protected')).resolves.toEqual({ ok: true })
    const refresh = calls.find((call) => call.url.endsWith('/auth/refresh'))
    expect(new Headers(refresh?.init?.headers).get('x-csrf-token')).toBe('csrf-value')
    expect(calls.filter((call) => call.url.endsWith('/protected'))).toHaveLength(2)
  })

  it('does not expire the login after a transient refresh network error', async () => {
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/refresh')) throw new TypeError('Network unavailable')
        return jsonResponse(401, { error: 'Authentication required.' })
      }),
    )

    await expect(request('/protected')).rejects.toMatchObject({ status: 401 })
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })

  it('retries a blob request only once after a successful refresh', async () => {
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) return jsonResponse(200, { user: { id: 'user-1' } })
      return jsonResponse(401, { error: 'Authentication required.' })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchBlobUrl('/image')).rejects.toThrow('Could not load the image (401)')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(expired).toHaveBeenCalledTimes(1)
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  })
})
