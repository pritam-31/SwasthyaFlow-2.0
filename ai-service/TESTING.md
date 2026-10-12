# Testing Plan — AI Triage

Layered test strategy covering the Python AI service, the Node backend
integration seam, and the React UI. Everything here is runnable locally; the
only optional step is the browser E2E suite.

---

## 1. AI service — unit & API tests

```bash
cd ai-service
python -m pytest -q          # 43 tests
```

| Suite | What it proves |
| --- | --- |
| `test_preprocessing.py` | Numeric coercion, string vitals, combined `150/95` BP, junk dropped without crashing |
| `test_vitals.py` | NEWS2 / qSOFA scoring, Isolation Forest flagging, anomaly thresholds |
| `test_nlp.py` | English + Hindi symptom extraction, lexicon fallback, severity keywords |
| `test_labs.py` | Reference-range flags, critical-high/low detection |
| `test_history.py` | History risk model inference + feature handling |
| `test_fusion_triage.py` | Learned fusion weights → score → band boundaries (25/50/75) |
| `test_explainability.py` | Factor contributions, direction, ordering |
| `test_override.py` | Override persistence, agreement flag, retrain trigger |
| `test_api.py` | `/health`, `/model-info`, `/predict-severity`, `/override`, `/feedback/*` |
| `test_edge_cases.py` | Empty payload, all-missing data, malformed types, extra fields |

**Key invariants asserted**

- Score is always `0..100`; level is always one of `LOW/MODERATE/URGENT/CRITICAL`.
- Missing data never raises — it is reported in `missing_data`.
- At least one component is `available` for any non-empty payload, or the
  response clearly lists `fallbacks_used`.
- `patient_id` never appears raw in stored predictions (only the hash).

## 2. Backend integration seam

```bash
cd backend
npm test          # includes test/aiTriage.test.ts
```

`test/aiTriage.test.ts` covers:

- `buildPayloadFromSession` — demographics, age-band midpoint, gender/language
  mapping, vitals + labs extraction, history keyword derivation, `Unknown` age.
- `fallbackSeverity` — returns a labelled `source: "fallback"` result with a
  valid triage level and a disclaimer.

**Contract test (manual / CI):** the backend `AiPatientPayload` and
`mapResponse` field names must match `ai-service/app/schemas.py`. A change on
either side must update both; `examples/predict_severity_response.json` is the
frozen reference.

## 3. Live round-trip (smoke)

```bash
# terminal 1
cd ai-service && python -m uvicorn app.main:app --port 8000
# terminal 2
curl -X POST http://127.0.0.1:8000/predict-severity \
  -H "content-type: application/json" \
  --data-binary @examples/predict_severity_request.json
```

Expected: `triage_level: "CRITICAL"`, `severity_score` ~ 83, `red_flags`
including SpO2 < 90%, chest pain and critical troponin.

## 4. Frontend

```bash
cd frontend
npm run lint        # oxlint
npx tsc -b          # type-check
npm run test        # vitest
```

`SeverityPanel` is presentational; verify by rendering with a fixture
`AiSeverityResult` (both `ai-service` and `fallback` sources) and asserting the
level badge, factor bars and override form appear.

## 5. End-to-end (browser, optional)

```bash
cd frontend
npm run test:e2e    # playwright
```

Suggested scenario: sign in as a clinician → open **AI Triage** → select a
session → **Run AI triage** → assert score/level/factors render → submit an
override → assert the success toast.

---

## 6. Behavioural / safety checks (manual)

| Scenario | Expected |
| --- | --- |
| `AI_SERVICE_URL` empty | Result `source: "fallback"`, UI shows amber "Local fallback" badge |
| AI service stopped mid-run | Result `source: "fallback"`, `fallbacksUsed` explains the failure |
| AI call exceeds `AI_SERVICE_TIMEOUT_MS` | Abort → fallback (no hang) |
| AI returns 5xx | Backend maps to fallback; direct-payload mode returns HTTP 502 |
| Non-clinical role calls the API | HTTP 403 (role guard) |
| Override without a reason | HTTP 400 |
| Session from another facility | HTTP 404 (facility scope) |
| `AI_SERVICE_TOKEN` set but not sent | AI service rejects with 401 |

## 7. Regression gate

Run before every merge that touches the seam:

```bash
( cd ai-service && python -m pytest -q )
( cd backend && npm run typecheck && npm test )
( cd frontend && npx tsc -b && npm run lint )
```

All three must pass, and the frozen example response must still validate against
the current schema.
