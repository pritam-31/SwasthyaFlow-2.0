/**
 * Single HTTP client for the SwasthyaFlow backend (see /backend).
 *
 * The backend owns anonymization, mock analysis, session storage and the
 * audit trail — the frontend must never reimplement those rules.
 */

import type {
  AgeBand,
  AnonymizationReport,
  AuditAction,
  AuditCategory,
  AuditLogEntry,
  IntakeLanguage,
  IntakePoint,
  MissingInfoItem,
  NoteOverride,
  PatientSession,
  ReferralNote,
  RiskScore,
  SexMarker,
  StructuredTriageNote,
  UserRole,
} from '../types/triage'
import type { FollowUpQuestion } from '../types/followup.types'


// Production auth cookies must stay same-origin, so production always uses
// the deployment's /api proxy. The override is only for local development.
const API_ORIGIN = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL?.trim() || '').replace(/\/+$/, '')
  : ''

const BASE = `${API_ORIGIN}/api`

const TOKEN_KEY = 'swasthyaflow.token'

/** Fired globally when the backend rejects the current login session (401). */
export const AUTH_EXPIRED_EVENT = 'swasthyaflow:auth-expired'

let token: string | null = typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)

/** Store/clear the login token — every request attaches it automatically. */
export function setAuthToken(next: string | null): void {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getAuthToken(): string | null {
  return token
}

/** The facility currently selected for `X-Facility-Id` (system-admin only). */
export function getActiveFacilityId(): string | null {
  return activeFacilityId
}

/**
 * Reads the backend-issued double-submit token from the readable
 * `swasthyaflow.csrf` cookie. Safe to echo in a header — it is not a secret.
 */
function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  for (const part of document.cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === 'swasthyaflow.csrf') return part.slice(eq + 1).trim()
  }
  return undefined
}

interface RefreshResult {
  user: AuthUser | null
  invalid: boolean
}

let refreshInFlight: Promise<RefreshResult> | null = null

async function refreshSessionOnce(): Promise<RefreshResult> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(readCsrfToken() ? { 'x-csrf-token': readCsrfToken() } : {}),
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    })
    if (res.status === 401) return { user: null, invalid: true }
    if (!res.ok) return { user: null, invalid: false }
    const payload = (await res.json().catch(() => ({}))) as { user?: AuthUser; token?: string }
    if (!payload.user) return { user: null, invalid: false }
    // In the migration window the backend also returns a fresh token; in
    // production the browser keeps the rotated httpOnly cookies by itself.
    if (typeof payload.token === 'string' && payload.token) setAuthToken(payload.token)
    return { user: payload.user, invalid: false }
  } catch {
    return { user: null, invalid: false }
  }
}

/**
 * Silently rotates the access session using the httpOnly refresh cookie.
 * Safe to call from many places at once — only one request is in flight.
 */
export function refreshSession(): Promise<AuthUser | null> {
  return refreshSessionState().then((result) => result.user)
}

function refreshSessionState(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSessionOnce().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Drops the stored session and notifies the app it must re-authenticate. */
function expireSession(): void {
  setAuthToken(null)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

export class ApiError extends Error {
  readonly status: number
  /** Login returned 401 because the account is protected by 2FA. */
  readonly twoFactorRequired: boolean
  /** Present on 423 lockout responses. */
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, extra?: { twoFactorRequired?: boolean; retryAfterSeconds?: number }) {
    super(message)
    this.status = status
    this.twoFactorRequired = extra?.twoFactorRequired ?? false
    this.retryAfterSeconds = extra?.retryAfterSeconds
  }
}

/** Per-request offline metadata. `offlineOrigin` marks a replayed queued write. */
export interface RequestMeta {
  idempotencyKey?: string
  offlineOrigin?: boolean
}

/** UUID request id for idempotent retries of mutating calls. */
function newRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  // The backend validates the key as a UUID, so the fallback must be one too.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** HTTP statuses that mean "the backend is still booting / briefly unavailable". */
const TRANSIENT_STATUSES = new Set([502, 503, 504])

/** Maximum automatic retries after a transient failure (network or 5xx). */
const MAX_TRANSIENT_RETRIES = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * True once the backend reports it is fully booted and not degraded. `/health`
 * is registered ahead of the auth/rate-limit/DB-health middleware, so it is safe
 * to poll while the process restarts (and it never trips the login limiter).
 */
async function backendReady(): Promise<boolean> {
  try {
    const res = await fetch(`${API_ORIGIN}/health`, { method: 'GET', credentials: 'include' })
    if (!res.ok) return false
    const payload = (await res.json().catch(() => null)) as { status?: string } | null
    return payload?.status !== 'degraded'
  } catch {
    return false
  }
}

/** Waits (bounded) for the backend to finish booting, then resolves. */
async function waitForBackend(timeoutMs = 15000, intervalMs = 600): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await backendReady()) return true
    if (Date.now() >= deadline) return false
    await sleep(intervalMs)
  }
}

