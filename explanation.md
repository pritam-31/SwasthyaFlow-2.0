# आरोग्य Sathi (SwasthyaFlow 2.0) — Complete Project & Technical Explanation

> **आरोग्य Sathi** is a **human-in-the-loop multimodal healthcare triage assistant**.
> It organises patient intake information (voice, text, image/OCR) and prepares a
> **draft triage note** for a qualified healthcare worker to review.
>
> It is **non-diagnostic by design** — it never diagnoses, never prescribes, and
> never replaces a medical professional. Every AI-produced note is a **draft**
> until a human accepts, edits, or rejects it.

---

## 1. What This Project Does (Project Overview)

| Dimension | Detail |
| --- | --- |
| **Product** | Multilingual (English / Hindi / Odia) healthcare triage decision-support prototype |
| **Model** | Human-in-the-loop — AI drafts, a qualified healthcare worker decides |
| **Inputs** | Voice (Web Speech API), typed text, file upload (OCR of reports/photos) |
| **Outputs** | Structured triage note, observations, urgency flags (workflow labels), follow-up questions, risk score |
| **Guarantee** | PII is stripped before storage/analysis; no diagnosis, no prescription, no treatment plan |
| **Status** | Production-grade prototype with strong security/privacy hardening (P0 → P2 phases) |

### Core goal
1. **Organise** patient intake data (voice, text, attachments) into a structured form.
2. **Redact PII** (names, phones, IDs, addresses) before any analysis layer.
3. **Run multilingual triage rules** to produce observational **drafts**.
4. **Flag urgency signals** — these are *workflow labels only*, never diagnoses.
5. **Identify missing information** and generate follow-up questions.
6. **Keep a full audit trail** for every meaningful action.

---

## 2. High-Level System Architecture

The system is split into **three components** (a monorepo):

```
┌────────────────────┐        /api        ┌─────────────────────┐        HTTP/JSON        ┌──────────────────────┐
│   React PWA         │ ─────────────────► │  Node.js + Express   │ ─────────────────────► │  Python FastAPI AI    │
│   (frontend)        │ ◄───────────────── │  backend (port 4000)│ ◄───────────────────── │  service (port 8000)  │
│   port 5173         │    JSON responses  │                     │   severity JSON        │                       │
└────────────────────┘                    └─────────────────────┘                        └──────────────────────┘
                                                  │
                                                  └─ Falls back to the in-process priority
                                                     scorer if the AI service is unreachable
```

- The **browser never talks to the AI service directly** — the Node backend is the
  only caller, so auth, facility scoping, PII anonymisation and the audit trail
  stay in one place.

### Three parts of the monorepo

| Component | Directory | Stack | Role |
| --- | --- | --- | --- |
| **Frontend** | `frontend/` | React 19 + TypeScript + Vite + Tailwind CSS 4 + MUI + PWA | Web app: intake, triage review, reports, referrals, admin screens |
| **Backend** | `backend/` | Node.js + Express 4 + TypeScript + MongoDB | REST API: auth, triage rules, anonymisation, audit, retention, queue, security |
| **AI service** | `ai-service/` | Python 3.10+ + FastAPI | Optional data-driven severity scoring (0-100), triage level, explainability |

---

## 3. Full Directory / File Structure

```
आरोग्य Sathi/
├── package.json               # Root scripts (dev:frontend, dev:backend, build, lint)
├── README.md                  # Main user documentation
├── MIGRATION.md               # P1-12 / P2-16 security-hardening migration notes
├── explanation.md             # THIS FILE — full project + technical explanation
├── render.yaml                # Render Blueprint → deploys ai-service as a Docker web service
├── eng.traineddata            # Tesseract OCR trained data (English)
├── hin.traineddata            # Tesseract OCR trained data (Hindi)
├── ori.traineddata            # Tesseract OCR trained data (Odia/Oriya)
├── reportparser_head.txt      # Sample/header text used by the report parser
├── backend/                   # Express + TypeScript REST API (port 4000)
├── frontend/                  # React + Vite PWA (port 5173)
└── ai-service/                # Python FastAPI severity-scoring service (port 8000)
```

---

## 4. Tech Stack (Detailed)

