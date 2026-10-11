# SwasthyaFlow

**Human-in-the-loop multimodal healthcare triage assistant (non-diagnostic).**

SwasthyaFlow organises patient information and prepares a triage note for a qualified healthcare worker. It does not diagnose, does not prescribe, and does not replace a medical professional. Every AI-prepared note is a draft until a human accepts or edits it.

---

## Purpose

SwasthyaFlow is a prototype human-in-the-loop system that assists healthcare triage by:

- **Organising patient intake data** (voice, text, attachments) into structured format
- **Redacting PII** (personal identifiers) before any analysis layer
- **Running multilingual triage rules** to produce observational drafts
- **Flagging urgency signals** (workflow labels, not diagnoses)
- **Identifying missing information** and generating follow-up questions
- **Providing a complete audit trail** for every action

It is explicitly **non-diagnostic**: the AI outputs observations, urgency signals, and questions only. A qualified healthcare worker reviews, accepts, edits, or rejects every draft.

---

## How It Works

### Core Pipeline (per intake)

| Step | Description |
|---|---|
| **1. Input** | User submits intake via voice (Web Speech API, en-IN/hi-IN/or-IN), text, or file upload (OCR) |
| **2. PII Anonymisation** | Unified anonymisation pipeline (P0-7) strips names, phones, IDs, addresses, etc. via regex + OCR-aware rules. Runs before anything reaches the analysis layer. |
| **3. Language Detection** | Script detection normalises to en/hi/or. Mixed-script (Hinglish/Odlish) input is handled. |
| **4. Multilingual Triage Analysis** | Language‑aware rule set runs: urgency keyword matches, missing‑information checks, follow‑up question generation. Output is observational only — no diagnosis, prescription, or treatment plan. |
| **5. Note Construction** | Structured note with chief complaint, history, vitals, observations, urgency flags, missing‑info items, follow‑up questions, risk score, and non‑diagnostic disclaimer. |
| **6. Human Review** | Healthcare worker reads the AI‑draft note, can accept it as‑is, edit it, or mark it final for the facility. |

### Safety & Privacy Rules (mirrored in `backend/src/types/index.ts` and `frontend/src/services/safetyPolicy.ts`)

- **Never store or return raw patient identifiers** — only redacted text. PII is stripped by `anonymize()`/`anonymiseText()` **before** anything reaches the analysis layer (`name`, `phone`, `id-number`, `email`, `address`, `date-of-birth`).
- **AI layer outputs observations, urgency signals, missing‑information checks and follow‑up questions only**: never a diagnosis, prescription or treatment plan.
- **Every response carries a non-diagnostic disclaimer**; urgency flags are workflow labels produced by keyword rules — never a diagnosis.
- **Guard (`enforceNonDiagnostic` / `assertNonDiagnostic`)** rewrites or blocks diagnosis‑ and prescription‑language in model‑generated content.
- **Consent and the non-diagnostic acknowledgement are required** before a session can be created.
- **Every meaningful action writes an audit entry**; actor and role always come from the login session, never from the request body, so the trail cannot be forged.

---

## Architecture

