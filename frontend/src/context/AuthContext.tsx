import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as api from '../services/api'
import type { AuthSession, AuthUser } from '../services/api'
import * as facilityApi from '../services/facilityApi'
import type { Facility } from '../types/facility.types'
import { useApp } from '../store/AppStore'

/**
 * Owns the signed-in user. The role shown everywhere in the UI comes from the
 * server-issued user object — there is no client-side role switcher anymore.
 * Sessions are backed by httpOnly cookies (P1-12): on load we always ask the
 * server for `/auth/me`, which transparently rotates the access window via the
 * refresh cookie when the stored one is still valid. A bearer token may also
 * be present during the token → cookie migration window.
 */
interface AuthContextValue {
  user: AuthUser | null
  /** True while a stored session is being validated on first load. */
  checking: boolean
  /** Seconds until the access window expires (approximate; 0 once unknown). */
  expiresInSeconds: number
  /** The facility currently in scope for API calls (X-Facility-Id). */
  activeFacilityId: string | null
  /** The facilities the caller may see (system-admin: all, others: own). */
  facilities: Facility[]
  /** True for legacy `admin` and `system-admin`. */
  isSystemAdmin: boolean
  /** True for `facility-admin`. */
  isFacilityAdmin: boolean
  /** `code` is the TOTP in the second step of a 2FA login. */
  login: (username: string, password: string, code?: string) => Promise<void>
  register: (input: { username: string; displayName: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  /** Silently rotate the access session (idle-timer / manual trigger). */
  refresh: () => Promise<boolean>
  /** Re-fetch the signed-in user from `/auth/me` (e.g. after 2FA changes). */
  refreshUser: () => Promise<void>
  /** Switch the in-scope facility (system-admin only). */
  switchFacility: (facilityId: string) => Promise<void>
  /** Reload the visible facility list. */
  refreshFacilities: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function adminCapable(user: AuthUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'system-admin' || user?.role === 'facility-admin'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setRole, pushToast } = useApp()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)

  const applySession = useCallback(
    (session: AuthSession) => {
      api.setAuthToken(session.token)
      const scope = session.activeFacilityId ?? session.user.activeFacilityId ?? session.user.facilityId
      api.setActiveFacility(scope ?? null)
      setActiveFacilityId(scope ?? null)
      setUser(session.user)
      setRole(session.user.role)
      const parsed = session.expiresAt ? Date.parse(session.expiresAt) : NaN
      setExpiresAt(Number.isFinite(parsed) ? parsed : null)
    },
    [setRole],
  )

  const applyFreshUser = useCallback(
    (fresh: AuthUser) => {
      const scope = fresh.activeFacilityId ?? fresh.facilityId
      api.setActiveFacility(scope ?? null)
      setActiveFacilityId(scope ?? null)
      setUser(fresh)
      setRole(fresh.role)
    },
    [setRole],
  )

  // Restore a session on first load. Always asks the server so cookie-only
  // sessions (production) come back too, not just the legacy bearer token.
  useEffect(() => {
    let alive = true
    api
      .me()
      .then((r) => {
        if (!alive) return
        applyFreshUser(r.user)
      })
      .catch(() => {
        /* 401 + failed refresh => no session; stay signed out. */
      })
      .finally(() => {
        if (alive) setChecking(false)
      })
    return () => {
      alive = false
    }
  }, [applyFreshUser])

  // Load the facility list whenever a user that can administer is signed in.
  useEffect(() => {
    if (!adminCapable(user)) {
      setFacilities([])
      return
    }
    let alive = true
    facilityApi
      .listFacilities()
      .then((list) => {
        if (alive) setFacilities(list)
      })
      .catch(() => {
        if (alive) setFacilities([])
      })
    return () => {
      alive = false
    }
  }, [user])

  // The backend rejected the current session (401 on any request).
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setRole('patient')
      setActiveFacilityId(null)
      setExpiresAt(null)
      api.setActiveFacility(null)
    }
    window.addEventListener(api.AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(api.AUTH_EXPIRED_EVENT, onExpired)
  }, [setRole])

  // Proactively rotate the access session shortly before it is due to expire.
  const refresh = useCallback(async (): Promise<boolean> => {
    const fresh = await api.refreshSession()
    if (fresh) {
      applyFreshUser(fresh)
      setExpiresAt(Date.now() + 15 * 60 * 1000)
      return true
    }
    return false
  }, [applyFreshUser])

  const refreshUser = useCallback(async (): Promise<void> => {
    const r = await api.me()
    if (r.user) applyFreshUser(r.user)
  }, [applyFreshUser])

  useEffect(() => {
    if (!expiresAt || expiresAt <= Date.now()) return
    const delay = Math.max(0, expiresAt - Date.now() - 90_000)
    const timer = window.setTimeout(() => {
      void refresh()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [expiresAt, refresh])

  const login = useCallback(
    async (username: string, password: string, code?: string) => {
      const session = await api.login({ username, password, code })
      applySession(session)
      pushToast('success', `Signed in as ${session.user.displayName} · ${session.user.role}`)
    },
    [applySession, pushToast],
  )

  const register = useCallback(
    async (input: { username: string; displayName: string; password: string }) => {
      const session = await api.register(input)
      applySession(session)
      pushToast('success', 'Account created — you are signed in as a patient.')
    },
    [applySession, pushToast],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // The session is cleared regardless — the server may already be gone.
    }
    api.setAuthToken(null)
    api.setActiveFacility(null)
    setUser(null)
    setFacilities([])
    setActiveFacilityId(null)
    setExpiresAt(null)
    setRole('patient')
    pushToast('info', 'Signed out.')
  }, [pushToast, setRole])

  const refreshFacilities = useCallback(async () => {
    try {
      setFacilities(await facilityApi.listFacilities())
    } catch {
      setFacilities([])
    }
  }, [])

  const switchFacility = useCallback(
    async (facilityId: string) => {
      const facility = await facilityApi.switchFacility(facilityId)
      api.setActiveFacility(facility.id)
      setActiveFacilityId(facility.id)
      setUser((prev) => (prev ? { ...prev, activeFacilityId: facility.id } : prev))
      pushToast('success', `Switched to ${facility.name}.`)
    },
    [pushToast],
  )

  const expiresInSeconds = useMemo(() => {
    if (!expiresAt) return 0
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  }, [expiresAt])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      checking,
      expiresInSeconds,
      activeFacilityId,
      facilities,
      isSystemAdmin: user?.role === 'admin' || user?.role === 'system-admin',
      isFacilityAdmin: user?.role === 'facility-admin',
      login,
      register,
      logout,
      refresh,
      refreshUser,
      switchFacility,
      refreshFacilities,
    }),
    [user, checking, expiresInSeconds, activeFacilityId, facilities, login, register, logout, refresh, refreshUser, switchFacility, refreshFacilities],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}