async function core<T>(path: string, init: RequestInit | undefined, meta: RequestMeta | undefined, isRetry: boolean): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const mutating = method !== 'GET' && method !== 'HEAD'
  // Attach an idempotency key to every mutating call so a retry is safe; the
  // backend only honours it on the allowlisted offline-capable endpoints.
  const idempotencyKey = meta?.idempotencyKey ?? (mutating ? newRequestId() : undefined)
  // Cookie-authenticated mutating calls must echo the double-submit token.
  const csrf = mutating ? readCsrfToken() : undefined
  // A dev restart (tsx watch) or a brief DB blip makes the proxy answer 502/503
  // while the backend is still booting. Retry transparently instead of surfacing
  // a scary error — this keeps login working right after any code change.
  let res!: Response
  let attempt = 0
  for (;;) {
    try {
      res = await fetch(`${BASE}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(activeFacilityId ? { 'x-facility-id': activeFacilityId } : {}),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
          ...(meta?.offlineOrigin ? { 'x-offline-origin': 'true' } : {}),
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          ...init?.headers,
        },
      })
    } catch {
      if (attempt < MAX_TRANSIENT_RETRIES) {
        attempt += 1
        await waitForBackend()
        continue
      }
      throw new ApiError('Backend is still starting up — please try again in a moment.', 0)
    }
    if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_TRANSIENT_RETRIES) {
      attempt += 1
      await waitForBackend()
      continue
    }
    break
  }

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const isAuthPath = path === '/auth/login' || path === '/auth/register' || path === '/auth/refresh'

  if (res.status === 401 && !isRetry && !isAuthPath) {
    const refreshed = await refreshSessionState()
    if (refreshed.user) return core<T>(path, init, meta, true)
    if (refreshed.invalid) expireSession()
  }
  if (res.status === 401 && isRetry && !isAuthPath) {
    expireSession()
  }

  const message =
    typeof payload.error === 'string'
      ? payload.error
      : `Request failed (${res.status})`
  const extra =
    typeof payload.twoFactorRequired === 'boolean' || typeof payload.retryAfterSeconds === 'number'
      ? {
          twoFactorRequired: payload.twoFactorRequired === true,
          retryAfterSeconds: typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : undefined,
        }
      : undefined

  if (!res.ok) throw new ApiError(message, res.status, extra)
  return payload as T
}

export async function request<T>(path: string, init?: RequestInit, meta?: RequestMeta): Promise<T> {
  return core<T>(path, init, meta, false)
}

/**
 * Multipart POST (e.g. report file upload). Unlike `request`, no
 * `content-type` header is set — the browser must attach the boundary itself.
 */
async function postMultipartCore<T>(path: string, form: FormData, retry: boolean): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(readCsrfToken() ? { 'x-csrf-token': readCsrfToken() } : {}),
      },
    })
  } catch {
    throw new ApiError('Backend is not reachable — start it with `npm run dev:backend`.', 0)
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.status === 401 && !retry) {
    const refreshed = await refreshSessionState()
    if (refreshed.user) return postMultipartCore<T>(path, form, true)
    if (refreshed.invalid) expireSession()
  }
  if (res.status === 401 && retry) expireSession()
  const message =
    typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`
  const extra =
    typeof payload.retryAfterSeconds === 'number'
      ? { twoFactorRequired: false, retryAfterSeconds: payload.retryAfterSeconds }
      : undefined
  if (!res.ok) throw new ApiError(message, res.status, extra)
  return payload as T
}

async function postMultipart<T>(path: string, form: FormData): Promise<T> {
  return postMultipartCore<T>(path, form, false)
}

export { postMultipart }

/**
 * Fetch a binary resource (e.g. the redacted photo bytes) with the auth token.
 * Returns an object URL the caller is responsible for revoking.
 */
async function fetchBlobUrlCore(path: string, retry: boolean): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  } catch {
    throw new ApiError('Backend is not reachable — start it with `npm run dev:backend`.', 0)
  }
  if (res.status === 401) {
    if (!retry) {
      const refreshed = await refreshSessionState()
      if (refreshed.user) return fetchBlobUrlCore(path, true)
      if (refreshed.invalid) expireSession()
    } else {
      expireSession()
    }
  }
  if (!res.ok) {
    throw new ApiError(`Could not load the image (${res.status})`, res.status)
  }
  return URL.createObjectURL(await res.blob())
}