### Frontend — `frontend/`
| Area | Technology |
| --- | --- |
| Framework | React 19, TypeScript ~6.0 |
| Build tool | Vite 8 (+ `--configLoader native|bundle`) |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`), MUI 9 (`@mui/material`, `@mui/x-data-grid`), Emotion |
| Routing | react-router-dom 7 (**HashRouter**) with a route table + role guards |
| Animations / icons | framer-motion, lucide-react |
| PWA | vite-plugin-pwa (Workbox service worker, offline caching, installable app) |
| Speech input | Web Speech API (en-IN / hi-IN / or-IN), degrades to typing/upload |
| Testing | Vitest (+ Testing Library, Playwright e2e) |
| Linting | oxlint |

### Backend — `backend/`
| Area | Technology |
| --- | --- |
| Runtime | Node.js 20+ |
| Framework | Express 4 + TypeScript 5 |
| Dev runner | tsx (`tsx watch src/index.ts`) |
| Persistence | MongoDB (Mongoose models in `src/db/`); in-memory stores for local dev |
| Validation | zod (centralised env validation + input validation) |
| Passwords | argon2 |
| Auth/2FA | httpOnly cookies, rotating refresh tokens, otplib + qrcode (TOTP) |
| CSRF | Double-submit token (`swasthyaflow.csrf` cookie) |
| Images/OCR | sharp, tesseract.js (+ eng/hin/or traineddata), multer |
| Cloud | cloudinary (image/report storage) |
| PDF | pdf-lib, pdf-parse |
| Security headers | helmet |
| Testing | Node's built-in test runner (`node:test`) via `tsx --test` |

### AI service — `ai-service/`
| Area | Technology |
| --- | --- |
| Runtime | Python 3.10+ (developed on 3.13) |
| Framework | FastAPI + uvicorn |
| ML (lite) | numpy, scikit-learn, joblib (fits Render free plan) |
| ML (full) | torch / transformers / xgboost / lightgbm / shap (optional) |
| Storage | SQLite (predictions + feedback store), salted SHA-256 PII hashing |
| Testing | pytest (~43 tests) |

---

## 5. Core Pipeline (Per Intake)

| Step | What happens |
| --- | --- |
| **1. Input** | User submits intake via voice (Web Speech API), text, or file upload (OCR). Input language can be English, Hindi, or Odia (mixed-script "Hinglish/Odlish" handled). |
| **2. PII Anonymisation** | Unified anonymisation pipeline (P0-7) strips names, phones, IDs, addresses, DOB, emails etc. via regex + OCR-aware rules. Runs **before** anything reaches the analysis layer. |
| **3. Language Detection** | Script detection normalises to `en` / `hi` / `or`. |
| **4. Multilingual Triage Analysis** | Language-aware rule engine runs: urgency keyword matches, missing-information checks, follow-up question generation. Output is **observational only**. |
| **5. Note Construction** | Structured note with chief complaint, history, vitals, observations, urgency flags, missing-info, follow-up questions, risk score (High/Medium/Low), non-diagnostic disclaimer. |
| **6. Human Review** | Nurse/doctor reads the AI draft → can **accept**, **edit**, or **mark final** for the facility. |

---

## 6. Backend — Deep Technical Details

### 6.1 Request pipeline (`backend/src/app.ts`)

The Express middleware order is deliberate (hardened, P1-12 → P2-16):

```
trust proxy → request id → security headers → CORS → cookie parse → CSRF →
JSON body (1MB) → input validation → anomaly detection → health → DB health →
global rate limit → auth routes → session auth (requireAuth) →
facility scope → IP allowlist → sensitive rate limit → security routes →
offline origin → idempotency → feature routers → notFound → errorHandler
```

Key files:
- `src/index.ts` — boot: retries persistence init 3×, ensures audit hash chains, loads rule registry, starts schedulers, listens (with EADDRINUSE retry for fast dev restarts).
- `src/app.ts` — `createApp()` wires the whole pipeline.
- `src/config/env.ts` — zod-validated env, fail-closed production gate (`assertProductionEnv`).

### 6.2 Routes (feature routers)

Mounts under `/api/...` (from `app.ts` and `routes/`):

`auth`, `sessions`, `triage`, `ai-triage`, `audit`, `consent`, `bias`, `modelcard`,
`feedback`, `language`, `anonymisation`, `reports`, `retention`, `retention-ui`,
`rich-coverage`, `visuals`, `facilities`, `security`, `confidence`, `queue`,
`queue-stream` (SSE), `sync`, `departments`, `doctors`, `appointments`,
`notifications`, `admin/appointments`.

Health checks: `GET /health` and `GET /api/health`.

### 6.3 Core services (selection of `src/services/`)

| Service | Purpose |
| --- | --- |
| `unifiedAnonymizer.ts` / `anonymizer.ts` / `multilingualAnonymizer.ts` | PII redaction engine — the unified P0-7 pipeline |
| `multilingualTriageService.ts` / `triageService.ts` | Language-aware rule-based triage note generation |
| `aiTriageService.ts` | Bridges backend ↔ Python AI service; falls back to `computePriority()` when AI is down |
| `auditStore.ts` / `auditChainService.ts` | Audit entries + SHA-256 per-facility hash chaining |
| `authStore.ts` / `refreshTokenService.ts` / `twoFactorService.ts` | Auth sessions, rotating refresh cookies, TOTP |
| `passwordHasher.ts` / `passwordPolicyService.ts` / `lockoutService.ts` | Argon2 hashing, strict policy, lockout tracking |
| `priorityScoringService.ts` / `priorityScheduler.ts` / `queueService.ts` / `priorityOverrideService.ts` | Triage queue ordering, SLA tracking, overrides |
| `retentionService.ts` / `retentionScheduler.ts` / `tombstoneStore.ts` / `consentRetentionService.ts` | Data retention, consent withdrawal, tombstoning (prune-not-delete for audit) |
| `confidenceService.ts` / `confidencePolicyService.ts` / `lowConfidenceService.ts` | Extraction confidence scoring + policy |
| `followUpGenerator.ts` / `followUpService.ts` / `followUpSafety.ts` | Dynamic follow-up questions (never request PII, never diagnose) |
| `timelineBuilder.ts` / `timelineExtractor.ts` / `timelineSorter.ts` / `timelineSummarizer.ts` | Chronological patient-event timeline |
| `reportParser.ts` / `reportMerger.ts` / `reportService.ts` / `ocrService.ts` | OCR + lab/report extraction |
| `visualService.ts` / `visualFeatureService.ts` / `imageIngestService.ts` / `imageStore.ts` | Photo/visual capture with face/region redaction (sharp) |
| `biasReportService.ts` / `modelCardService.ts` / `failureModeService.ts` | Responsible-AI reporting (bias/metrics/model cards) |
| `syncService.ts` / `offlineOrigin.ts` / `idempotencyService.ts` | Offline queue sync + idempotent writes |
| `referralService.ts` / `noteReviewService.ts` / `reviewerFeedbackService.ts` | Referrals, review chain, feedback |
| `securityEventService.ts` / `ipBlocklistService.ts` / `rateLimitService.ts` / `deviceService.ts` / `anomalyDetection.ts` | Security hardening |
| `slaService.ts` / `retentionSlaService.ts` | SLA config + retained-data SLA checks |
| `voiceMetricsService.ts` / `transliterationService.ts` / `languageDetectionService.ts` | Voice metrics, transliteration, language detection |
| `appointmentService.ts` / `doctorService.ts` / `departmentService.ts` / `notificationService.ts` | Patient appointment system |

### 6.4 Data model & MongoDB collections (`src/db/`)

Mongoose models include: `User`, `LoginSession`, `RefreshToken`, `Patient`,
`PatientSession`, `TriageNote`, `AuditEntry`, `AuditChainMeta`, `Tombstone`,
`ConsentRecord`, `ConsentEvent`, `ConsentPolicyVersion`, `RetentionRule`,
`RetentionAction`, `AnonymisationReport`, `RedactionMap`, `ExtractedReport`,
`ExtractedVisual`, `Timeline`, `FollowUpQuestion`, `Referral`, `PriorityOverride`,
`SlaConfig`, `SecurityPolicy`, `SecurityEvent`, `RateLimit`, `IpBlocklist`,
`Device`, `Lockout`, `ModelCard`, `FailureMode`, `BiasReport`, `Feedback`,
`ReviewerFeedback`, `ConfidencePolicy`, `LowConfidenceReviewAction`, `EvaluationRun`,
`IdempotencyKey`, `CloudinaryAsset`, `Facility`, `Department`, `Doctor`,
`DoctorAvailability`, `Appointment`, `AppointmentAudit`, `AppointmentNotification`,
`SeedMarker`.

> **Note:** `USE_IN_MEMORY_STORES` (dev default) runs the same stores in process
> memory; production always requires `MONGODB_URI` + `MONGODB_DB_NAME`.

### 6.5 Middleware (`src/middleware/`)

`auth.ts` (`requireAuth`, `requireRole`), `requestId`, `securityHeaders`,
`csrf`, `inputValidation`, `anomalyDetection`, `dbHealth`, `rateLimit`,
`trustProxy`, `ipAllowlist`, `facilityScope`, `offlineOrigin`, `idempotency`,
`errorHandler`.

---

## 7. PII Anonymisation Pipeline (Unified — P0-7) — Deep Dive

The unified anonymiser (`backend/src/services/unifiedAnonymizer.ts`) is the core
PII-redaction engine:

- **Modality-aware**: different pattern sets for `intake-text`, `report-metadata`, `log-message`, `error-message`, etc.
- **Multilingual**: pattern sets for English (`en`), Hindi (`hi`), Odia (`or`); script detection normalises input first.
- **Overlap resolution**: greedy, non-overlapping selection (earliest start → longest match → most confident).
- **Canonical placeholders**, localised to `[NAME]`, `[PHONE]`, `[AADHAAR]`, `[PAN]`, `[ID]`, `[ADDRESS]`, `[DOB]`, `[EMAIL]`, ... per language.
- **Image anonymisation**: OCR + face/region heuristic, black-out painting via `sharp` (only redacted images are kept).
- **Object-walk anonymisation**: deep-walks JSON-like values, redacting every string.
- **Confidence scoring**: `computeAnonymisationConfidence` on every match.
- **Leak testing**: `eval/` harnesses verify no synthetic PII survives (PII leak test).

The legacy `anonymizer.ts` provides `anonymizeBase()` (case-insensitive Latin
regex rules) and the public `anonymize()` delegates to the unified pipeline for
the `intake-text` modality.

---

## 8. Multilingual Triage Engine — Deep Dive

`multilingualTriageService.ts` runs the fixed pipeline:

1. **Detect script language** (en/hi/or, mixed-script handling).
2. **Anonymise** via the unified pipeline *before* analysis.
3. **Enforce per-language non-diagnostic phrases** — banned patterns replaced with system-authored statements.
4. **Run workflow rules** per language rule set:
   - **Urgency signals** — keyword flags (`red`/`amber`, severity), workflow labels only.
   - **Missing-information checks** — detects absent fields in the narrative.
   - **Follow-up questions** — dynamic, context-aware, in the narrative's language.
5. **Construct the triage note**:
   - `structuredNote.{chiefComplaint, history, vitals}`
   - `observations` (up to 6 sentences)
   - `urgencyFlags` (with confidence scores)
   - `missingInformation`
   - `followUpQuestions`
   - `riskScore` (High / Medium / Low from flag severities)
   - `status: 'ai-draft'`, `disclaimer`, `generatedAt`, `language`

Language rule sets load from `getRuleSet(code)` and contain banned phrases,
urgency patterns, missing-info checks, section labels, and the disclaimer text.

---

## 9. Python AI Triage Service (`ai-service/`) — Deep Dive

A data-driven, **non-diagnostic** severity scorer. It takes a real patient record
(vitals, symptoms text, labs, history, optional imaging) and returns a severity
score `0–100`, triage level, explainable factor breakdown, red flags, missing
data and a suggested action plan.

### Analysis layers

| Layer | Method |
| --- | --- |
| Vitals | NEWS2 + qSOFA + Isolation Forest anomaly detection |
| Symptoms | Multilingual NLP classifier (EN+HI), else bilingual lexicon (Odia via lexicon) |
| Labs | Reference-range rules (critical / high / low flags) |
| History | scikit-learn logistic model (learned from a generated cohort) |
| Imaging | Optional ECG/X-ray hook (off unless images supplied) |
| Fusion | **Learned** least-squares weights over components (fitted from data) |
| Explainability | Per-factor signed contributions ("why this score") |
| Feedback | Doctor override store + retrain endpoint (SQLite, PII pseudonymised) |

Learned fusion weights (approx.): `vitals 0.297 · labs 0.251 · symptoms 0.248 · history 0.148 · images 0.057`.

Band policy: `0–25 LOW · 26–50 MODERATE · 51–75 URGENT · 76–100 CRITICAL`.

### API surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness + which models are loaded |
| `GET` | `/model-info` | — | Fusion weights, component methods, NLP backend |
| `POST` | `/predict-severity` | Bearer* | Score one patient record |
| `POST` | `/override` | Bearer* | Record a doctor confirmation/override |
| `POST` | `/feedback/retrain` | Bearer* | Re-fit fusion weights from feedback |
| `GET` | `/feedback/summary` | — | Feedback agreement stats |

\* Only required when `AI_SERVICE_TOKEN` is set.

### Code layout

`app/main.py` (FastAPI endpoints) → `pipeline.py` (orchestration) →
`preprocessing.py` (coercion/normalisation) → `reference_ranges.py` (NEWS2/qSOFA/labs)
→ `analyzers/` (vitals, nlp, lab, history, image) → `fusion.py` (learned weights)
→ `triage.py` (band → level → action policy) → `explainability.py` (factor
contributions) → `storage.py` (SQLite + PII hashing) → `override_feedback.py`
(doctor override + retrain) → `model_store.py` / `schemas.py`.

### Fallback behaviour (important)

| Situation | `result.source` | What happens |
| --- | --- | --- |
| AI configured + reachable | `ai-service` | Full AI result |
| AI configured but unreachable / 5xx | `fallback` | `computePriority()` mapped to a triage level; `fallbacksUsed` explains why |
| `AI_SERVICE_URL` empty | `fallback` | `computePriority()`; `fallbacksUsed: ["ai-service-not-configured"]` |

The UI shows an amber **Local fallback / Degraded** badge so a degraded estimate
is never mistaken for the full model.

---

## 10. Auth, Security & Privacy (Hardened)

### Authentication model
- **Self-registration always creates a `patient` account**; staff accounts are created by an admin.
- Sessions live in **httpOnly cookies** (`swasthyaflow.sid` / `swasthyaflow.rt` — rotating refresh cookie, chain-named for key rotation `_V1/_V2/...`).
- **CSRF double-submit token** (`swasthyaflow.csrf`, readable by design) echoed as `X-CSRF-Token` for mutating requests.
- **TOTP 2FA** optional (endpoints gated by `ENABLE_2FA`).
- **Strict password policy** (min 12 chars, letter + digit + symbol, common-password block, username-containment block) on change-password / admin-created accounts; legacy ≥8-for-registration rule preserved.
- **Lockout tracking**, **IP blocklist**, **per-facility CIDR allowlist**, **anomaly detection** screen, **rate limiting** (global / auth / sensitive / upload / sync buckets defined in per-facility security policy).
- **`TRUST_PROXY`** must be set behind a proxy so `req.ip` is correct.

### Safety rules (mirrored in `backend/src/types/index.ts` and `frontend/src/services/safetyPolicy.ts`)
1. **Never store or return raw patient identifiers** — only redacted text. PII is stripped by `anonymize()` **before** analysis.
2. **The AI layer outputs observations, urgency signals, missing-info checks and follow-up questions only** — never a diagnosis, prescription or treatment plan.
3. **Every response carries a non-diagnostic disclaimer**; urgency flags are workflow labels, never a diagnosis.
4. **Output guard** (`enforceNonDiagnostic` / `assertNonDiagnostic` / `sanitizeForNonDiagnostic`) rewrites or blocks diagnosis/prescription language in model output.
5. **Consent + non-diagnostic acknowledgement required** before a session can be created.
6. **Every meaningful action writes an audit entry**; actor & role come from the login session (never the request body), so the trail cannot be forged.

---

## 11. Audit Trail & Chain Integrity (P2-16)

- Every meaningful action (session creation, note edit, accept, mark final, referral, override...) writes an **audit entry** to MongoDB.
- Entries carry: `facilityId`, `sessionId`, `actor`, `role`, `action`, `detail`, `category`, `at`.
- **SHA-256 hash chaining per facility**: each entry hashes its canonical fields + the previous entry's hash, so editing any past entry is detectable.
- Boot-time `ensureAuditChains()` / `backfillAuditChain()` chain legacy entries (idempotent).
- Scheduler `auditVerificationScheduler` periodically verifies chain integrity.
- **Retention prunes, never hard-deletes**: entries become tombstones (`pruned: true`) that keep `id/sequenceNumber/previousHash/hash` so the chain still links.
- Export routes: `GET /api/audit/paged|count|search`, chain verify routes, and `POST /api/audit/export` (CSV/JSON/PDF, anonymised).

---

## 12. Roles & Permissions (RBAC)

UI source of truth: `frontend/src/services/rbacService.ts`; backend enforces the
same matrix server-side.

| Permission | Patient | Nurse | Doctor | Admin |
| --- | --- | --- | --- | --- |
| Edit the AI-prepared structured note | — | ✅ | ✅ | ✅ |
| Accept the AI draft as reviewed | — | ✅ | ✅ | ✅ |
| Mark the note final for the facility | — | — | ✅ | ✅ |
| Draft an escalation / referral note | — | ✅ | ✅ | ✅ |
| Approve and release a referral | — | — | ✅ | ✅ |
| Read the audit trail | own sessions only | ✅ | ✅ | ✅ |
| Manage user accounts and roles | — | — | — | ✅ |
| Prescribe | ❌ | ❌ | ❌ | ❌ |

`canPrescribe` is literally `false` for every role. Roles: `patient`, `nurse`,
`doctor`, `facility-admin`, `admin` (alias of system-admin), `system-admin`.

### Frontend route roles (`frontend/src/app/routes.tsx`)
- `CLINICAL_ROLES` = nurse, doctor, admin, facility-admin, system-admin
- `ADMIN_ROLES` = admin, facility-admin, system-admin
- `EVERYONE` = patient + all clinical roles

---

## 13. Frontend — Screens & Routes

Public: `/` (Landing), `/login` (Login/register).

Authenticated area under `/app` (HashRouter):

| Route | Screen | Access |
| --- | --- | --- |
| `/app` | Dashboard | all roles |
| `/app/triage` | Triage Queue | clinical |
| `/app/review` | Reviewer Workspace (human-in-the-loop note editing) | clinical |
| `/app/ai-triage` | AI Triage (run severity, review, override) | clinical |
| `/app/cases`, `/app/cases/:caseId` | Patients / Case detail | all roles |
| `/app/new-intake` (alias `/app/intake`) | New Intake (voice, text, attachments) | all roles |
| `/app/appointments` (+ `/book`, `/:id`) | Appointments booking/schedule | all roles |
| `/app/reports` | Reports (upload/OCR/extract) | clinical |
| `/app/referrals` | Referrals | clinical |
| `/app/followups` | Follow-up questions | all roles |
| `/app/camps` | Health Camps | clinical |
| `/app/analytics` | Analytics | admin |
| `/app/audit` | Audit Logs (chain, verify, export, tombstones) | admin |
| `/app/users` | Users | admin |
| `/app/facilities` | Facilities | admin |
| `/app/settings` | Settings | admin |
| `/app/security` | Security (password, 2FA, sessions, devices, policy, events, blocklist) | all roles |
| `/app/model-card` | Model Cards | all roles |
| `/app/bias` | Bias Evaluation | admin |
| `/app/feedback` | Feedback | all roles |
| `/app/data-privacy` | Data & Privacy (consent, retention) | all roles |
| `/app/notifications` | Notifications | all roles |

### Frontend structure highlights
- `src/app/routes.tsx` — **single source of truth** for routes, roles, nav labels and guards (`RouteGuard`, `navRoutesForRole`, `canAccess`).
- `src/services/api.ts` — single HTTP client: attaches bearer token, `X-Facility-Id`, idempotency key, CSRF header; transparent 401→refresh retry; transient (502/503/504) retry; offline-origin marking; multipart + blob helpers.
- `src/services/safetyPolicy.ts` — non-diagnostic copy (EN/HI/OR), output guard, PII-request detection, safe visual labels.
- `src/hooks/useSpeechToText.ts` — Web Speech API en-IN/hi-IN/or-IN.
- PWA: `vite.config.ts` uses `vite-plugin-pwa` (auto-update, Workbox network-first for anonymised session/sync endpoints only; report/visual blobs are intentionally excluded from caching).

---

## 14. Offline Support & Sync (P1-8)

- **Offline queue** (`services/offlineQueue.ts`, `offlineDb.ts`) stores writes locally (IndexedDB) when the device is offline.
- **Queued writes are human-in-the-loop drafts** until they sync.
- **Conflicts are never auto-resolved** — a person chooses which version to keep (`ConflictResolver.tsx`).
- Service worker caches only anonymised, offline-safe GET endpoints (`/api/sessions/...` and `/api/sync/version`).
- Backend marks replayed writes with `x-offline-origin: true` and audits them with `offlineOrigin`, `queuedAt`, `syncedAt`.
- Idempotency keys (`IdempotencyKeyModel`) make retries safe on allowlisted endpoints.

---

## 15. Background Schedulers

| Scheduler | Purpose |
| --- | --- |
| `retentionScheduler` | Purges/erasures old data per retention config |
| `priorityScheduler` | Re-evaluates triage priority flags / queue ordering |
| `auditVerificationScheduler` | Periodically verifies audit hash-chain integrity |

AI service retrain (`POST /feedback/retrain` or `AI_AUTO_RETRAIN_ON_OVERRIDE=true`).

---

## 16. Configuration & Environment Variables

### Backend (`backend/.env.example` — not committed)
| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `MONGODB_URI` / `MONGODB_DB_NAME` | local `swasthyaflow` | Durable persistence (required in prod) |
| `USE_IN_MEMORY_STORES` | on (dev) | In-memory prototype mode |
| `SEED_ON_BOOT` | on (dev) | Seeds demo accounts/data; prod only when explicitly enabled |
| `SESSION_SECRET_V1` / `REFRESH_SECRET_V1` / `CSRF_SECRET_V1` / `TWO_FACTOR_ENC_KEY_V1` | random per boot | Cookie/session signing keys (must be stable + secret in prod) |
| `COOKIE_SAME_SITE` | lax (dev) / none (prod) | Cookie policy |
| `CORS_ORIGIN` | `http://localhost:5173,...` | Allowed browser origins |
| `TRUST_PROXY` | `false` | Reverse-proxy hops for correct `req.ip` |
| `ENABLE_RATE_LIMIT` | off (dev) / always on (prod) | In-process rate limiter |
| `ENABLE_2FA` | true | TOTP endpoints switch |
| `ENABLE_BODY_TOKEN` | on (dev) / off (prod) | Return `session.token` in body (migration convenience) |
| `CSP_REPORT_ONLY` | false | Content-Security-Policy report-only mode |
| `CLOUDINARY_CLOUD_NAME/KEY/SECRET` | — | Image/report storage (required in prod) |
| `AI_SERVICE_URL` | empty | Python AI service URL (empty = feature disabled → local fallback) |
| `AI_SERVICE_TOKEN` | empty | Shared bearer secret to the AI service |
| `AI_SERVICE_TIMEOUT_MS` | 4000 | Outbound AI-call timeout |

