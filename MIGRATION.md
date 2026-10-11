# Migration guide — P1-12 security hardening

This guide describes what changed in the P1-12 hardening pass and what a
deployment / development setup has to do to move from the previous build. No
public API route has been removed; the hardening layers sit in front of the
existing endpoints.

## 1. New environment variables (backend `.env`)

| Variable | Purpose | Default when absent |
| --- | --- | --- |
| `SESSION_SECRET_V1` | Signs the httpOnly access-session cookie (`swasthyaflow.sid`). | random per boot |
| `REFRESH_SECRET_V1` | Signs the rotating refresh cookie (`swasthyaflow.rt`). Chained naming supports key rotation (`_V2`, …). | random per boot |
| `CSRF_SECRET_V1` | Signs the readable double-submit token cookie (`swasthyaflow.csrf`). | random per boot |
| `TWO_FACTOR_ENC_KEY_V1` | Authenticated-encryption key for stored TOTP secrets. | random per boot |
| `COOKIE_SAME_SITE` | Optional cookie policy: `lax`, `strict`, or `none`. Defaults to `lax` outside production and `none` in production; `none` requires HTTPS and `Secure`. | environment default |
| `MONGODB_URI` | MongoDB connection string (for Atlas, provide the Atlas URI; never commit credentials). Required in production. | `mongodb://localhost:27017/swasthyaflow` outside production |
| `MONGODB_DB_NAME` | Database name used by the backend. | `swasthyaflow` |
| `USE_IN_MEMORY_STORES` | Local/test-only opt-in for the in-memory prototype. Production always requires MongoDB. | enabled outside production |
| `SEED_ON_BOOT` | Seeds demo accounts and reference data. Production seeds only when explicitly enabled. | enabled outside production |
| `TRUST_PROXY` | Trusted proxy hops for `req.ip`. `false`/empty = none, `true` = 1 hop, or a comma list. Set behind Nginx/Cloudflare or sign-in IPs will be wrong and the IP allowlist will misbehave. | `false` |
| `ENABLE_RATE_LIMIT` | Enables the in-process sliding-window rate limiter outside production. Rate limits are **always** on in production. | disabled outside prod |
| `ENABLE_BODY_TOKEN` | The response body still carries `session.token`/`refreshToken` (dev/migration convenience). Production defaults reject body tokens. | enabled outside prod |
| `ENABLE_2FA` | Master switch for the TOTP endpoints. | `true` |
| `CSP_REPORT_ONLY` | Emit `Content-Security-Policy-Report-Only` instead of enforcing. | `false` |
| `SECURITY_LOG_LEVEL` | Console verbosity for the security event layer (`error`/`warn`/`info`). | `info` |

Cookie flags: `swasthyaflow.sid` / `swasthyaflow.rt` are `HttpOnly`,
`SameSite=Lax` outside production and `SameSite=None; Secure` in production
unless `COOKIE_SAME_SITE` overrides the policy. Cookies are always host-only.
The production Vercel config proxies `/api` to Railway so cookies stay
first-party. Direct cross-origin deployments must use an exact frontend origin
in `CORS_ORIGIN` and a frontend `VITE_API_BASE_URL`; browsers that block
third-party cookies may still require a same-origin proxy.
The CSRF
cookie is **readable by design** (double-submit pattern).

Rotating any `_V1` secret signs the user out everywhere — do it as a planned
maintenance window.

## 2. Password policy split (important behavioural change)

- **Unchanged legacy rule** — self-registration (`POST /api/auth/register`),
  administrator `POST /api/auth/users` and the seed scripts keep the original
  `>= 8 characters with a letter and a digit` rule. Existing tests and existing
  accounts are unaffected.
- **New strict, configurable policy** — enforced on
  `POST /api/auth/change-password` and applied to admin-created accounts. Defaults:
  `minLength 12`, letter + digit + symbol, `blockCommon` (bundled list),
  `blockUsername`. Configurable per facility via the security policy below.
- The bundled common-password check and the username-containment check apply only
  to the strict policy.

## 3. Token → cookie migration (frontend)

- The server still returns `session.token` / `refreshToken` in the response body
  **only when `ENABLE_BODY_TOKEN` is set** (dev default). Production omits them.
- The browser stores the session in `HttpOnly` cookies; the SPA never reads them.
  Mutating requests also echo the CSRF double-submit token (`X-CSRF-Token` from
  the `swasthyaflow.csrf` cookie) — the backend rejects cookie-authenticated
  unsafe requests that lack it (403).