export function fetchBlobUrl(path: string): Promise<string> {
  return fetchBlobUrlCore(path, false)
}

/* ---------------- Wire types (mirror backend/src/types) ---------------- */

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: UserRole
  facilityId: string
  activeFacilityId?: string
  createdAt: string
  twoFactorEnabled?: boolean
  lastLoginAt?: string
}

export interface AuthSession {
  token: string
  expiresAt: string
  user: AuthUser
  activeFacilityId?: string
}

/** The facility the UI is currently scoped to (sent as X-Facility-Id). */
let activeFacilityId: string | null = null

/** Set/clear the in-scope facility. Only system-admins may change it. */
export function setActiveFacility(id: string | null): void {
  activeFacilityId = id
}

export function getActiveFacility(): string | null {
  return activeFacilityId
}

export interface ApiNote {
  structuredNote: StructuredTriageNote
  observations: string[]
  urgencyFlags: Array<{ id: string; label: string; severity: 'red' | 'amber'; reason: string; ruleId: string }>
  missingInformation: MissingInfoItem[]
  followUpQuestions: FollowUpQuestion[]
  riskScore: RiskScore
  status: 'ai-draft' | 'human-edited' | 'accepted' | 'finalized' | 'escalated'
  generatedAt: string
  disclaimer: string
}

export interface ApiSession {
  id: string
  patientId: string
  language: IntakeLanguage
  ageBand: AgeBand
  sex: SexMarker
  intakePoint: IntakePoint
  facility: string
  displayText: string
  anonymization: AnonymizationReport
  note: ApiNote | null
  overrides: NoteOverride[]
  referral: ReferralNote | null
  status: 'ready' | 'accepted' | 'escalated'
  createdBy: string
  createdAt: string
  updatedAt: string
}

/* ---------------- Endpoints ---------------- */

/* Auth — self-registration always yields the patient role; staff accounts are
 * created by an admin. The returned token is attached to every later request. */
export function login(body: { username: string; password: string; code?: string }): Promise<AuthSession> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

export function register(body: { username: string; displayName: string; password: string }): Promise<AuthSession> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(body) })
}

export function logout(): Promise<unknown> {
  return request('/auth/logout', { method: 'POST', body: '{}' })
}

export function me(): Promise<{ user: AuthUser }> {
  return request('/auth/me')
}

/* Admin user management */
export function listUsers(): Promise<{ users: AuthUser[] }> {
  return request('/auth/users')
}

export function createUser(body: {
  username: string
  displayName: string
  password: string
  role: UserRole
}): Promise<{ user: AuthUser }> {
  return request('/auth/users', { method: 'POST', body: JSON.stringify(body) })
}