```
SwasthyaFlow/
├── package.json              # root scripts (dev/build/lint)
├── README.md
├── MIGRATION.md
├── ARCHITECTURE.md           # system design: request flow, API surface, triage rules, auth model, data model and known prototype trade-offs
├── backend/                  # Express + TypeScript REST API (port 4000)
│   └── src/
│       ├── index.ts          # boot, seed users/sessions, listen
│       ├── app.ts            # express pipeline, CORS, routes, error handling
│       ├── middleware/       # auth (requireAuth, requireRole), errorHandler, security headers, csrf, ip allowlist, rate limit, anomaly detection, input validation, idempotency, offline origin, db health
│       ├── routes/           # auth, sessions, triage, audit, consent, bias, model card, feedback, language, anonymisation, reports, retention, queue, sync, facilities, security, confidence, rich coverage, visuals
│       ├── services/         # triageService, multilingualTriageService, anonymiser (unified pipeline P0-7), unifiedAnonymizer, auditStore, auditChainService, auditVerificationScheduler, priorityScheduler, retentionScheduler, auditStore, sessionStore, authStore, consentRetentionService, followUpService, followUpSafety, bodyRegionService, biasReportService, cloudinaryService, consentRetentionService, confidenceService, confidencePolicyService, deviceService, failureModeService, feedbackService, followUpGenerator, followUpSafety, idempotencyService, imageIngestService, imageStore, ipBlocklistService, languageDetectionService, lockoutService, lowConfidenceService, modelCardService, modelCardSeed, modelCardText, multilingualAnonymizer, noteReviewService, offlineOrigin, OCR service, passwordHasher, passwordPolicyService, piiDetectionService, piiPatterns/, priorityEvents, priorityOverrideService, priorityScoringService, queueService, rateLimitService, redactionService, referralService, refreshTokenService, reportMerger, reportParser, reportParser/, reportService, retentionService, retentionScheduler, retentionSlaService, retentionUiService, reviewerFeedbackService, richReportingService, retentionConfig, sessionStore, syncService, timeExpressionParser, timelineBuilder, timelineExtractor, timelineSorter, timelineSummarizer, tombstoneStore, transliterationService, visualFeatureService, visualService, voiceMetricsService
│       ├── types/            # backend domain model: anonymisation.types, auditChain.types, confidence.types, consent.types, facility.types, feedback.types, followup.types, language.types, modelcard.types, priority.types, report.types, retention.types, richCoverage.types, security.types, sync.types, timeline.types, visual.types
│       ├── eval/             # evaluation harness
│       ├── db/               # MongoDB persistence bootstrap
│       ├── config/           # configuration
│       └── eval/             # evaluation data and scripts
└── frontend/                 # React + Vite PWA (port 5173)
    └── src/
        ├── App.tsx           # routes, RequireAuth, AdminOnly guards
        ├── pages/           # Dashboard, TriageQueue, Intake, CaseDetail, Review, Reports, Referrals, Follow-ups, Health Camps, Analytics, Audit, Users, Settings
        ├── components/      # layout, nav, IntakeForm, TriageDashboard, ReferralNote, …
        ├── context/         # AuthContext, TriageContext
        ├── store/           # AppStore (demo UI state, toasts)
        ├── services/        # api.ts (single HTTP client), rbacService, safetyPolicy
        ├── hooks/           # useSpeechToText (Web Speech API, en-IN/hi-IN/or-IN)
        ├── data/            # demo data for offline/demo screens
        ├── lib/             # format utilities
        ├── main.tsx         # app entry
        ├── index.css        # global styles
        └── vite.config.ts   # Vite config, PWA plugin, proxy /api → backend
```

### Application Screens (routes → screen → access)

| Route | Screen | Access |
|---|---|---|
| `/login` | Login / register | public |
| `/` | Dashboard | all roles |
| `/triage` | Triage Queue | all roles |
| `/cases`, `/cases/:caseId` | Patients / case detail | staff |
| `/intake`, `/new-intake` | New intake (voice, text, attachments) | all roles |
| `/review` | Reviewer (human-in-the-loop note editing) | staff |
| `/reports` | Reports | staff |
| `/referrals` | Referrals | staff |
| `/followups` | Follow-ups | staff |
| `/camps` | Health Camps | staff |
| `/analytics`, `/audit`, `/users`, `/settings` | Admin pages | admin only |
| `*` | redirect to `/` | — |

The app is installable as a PWA (manifest + Workbox service worker, `vite-plugin-pwa`), and speech‑to‑text capture degrades gracefully to typing/upload when the browser has no `SpeechRecognition`.

---

## Tech Stack