### AI service (`ai-service/.env.example`)
| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_HOST` / `AI_PORT` | `0.0.0.0` / `8000` | Bind address |
| `AI_MODELS_DIR` / `AI_DATA_DIR` | `./models` / `./data` | Artifacts + storage |
| `AI_DB_PATH` | `./data/predictions.sqlite3` | Predictions + feedback store |
| `AI_PII_SALT` | `change-me-in-production` | **Change in prod** — salted SHA-256 PII hash salt |
| `AI_NLP_MODEL` | `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` | Transformer NLP model |
| `AI_SERVICE_TOKEN` | empty | Bearer token gate |
| `AI_CORS_ORIGINS` | empty | Direct browser origins (normally none) |
| `AI_ENABLE_FEEDBACK` | true | Override/feedback store toggle |
| `AI_AUTO_RETRAIN_ON_OVERRIDE` | false | Auto re-fit weights on each override |

### Frontend
- `VITE_API_BASE_URL` — local dev only; **production uses a same-origin `/api` proxy** (Vercel `vercel.json` proxies `/api` + `/health` to Railway so auth cookies stay first-party).

---

## 17. Getting Started & Commands

### Requirements
- Node.js 20+ (frontend pins Node 22)
- npm
- (AI service) Python 3.10+

### Install
```bash
npm install                 # root
npm install --prefix frontend
npm install --prefix backend
```

### Run (two terminals)
```bash
npm run dev:backend         # API on http://localhost:4000
npm run dev:frontend        # web app on http://localhost:5173
```
The Vite dev server proxies `/api` and `/health` to the backend — no CORS setup needed in dev.

### Root scripts
| Script | What it does |
| --- | --- |
| `npm run dev:frontend` | `frontend` → `vite` |
| `npm run dev:backend` | `backend` → `tsx watch src/index.ts` |
| `npm run build` | Build frontend (`tsc -b && vite build`) then backend (`tsc`) |
| `npm run lint` | `oxlint` in the frontend |

### Backend scripts
| Script | What it does |
| --- | --- |
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/index.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Full backend suite (security, audit chain, retention, multilingual, reports, visuals, ai-triage, ...) |
| `db:seed` / `db:indexes` / `db:backup` / `db:reset` | DB ops |
| `db:migrate-facility-scope` | Migrate legacy rows to tenant scoping |
| `db:backfill-audit-chain` | Chain legacy audit rows |
| `db:seed-security` / `db:seed-sla` | Seed global policy / SLA configs |
| `eval:generate` / `eval:run` / `eval:leak` | Evaluation harness (dataset gen, layer eval, PII leak test) |

### AI service
```bash
cd ai-service
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt                  # core
# optional: pip install -r requirements-ml.txt    # full ML stack
python -m scripts.generate_sample_data
python -m scripts.train_history_model
python -m scripts.train_fusion_model
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
python -m pytest -q                               # 43 tests
```

---

## 18. Deployment

### AI service (optional but recommended)
- **Render**: `render.yaml` Blueprint → Docker web service from `ai-service/Dockerfile` (`INSTALL_ML=lite` fits free 512 MB plan; `full` needs paid). Health check `/health`. Trained artifacts are baked into the image.
- **Railway**: `ai-service/railway.json`, root directory = `ai-service`, build arg `INSTALL_ML=lite`, generate domain, set equal `AI_SERVICE_TOKEN` on both sides, attach a **Volume at `/app/data`** to persist the feedback store.

### Backend
- Railway/Render/Hosted Node service, `MONGODB_URI` + secrets required in production; put behind a proxy and set `TRUST_PROXY`.

### Frontend
- Vercel: set **root directory = `frontend`** so `frontend/vercel.json` applies (proxies `/api` + `/health` to the backend host, keeping cookies first-party).

> Render's free plan sleeps after ~15 min idle; the backend's AI timeout fallback keeps triage working (UI shows "Local fallback" badge).

---

## 19. Testing Strategy

| Layer | Tooling | Coverage |
| --- | --- | --- |
| Backend | Node `node:test` via `tsx --test` | 22 test files incl. security.test.ts, auditChain.test.ts, retention.test.ts, multilingual.test.ts, reports/visuals/timeline/followups/anonymisation/sync/facilities/priority/modelcard/bias/confidence/feedback/consent/retentionUi/richCoverage/appointments/aiTriage |
| Frontend unit | Vitest + Testing Library | api.test.ts, routes.test.ts, displayName, roleData, FloatingPanel |
| Frontend e2e | Playwright | `npm run test:e2e` |
| AI service | pytest (~43) | preprocessing, vitals (NEWS2/qSOFA), symptom NLP, labs, history, fusion bands, explainability, override persistence, API + malformed input |

Typechecks: backend `tsc --noEmit` (+ `tsc -p tsconfig.test.json`), frontend via `tsc -b` during build.

---

## 20. Evaluation Harness (`backend/src/eval/`)

- Dataset generation (synthetic, PII-injected) → `eval:generate`.
- Layer evaluation (anonymiser leak test, bias evaluation, layer evaluation with precision/recall/F1) → `eval:run`.
- `eval:leak` — dedicated PII leak test verifying no synthetic identifier survives anonymisation.

---

## 21. Known Trade-offs / Prototype Notes

- **In-memory stores** are the local default; Mongo is the production-grade path.
- **Body tokens** are dev-only; production uses solely httpOnly cookies (same-origin proxy required for first-party cookies).
- **PDF exports** use a standard WinAnsi font, so Hindi/Odia labels fall back to placeholders in PDFs.
- **Audit retention is prune-not-delete** (tombstoning) to preserve chain integrity; irreversible once pruned.
- **AI service** on a free tier sleeps; the backend degrades to the in-process priority scorer gracefully.

---

## 22. One-Phrase Summary

**आरोग्य Sathi (SwasthyaFlow 2.0)** = a privacy-first, multilingual, human-in-the-loop
healthcare **triage note** generator — React PWA → Node/Express API (auth, PII
anonymisation, rule-based triage, audited + chained record-keeping) → optional
Python FastAPI severity scorer — where the AI only **drafts**, and a qualified
healthcare worker always **decides**.