export function updateUserRole(id: string, role: UserRole): Promise<{ user: AuthUser }> {
  return request(`/auth/users/${encodeURIComponent(id)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) })
}

export function deleteUser(id: string): Promise<unknown> {
  return request(`/auth/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function fetchSessions(): Promise<{ sessions: ApiSession[] }> {
  return request('/sessions')
}

export function createSession(body: {
  patientId: string
  text: string
  language: IntakeLanguage
  ageBand: AgeBand
  sex: SexMarker
  intakePoint: IntakePoint
  consentAcknowledged: boolean
  role: UserRole
  actor: string
}): Promise<{ session: ApiSession }> {
  return request('/sessions', { method: 'POST', body: JSON.stringify(body) })
}

export function updateNote(
  id: string,
  body: { structuredNote: StructuredTriageNote; role: UserRole; actor: string },
): Promise<{ session: ApiSession; changed: string[] }> {
  return request(`/sessions/${id}/note`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function setStatus(
  id: string,
  body: { status: 'accepted'; role: UserRole; actor: string; action?: 'accepted' | 'finalized' },
): Promise<{ session: ApiSession }> {
  return request(`/sessions/${id}/status`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateFollowUp(
  id: string,
  body: { questionId: string; answer?: string; role: UserRole; actor: string },
): Promise<{ session: ApiSession }> {
  return request(`/sessions/${id}/followup`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function createReferral(
  id: string,
  body: { toFacility: string; reason: string; role: UserRole; actor: string },
): Promise<{ session: ApiSession }> {
  return request(`/sessions/${id}/referral`, { method: 'POST', body: JSON.stringify(body) })
}

export function approveReferral(id: string, body: { role: UserRole; actor: string }): Promise<{ session: ApiSession }> {
  return request(`/sessions/${id}/referral/approve`, { method: 'POST', body: JSON.stringify(body) })
}

/** PII preview for the intake form (same rules as the analysis layer). */
export function anonymizePreview(
  text: string,
  language?: IntakeLanguage,
): Promise<{ text: string; anonymization: AnonymizationReport }> {
  const body: Record<string, unknown> = { text }
  if (language) body.language = language
  return request('/triage/anonymize', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchAudit(sessionId?: string): Promise<{ entries: AuditLogEntry[] }> {
  return request(sessionId ? `/audit?sessionId=${encodeURIComponent(sessionId)}` : '/audit')
}

export function postAudit(body: {
  sessionId: string
  actor: string
  role: UserRole
  action: AuditAction
  detail: string
  category: AuditCategory
}): Promise<unknown> {
  return request('/audit', { method: 'POST', body: JSON.stringify(body) })
}

/* ---------------- Mapping: API session → UI session ---------------- */

export function sessionFromApi(s: ApiSession): PatientSession {
  return {
    id: s.id,
    patientId: s.patientId,
    demographics: {
      patientId: s.patientId,
      ageBand: s.ageBand,
      sex: s.sex,
      facility: s.facility,
      intakePoint: s.intakePoint,
    },
    raw: { text: s.displayText, voice: null, image: null, document: null, language: s.language },
    displayText: s.displayText,
    anonymization: s.anonymization,
    triageNote: s.note
      ? {
          structuredNote: s.note.structuredNote,
          observations: s.note.observations,
          urgencyFlags: s.note.urgencyFlags.map((f) => ({ ...f, status: 'active' as const })),
          missingInformation: s.note.missingInformation,
          followUpQuestions: s.note.followUpQuestions,
          riskScore: s.note.riskScore,
          status: s.note.status,
          generatedAt: s.note.generatedAt,
          lastEditedAt: s.overrides.at(-1)?.at ?? null,
          editedBy: s.overrides.at(-1)?.reviewer ?? null,
          disclaimer: s.note.disclaimer,
          timeline: [],
          slaBreached: false,
          nonDiagnostic: true,
        }
      : null,
    referral: s.referral,
    status: s.status,
    consent: {
      granted: true,
      nonDiagnosticAcknowledged: true,
      purposes: ['Symptom organisation', 'Report processing', 'Healthcare-worker review'],
      at: s.createdAt,
      policyVersion: 'v1.0',
    },
    overrides: s.overrides,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}