| Part | Stack |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS 4, react-router-dom 7 (HashRouter), framer-motion, lucide-react, vite-plugin-pwa |
| **Backend** | Node.js, Express 4, TypeScript 5, tsx (dev), CORS |
| **Linting** | oxlint (frontend), `tsc --noEmit` (backend typecheck) |
| **Persistence** | MongoDB |
| **AI/ML** | Multilingual triage rule engine, unified PII anonymisation pipeline (P0-7), regex‑based PII detection, Web Speech API for STT |
| **Image Processing** | sharp, OCR word extraction, face/region heuristic redaction |

---

## Getting Started

### Requirements

- Node.js 20+
- npm

### Installation

```bash
npm install            # root (hoists deps for frontend + backend)
npm install --prefix frontend
npm install --prefix backend
```

### Running

**Terminal 1 — API on http://localhost:4000**

```bash
npm run dev:backend
```

**Terminal 2 — web app on http://localhost:5173**

```bash
npm run dev:frontend
```

The Vite dev server proxies same‑origin `/api` and `/health` to `http://localhost:4000`, so no CORS setup is needed in development.

### Root scripts

| Script | What it does |
|---|---|
| `npm run dev:frontend` | Runs `frontend` → `vite` |
| `npm run dev:backend` | Runs `backend` → `tsx watch src/index.ts` |
| `npm run build` | Builds frontend (`tsc -b && vite build`) then backend (`tsc`) |
| `npm run lint` | Runs `oxlint` in the frontend |

### Backend scripts

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/index.js` |
| `npm run typecheck` | `tsc --noEmit` |

### Configuration

- API port defaults to `4000` and can be overridden with `PORT`.
- CORS origins come from `CORS_ORIGIN` (default `http://localhost:5173,http://127.0.0.1:5173`).
- Health check: `GET /health` (or `GET /api/health`).

---

## Demo Logins

Seeded on backend start (`seedUsers()`), one account per role:

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Facility Administrator |
| `nurse` | `Nurse@123` | Nurse / Health Worker |
| `doctor` | `Doctor@123` | Doctor / Medical Officer |
| `patient` | `Patient@123` | Patient (self service) |

- Self‑registration always creates a **patient** account; staff accounts are created by an admin.

---

## Roles and Permissions

Source of truth for the UI: `frontend/src/services/rbacService.ts`. The backend enforces the same matrix server-side (`backend/src/routes`).

| Permission | Patient | Nurse | Doctor | Admin |
|---|---|---|---|---|
| Edit the AI‑prepared structured note | — | yes | yes | yes |
| Accept the AI draft as reviewed | — | yes | yes | yes |
| Mark the note final for this facility | — | — | yes | yes |
| Draft an escalation / referral note | — | yes | yes | yes |
| Approve and release a referral | — | — | yes | yes |
| Read the audit trail | own sessions only | yes | yes | yes |
| Manage user accounts and roles | — | — | — | yes |
| Prescribe | never | never | never | never |

`canPrescribe` is a literal `false` for every role — this system never prescribes.

---

## Safety and Privacy Rules

Hard rules mirrored in `backend/src/types/index.ts` and `frontend/src/services/safetyPolicy.ts`:

- **Never store or return raw patient identifiers** — only redacted text. PII is stripped by `anonymize()`/`anonymiseText()` **before** anything reaches the analysis layer (`name`, `phone`, `id-number`, `email`, `address`, `date-of-birth`).
- **The AI layer outputs observations, urgency signals, missing-information checks and follow-up questions only**: never a diagnosis, prescription or treatment plan.
- **Every response carries a non-diagnostic disclaimer**; urgency flags are workflow labels produced by keyword rules — never a diagnosis.
- **A guard (`enforceNonDiagnostic` / `assertNonDiagnostic`)** rewrites or blocks diagnosis‑ and prescription‑language in model‑generated content.
- **Consent and the non-diagnostic acknowledgement are required** before a session can be created.
- **Every meaningful action writes an audit entry**; actor and role always come from the login session, never from the request body, so the trail cannot be forged.