- The SPA request layer (`frontend/src/services/api.ts`) is migration-safe:
  a legacy bearer token, when present, is still sent; every request uses
  `credentials: 'include'`; a 401 triggers exactly one silent refresh via
  `POST /auth/refresh`. The refresh call includes the readable CSRF double-submit
  value when present, and concurrent refresh attempts share one in-flight call.
- After upgrading the browser session, users do not need to sign in again — the
  refresh cookie rotates transparently.

## 4. Rate limiting

- Implemented in-process (no longer `express-rate-limit`). Limits live in the
  per-facility security policy (`global`, `auth`, `sensitive`, `upload`, `sync`
  per-minute buckets). Adjust them in the **Security → Security policy** screen.

## 5. New security administration surface

- Frontend: **Security** page (visible to every signed-in role).
  Personal: change password, TOTP 2FA, active sessions, known devices.
  Admin gated: per-facility policy editor, security events trail, lockout
  clearing, IP blocklist.
- Backend routes (all under `requireAuth` + `requireRole('facility-admin')` — a
  system-admin always passes, a facility-admin manages their own facility):
  - `GET/PUT /api/security/policy` (effective/facility policy)
  - `GET /api/security/policies` (system-admin)
  - `GET /api/security/events?type=&since=&scope=all`
  - `GET/DELETE /api/security/lockouts`
  - `GET/POST/DELETE /api/security/ip-blocklist`

## 6. Deployment checklist

1. Set the environment variables from §1 (secrets must be stable across restarts).
2. Put the app behind a proxy and set `TRUST_PROXY` so sign-in IPs are correct.
3. Confirm the cookie domain / secure flag in production.
4. `npm --prefix backend run db:seed-security` (optional) to seed the global
   security policy and reference rows in Mongo.
5. Update any integration that relied on reading `session.token` from the login
   body — production hides it; use cookies or keep `ENABLE_BODY_TOKEN=true`
   behind TLS for an interim window.
6. Verify a full pass: `backend` typecheck + tests and `frontend` build.

## 7. Commands

```bash
npm --prefix backend run typecheck          # backend typecheck
npm --prefix backend run typecheck:test     # backend test-typecheck
npm --prefix backend test                   # full backend suite (incl. test/security.test.ts)
npm --prefix backend run db:seed-security   # seed the global security policy (Mongo mode)
npm --prefix frontend run build             # frontend typecheck + production build
```

## 8. P2-16 — audit immutability + export

Every audit entry is now chained per facility (SHA-256): an entry hashes its
canonical fields plus the previous entry's hash, so editing any past entry is
detectable. This is **additive** — the existing `GET /api/audit` (`{ entries }`)
and `POST /api/audit` (`{ entry }`) contracts are unchanged; the chain fields are
extra properties on each entry.

### Migration / backfill

- Existing rows (written before this change) have no `sequenceNumber`/`hash`.
  They are chained automatically on boot (`ensureAuditChains`) — a facility whose
  entries already carry a valid hash is skipped, so restarts are cheap.
- For a large Mongo trail, run the batch tool once instead of relying on boot:
  ```bash
  npm --prefix backend run db:backfill-audit-chain
  ```
  It is idempotent and writes `audit.chain-initialised` (per facility) and
  `audit.chain-backfilled` (totals) so the migration is itself audited.

### Retention — pruning, never deletion

- Retention no longer hard-deletes audit entries. The sweep replaces them with a
  **tombstone** (`pruned: true`) that keeps `id`/`sequenceNumber`/`previousHash`/
  `hash` so the chain still links, drops `detail`/`sessionId`/`actor`, and stores
  a `prunedHash` binding the tombstone to the original hash. Continuity survives.
- This is irreversible by design; the raw content is gone once pruned.

### New routes (facility-admin owns their facility, system-admin any)

- `GET /api/audit/paged`, `GET /api/audit/count`, `GET /api/audit/search`
- `GET /api/audit/chain/:facilityId/verify`
- `GET /api/audit/chain/:facilityId/entry/:sequenceNumber/verify`
- `GET /api/audit/chain/:facilityId/meta`
- `POST /api/audit/export` (CSV/JSON/PDF, 50 MB cap, anonymised) and
  `GET /api/audit/export/:ref` to download a stored export (retention category
  `export-files`).

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `AUDIT_VERIFY_SCHEDULER_ENABLED` | Enables the background chain-verification sweep. | off |
| `AUDIT_VERIFY_INTERVAL_MINUTES` | Interval for the background verification job. | `1440` |

### Notes

- CSV/JSON exports are UTF-8 with localised headers; the PDF renders with a
  standard WinAnsi font, so non-Latin (Hindi/Odia) labels fall back to a
  placeholder there. JSON keys are always English.
- `pdf-lib` is the only new dependency.
