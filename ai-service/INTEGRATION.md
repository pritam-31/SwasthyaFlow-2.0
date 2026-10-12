# Integrating the AI Triage Service

How the AI service connects to the rest of SwasthyaFlow:

```
┌────────────┐   /api/ai-triage/*   ┌──────────────┐   HTTP (JSON)   ┌──────────────────┐
│  React app │ ───────────────────► │ Node backend │ ──────────────► │ Python AI service │
│ (frontend) │ ◄─────────────────── │  (Express)   │ ◄────────────── │    (FastAPI)      │
└────────────┘   { result: ... }    └──────────────┘   severity JSON └──────────────────┘
                                          │
                                          └─ falls back to the in-process
                                             priority scorer when the AI
                                             service is unreachable
```

The browser never talks to the AI service directly. The Node backend is the only
caller, which keeps auth, facility scoping and the audit trail in one place.

---

## 1. Run the AI service

See [README.md](README.md). Minimum:

```bash
cd ai-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 2. Point the backend at it

In `backend/.env`:

```env
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TOKEN=              # only if the AI service sets AI_SERVICE_TOKEN
AI_SERVICE_TIMEOUT_MS=4000
```

Leave `AI_SERVICE_URL` empty to disable the integration entirely — triage then
uses only the in-process priority scorer and the UI shows a **Local fallback**
badge.

**Production (Render):** deploy the AI service with the root `render.yaml`
Blueprint (see `ai-service/README.md`), then set the backend's environment to
the deployed URL and the same shared secret:

```env
AI_SERVICE_URL=https://swasthyaflow-ai.onrender.com
AI_SERVICE_TOKEN=<same value as the AI service's AI_SERVICE_TOKEN>
AI_SERVICE_TIMEOUT_MS=8000
```

Raise the timeout in production: the Render free plan cold-starts after idling,
so the first call can exceed the 4 s local default (it falls back cleanly if it
does).

## 3. Backend surface (`backend/src`)

| File | Role |
| --- | --- |
| `services/aiTriageService.ts` | Builds the AI payload from a `PatientSession`, calls the service with a timeout, maps the response, and falls back to `computePriority` on failure. |
| `routes/aiTriage.routes.ts` | `/api/ai-triage/*` endpoints (auth + role guards + audit). |
| `config/env.ts` | `aiServiceUrl()`, `aiServiceToken()`, `aiServiceTimeoutMs()`. |
| `app.ts` | Mounts the router at `/api/ai-triage`. |

### Endpoints

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/ai-triage/predict-severity` | clinical | Body `{ sessionId }` **or** `{ patient: {...} }` |
| `POST` | `/api/ai-triage/override` | clinical | Body `{ sessionId?, predictionId?, doctorLevel, reason, ... }` |
| `GET` | `/api/ai-triage/status` | clinical | `{ configured, reachable, fallbackAvailable }` |
| `GET` | `/api/ai-triage/session/:id/payload` | clinical | The exact anonymised payload that would be sent |

`{ sessionId }` mode reads the stored session, maps it to the AI contract
(`buildPayloadFromSession`) and always returns a usable result — even when the
AI service is down (`source: "fallback"`).

`{ patient }` mode evaluates a raw payload and requires the AI service to be
reachable.

### Payload mapping (session → AI contract)

Only anonymised fields leave the backend:

- `patient_id` → hashed downstream by the AI service (salted SHA-256).
- `ageBand` → a band midpoint; `sex` → `male`/`female`/`other`/`null`.
- `language` → `en`/`hi`/`or`.
- Latest report's vitals → `vitals`; all report labs → `lab_reports`.
- Narrative + history keywords → `symptoms_text` / `medical_history`.
- `facility_id`, `session_id` carried for audit only (never features).

## 4. Frontend surface (`frontend/src`)

| File | Role |
| --- | --- |
| `types/severity.types.ts` | Wire types + level styles. |
| `services/api.ts` | `predictSeverityForSession`, `predictSeverityForPayload`, `submitSeverityOverride`, `fetchAiTriageStatus`. |
| `components/severity/SeverityPanel.tsx` | Renders score, level, breakdown, factors, action plan, red flags, and the clinician override form. |
| `pages/AiTriage.tsx` | The **AI Triage** workspace (pick a session, run, review, override). |
| `app/routes.tsx` + `components/navItems.ts` | Route registered at `/app/ai-triage` (clinical roles). |

All calls go through the shared `request()` helper, so auth token, CSRF,
idempotency key and facility header are attached automatically.

---

## 5. Fallback behaviour

| Situation | `result.source` | Result |
| --- | --- | --- |
| AI configured + reachable | `ai-service` | Full AI result |
| AI configured but unreachable / 5xx | `fallback` | `computePriority()` mapped to a triage level; `fallbacksUsed` explains why |
| `AI_SERVICE_URL` empty | `fallback` | `computePriority()`; `fallbacksUsed: ["ai-service-not-configured"]` |

The UI shows an amber **Local fallback** / **Degraded** badge and a toast so a
degraded estimate is never mistaken for the full model.

## 6. Override / feedback loop

1. Clinician picks a level (`LOW | MODERATE | URGENT | CRITICAL`) + a reason.
2. Frontend → `POST /api/ai-triage/override` → backend → `POST /override`.
3. The AI service stores the feedback (SQLite) and returns `agreement`.
4. `POST /feedback/retrain` (or `AI_AUTO_RETRAIN_ON_OVERRIDE=true`) re-fits the
   fusion weights from accumulated feedback.

## 7. Security & privacy

- Only anonymised fields cross the seam; `patient_id` is pseudonymised with a
  salted SHA-256 hash before storage.
- Set `AI_SERVICE_TOKEN` on both sides so the AI service is not publicly
  reachable; the backend forwards it as `Authorization: Bearer <token>`.
- Keep the AI service on a private network / same host as the backend.
- Every prediction and override is audited (`addAudit`) in the backend.
- The response always carries a non-diagnostic `disclaimer`.

## 8. End-to-end verification

```bash
# AI service up?
curl http://localhost:8000/health

# Through the backend (after login, with the session cookie/token):
curl -X POST http://localhost:4000/api/ai-triage/predict-severity \
  -H "content-type: application/json" \
  -d '{"patient": { "patient_id": "P12345", "spo2": 88 }}'   # illustrative
```

In the app: open **AI Triage**, pick a session, press **Run AI triage**, review
the explanation, then record a decision.