---

## Project Structure (expanded)

### Backend (`backend/src/`)

- **`index.ts`** — entry point: initialises persistence, loads rule registry, starts schedulers, listens on `PORT`
- **`app.ts`** — Express app wiring: middleware pipeline (trust proxy → request ID → security headers → CORS → cookie parse → CSRF → JSON body → input validation → anomaly screen → health → rate limit → auth routes → session auth → facility scope → IP allowlist → tighter limiter → security admin routes → feature routers → limiter → idempotency → offline origin → feature routers). Health endpoints: `GET /health`, `GET /api/health`.
- **`middleware/`** — auth (`requireAuth`, `requireRole`), error handling, security headers, CSRF protection, IP allowlist, rate limiting (global, auth, sensitive), anomaly detection, input validation, idempotency, offline origin, DB health check
- **`routes/`** — feature routers: auth, sessions, triage, audit, consent, bias, model card, feedback, language, anonymisation, reports, retention, retention UI, rich coverage, visuals, facilities, security, confidence, queue, sync
- **`services/`** — core services: triage service (multilingual analysis), unified anonymisation pipeline (7 layers), multilingual anonymiser, audit store with hash chaining, audit verification scheduler, priority & retention schedulers, session & auth stores, consent retention, follow‑up generator, body region service, bias report, cloudinary image service, common password check, confidence policy & service, device service, failure mode service, feedback aggregation, file/OCR/image ingestion, IP blocklist, language detection, lockout, low‑confidence service, model card service, OCR service, password hasher & policy, PII detection service, PI‑pattern definitions, priority events/override/scoring, queue service, rate limit service, redaction service, referral service, refresh token service, report merger/parser/ service, retention service, SLA service, sync service, time expression parser, timeline builder/extractor/sorter/summarizer, tombstone store, transliteration service, visual feature/service, voice metrics
- **`types/`** — domain models: anonymisation types, audit chain types, confidence types, consent types, facility types, feedback types, follow‑up types, language types, model card types, priority types, report types, retention types, rich coverage types, security types, sync types, timeline types, visual types
- **`eval/`** — evaluation harness and data
- **`db/`** — MongoDB persistence bootstrap

### Frontend (`frontend/src/`)

- **`App.tsx`** — route definitions, `RequireAuth`, `AdminOnly` guards
- **`pages/`** — Dashboard, TriageQueue, Intake, CaseDetail, Review, Reports, Referrals, Follow-ups, Health Camps, Analytics, Audit, Users, Settings
- **`components/`** — layout, navigation, IntakeForm, TriageDashboard, ReferralNote, …
- **`context/`** — AuthContext, TriageContext
- **`store/`** — AppStore (demo UI state, toasts)
- **`services/`** — `api.ts` (single HTTP client with interceptors for auth, error handling, PII scrubbing), `rbacService` (RBAC lookups), `safetyPolicy` (non‑diagnostic guard)
- **`hooks/`** — `useSpeechToText` (Web Speech API, en-IN/hi-IN/or-IN), others
- **`data/`** — demo data for offline/demo screens
- **`lib/`** — format utilities
- **`types/`** — frontend domain types
- **`main.tsx`** — app entry point
- **`index.css`** — global styles
- **`vite.config.ts`** — Vite config, PWA plugin, proxy `/api` → `http://localhost:4000`

### PII Anonymisation Pipeline (detail)

The unified anonymiser (`backend/src/services/unifiedAnonymizer.ts`) is the core PII‑redaction engine (P0‑7). Key aspects:

- **Modality‑aware**: different pattern sets for `intake-text`, `report-metadata`, `log-message`, `error-message`, etc.
- **Multilingual**: pattern sets for English, Hindi (`hi`), and Oriya (`or`). Script detection normalises input before matching.
- **Overlap resolution**: greedy non‑overlapping selection (earliest start → longest match → most confident).
- **Canonical placeholders** localised to `[NAME]`, `[PHONE]`, `[AADHAAR]`, `[PAN]`, `[ID]`, `[ADDRESS]`, `[DOB]`, `[EMAIL]`, etc. per language (`en`/`hi`/`or`).
- **Image anonymisation**: OCR + face/region heuristic, black‑out painting via `sharp`.
- **Object‑walk anonymisation**: deep‑walks any JSON‑like value, redacting every string.
- **Confidence scoring** on each match via `computeAnonymisationConfidence`.
- **Legacy compatibility**: `toLegacyAnonymizationReport` bridges unified matches to the legacy `AnonymizationReport` shape.

The legacy anonymiser (`backend/src/services/anonymizer.ts`) provides `anonymizeBase()` — a case‑insensitive regex rule set for Latin script that handles name, phone, ID, email, address, DOB, Aadhaar, PAN, voter ID, ration card, facility IDs, patient IDs, lab names, and Devanagari/Oriya name scripts. The public `anonymize()` delegates to the unified pipeline for `intake-text` modality and returns the legacy report shape.

### Multilingual Triage (detail)

The triage engine (`backend/src/services/multilingualTriageService.ts`) runs the fixed pipeline:

1. **Detect script language** (en/hi/or, mixed‑script handling)
2. **Anonymise** via the unified pipeline *before* analysis
3. **Enforce per‑language non‑diagnostic phrases** (banned patterns replaced with system‑authored statements)
4. **Run workflow rules** per language rule set:
   - **Urgency signals** — keyword‑based flags (red/amber/severity), workflow labels only, never diagnoses
   - **Missing‑information checks** — identifies which fields are not present in the narrative
   - **Follow‑up questions** — dynamic, context‑aware, in the narrative's language
5. **Construct the triage note** with:
   - `structuredNote.{chiefComplaint, history, vitals}`
   - `observations` (up to 6 sentences)
   - `urgencyFlags` (with confidence scores)
   - `missingInformation`
   - `followUpQuestions`
   - `riskScore` (High / Medium / Low based on flag severities)
   - `status: 'ai-draft'`
   - `disclaimer` from the rule set
   - `generatedAt` timestamp
   - `language` code

Language rule sets are loaded from `getRuleSet(code)` and contain language‑specific banned phrases, urgency patterns, missing‑info checks, section labels, and the disclaimer text.

### Audit Trail

- Every meaningful action (session creation, note edit, accept, mark final, referral draft, etc.) writes an audit entry to MongoDB.
- Actor and role always come from the login session, never from the request body, so the trail cannot be forged.
- Audit entries carry: `facilityId`, `sessionId`, `actor`, `role`, `action`, `detail`, `category`, `timestamp`.
- Hash chaining ensures integrity: `ensureAuditChains()` / `backfillAuditChain()` at startup.
- Scheduler `auditVerificationScheduler` periodically verifies chain integrity.

### Schedulers

- **retentionScheduler** — purges old data based on config
- **priorityScheduler** — re‑evaluates triage priority flags
- **auditVerificationScheduler** — verifies audit hash chain integrity

---

## Documentation

- See `ARCHITECTURE.md` at the repo root for the full system design: request flow, API surface, triage rules, auth model, data model and known prototype trade-offs.
- `MIGRATION.md` — migration notes (if applicable).

---

## Permissions Matrix (summary)

| Permission | Patient | Nurse | Doctor | Admin |
|---|---|---|---|---|
| Edit AI‑prepared note | — | ✅ | ✅ | ✅ |
| Accept AI draft | — | ✅ | ✅ | ✅ |
| Mark note final | — | — | ✅ | ✅ |
| Draft escalation/referral | — | ✅ | ✅ | ✅ |
| Approve/release referral | — | — | ✅ | ✅ |
| Read audit trail | own sessions only | ✅ | ✅ | ✅ |
| Manage users/roles | — | — | — | ✅ |
| Prescribe | ❌ | ❌ | ❌ | ❌ |

---