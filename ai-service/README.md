# SwasthyaFlow AI Triage Service

Data-driven, **non-diagnostic** patient severity scoring and triage
decision-support. It takes a real patient record (vitals, symptoms text, labs,
history, optional imaging) and returns a severity score `0..100`, a triage
level (`LOW` / `MODERATE` / `URGENT` / `CRITICAL`), an explainable factor
breakdown, and a suggested action plan.

> The AI **proposes**; a qualified clinician confirms or overrides. Nothing here
> diagnoses, prescribes, or replaces clinical judgement.

FastAPI app, Python 3.10+ (developed on 3.13), CPU-friendly. Runs with **zero
configuration** — every clinical field is optional and missing data is handled
gracefully (never a crash).

---

## What it does

| Layer | Method | Notes |
| --- | --- | --- |
| Vitals | NEWS2 + qSOFA + Isolation Forest | anomaly detection on vitals |
| Symptoms | Multilingual NLP classifier, else bilingual lexicon | English + Hindi (Odia via lexicon) |
| Labs | Reference-range rules | critical / high / low flags |
| History | scikit-learn logistic model | learned from a generated cohort |
| Imaging | Optional ECG/X-ray hook | disabled unless images are supplied |
| Fusion | **Learned** least-squares weights over the components | weights fitted from data, not hardcoded |
| Explainability | Per-factor signed contributions | "why this score" |
| Feedback | Doctor override store + retrain endpoint | SQLite, PII pseudonymised |

Trained fusion weights (from the bundled dataset) are roughly:

```
vitals 0.297 · labs 0.251 · symptoms 0.248 · history 0.148 · images 0.057
```

Band policy: `0–25 LOW`, `26–50 MODERATE`, `51–75 URGENT`, `76–100 CRITICAL`.

Privacy: `patient_id` is never stored raw — it is pseudonymised with a salted
SHA-256 hash (`AI_PII_SALT`) before logging, matching HIPAA/GDPR expectations.

---

## Quick start

```bash
cd ai-service

# 1) virtualenv + core deps
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt

# 2) (optional) full ML stack — numpy/sklearn/xgboost/lightgbm/shap/transformers
pip install -r requirements-ml.txt

# 3) generate a sample cohort and train the models (artifacts land in ./models)
python -m scripts.generate_sample_data
python -m scripts.train_history_model
python -m scripts.train_fusion_model

# 4) run
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Verify:

```bash
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/predict-severity \
  -H "content-type: application/json" \
  --data-binary @examples/predict_severity_request.json
```

The service degrades gracefully: with only `requirements.txt` installed it uses
the deterministic lexicon and rule-based analyzers; with `requirements-ml.txt`
installed it uses the trained models and the transformer NLP backend.

---

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | – | Liveness + which models are loaded |
| `GET` | `/model-info` | – | Fusion weights, component methods, NLP backend |
| `POST` | `/predict-severity` | Bearer* | Score one patient record |
| `POST` | `/override` | Bearer* | Record a doctor confirmation/override |
| `POST` | `/feedback/retrain` | Bearer* | Re-fit fusion weights from stored feedback |
| `GET` | `/feedback/summary` | – | Feedback agreement stats |

\* Only required when `AI_SERVICE_TOKEN` is set — the caller must then send
`Authorization: Bearer <token>`.

### Request body (`POST /predict-severity`)

```jsonc
{
  "patient_id": "P12345",          // pseudonymised before storage
  "age": 62,
  "gender": "male",                // "male" | "female" | "other" | null
  "vitals": {
    "bp_systolic": 150, "bp_diastolic": 95, "heart_rate": 118,
    "spo2": 88, "temperature": 38.4, "respiratory_rate": 26,
    "blood_glucose": 210
  },
  "symptoms_text": "Severe chest pain radiating to the left arm ...",
  "symptoms_language": "en",       // "en" | "hi" | "or"
  "medical_history": ["diabetes", "hypertension", "smoker"],
  "medications": ["metformin"],
  "lab_reports": { "troponin": 0.9, "creatinine": 1.6 },
  "past_admissions": 2,
  "last_visit_days_ago": 14,
  "ecg_image_url": null,
  "xray_image_url": null
}
```

All fields are optional. Numbers may be sent as strings; malformed values are
dropped, not fatal.

### Response (`POST /predict-severity`)

See `examples/predict_severity_response.json`. Shape:

```jsonc
{
  "patient_id_hash": "3e759f03...",
  "severity_score": 83.6,
  "triage_level": "CRITICAL",
  "confidence": 0.84,
  "components": [ { "key": "vitals", "label": "Vital signs", "score": 85.0,
                    "weight": 0.3148, "available": true, "signals": ["..."] } ],
  "top_factors": [ { "name": "Vital signs", "category": "vitals",
                     "contribution": 11.02, "direction": "increases",
                     "detail": "NEWS2 respiratory rate 26 (+3)" } ],
  "action": { "level": "CRITICAL", "title": "Immediate life-threatening risk",
              "actions": ["..."], "notify": ["on_call_doctor", "ambulance"],
              "target_response_minutes": 0 },
  "red_flags": ["CRITICAL SpO2 below 90%", "chest pain"],
  "missing_data": [],
  "model_versions": { "vitals": "isolation-forest", "fusion": "least-squares" },
  "fallbacks_used": ["symptoms:lexicon (transformer model unavailable)"],
  "prediction_id": "pred-c812d40e-...",
  "generated_at": "2026-10-12T07:41:36+00:00",
  "disclaimer": "Decision support only. ..."
}
```

### Override (`POST /override`)

```json
{
  "prediction_id": "pred-c812d40e-...",
  "session_id": "sess-demo-001",
  "doctor_level": "URGENT",
  "reason": "Vitals improved after oxygen; still needs urgent review.",
  "ai_severity_score": 83.6,
  "ai_triage_level": "CRITICAL"
}
```

Returns `{ "recorded": true, "agreement": false, "feedback_id": "fb-...",
"message": "...", "retrain_queued": false }`.

---

## Configuration

Copy `.env.example` and set what you need. Highlights:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_HOST` / `AI_PORT` | `0.0.0.0` / `8000` | Bind address |
| `AI_MODELS_DIR` / `AI_DATA_DIR` | `./models` / `./data` | Artifact + storage paths |
| `AI_DB_PATH` | `./data/predictions.sqlite3` | Predictions + feedback store |
| `AI_PII_SALT` | `change-me-in-production` | **Change in production** — hashing salt |
| `AI_NLP_MODEL` | `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` | Transformer NLP model |
| `AI_SERVICE_TOKEN` | *(empty)* | When set, gates `/predict-severity` + `/override` |
| `AI_CORS_ORIGINS` | *(empty)* | Comma-separated origins for direct browser calls |
| `AI_ENABLE_FEEDBACK` | `true` | Toggle the override/feedback store |
| `AI_AUTO_RETRAIN_ON_OVERRIDE` | `false` | Re-fit weights automatically on each override |

---

## Testing

```bash
python -m pytest -q          # 43 tests: units, edge cases, API, explainability
```

Coverage includes preprocessing/coercion, vitals (NEWS2/qSOFA), symptom NLP
(EN+HI), lab thresholds, history risk, fusion/triage bands, explainability,
override persistence, the HTTP API and malformed/partial input.

---

## Docker

```bash
docker build -t swasthyaflow-ai .                                  # core (smallest)
docker build --build-arg INSTALL_ML=lite -t swasthyaflow-ai:lite . # numpy + scikit-learn + joblib
docker build --build-arg INSTALL_ML=full -t swasthyaflow-ai:ml .   # full stack

docker compose up --build          # http://localhost:8000
```

Trained artifacts (`models/fusion_weights.json`, `models/history_risk.joblib`)
and the reference cohort (`data/`) are baked into the image, so learned weights
are used without a training step. The container listens on `${PORT}` (default
`8000`), which makes it portable across hosts.

## Deploy to Render

A Blueprint is included at the repo root (`render.yaml`). Steps:

1. Push the repo to GitHub.
2. In Render: **New + → Blueprint**, select the repo (branch `main`).
3. Render creates one Docker web service from `ai-service/Dockerfile` and asks
   for the `sync: false` secrets:
   - `AI_PII_SALT` is auto-generated — keep it.
   - `AI_SERVICE_TOKEN` — set a random string; copy the same value into the
     backend's `AI_SERVICE_TOKEN`.
4. After deploy, note the URL (e.g. `https://swasthyaflow-ai.onrender.com`) and
   set it in the backend: `AI_SERVICE_URL=https://swasthyaflow-ai.onrender.com`.

Notes:

- **ML flavor** is controlled by the `INSTALL_ML` env var (`none` | `lite` |
  `full`). The Blueprint sets `lite`, which fits the 512 MB free plan. `full`
  (torch/transformers) needs a paid plan (≥ 2 GB).
- The free plan sleeps after ~15 min idle; the first request after that has a
  cold-start delay. The Node backend's timeout falls back to `computePriority`
  and the UI shows a "Local fallback" badge, so triage never breaks.
- The feedback SQLite store is ephemeral on the free plan (reset on each
  deploy). Attach a **Render Disk** at `/app/data` if you need it to persist.
- Set `AI_CORS_ORIGINS` only if a browser calls the service directly (normally
  it doesn't — the Node backend is the sole caller).

To run locally as a container instead: `docker compose up --build`.

## Deploy to Railway

Railway builds the same Docker image. Because this is a monorepo, point the
service at the AI service directory (a `railway.json` is included here):

1. Push the repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, pick the repo.
3. Open the service → **Settings → Source → Root Directory** = `ai-service`.
   Railway auto-detects `ai-service/Dockerfile` (per `railway.json`).
4. **Variables** → add:
   - `INSTALL_ML=lite` — passed as a Docker build arg (`none` = smallest,
     `full` = whole stack, needs more RAM).
   - `AI_PII_SALT` — a long random string (keep it secret).
   - `AI_SERVICE_TOKEN` — a random string; reuse the same value in the backend.
   - optional: `AI_LOG_LEVEL=info`, `AI_ENABLE_FEEDBACK=true`.
5. **Settings → Networking → Generate Domain** to get a public URL (e.g.
   `https://swasthyaflow-ai.up.railway.app`), then set it in the backend:
   `AI_SERVICE_URL=https://swasthyaflow-ai.up.railway.app`.

Notes:

- Railway forwards service variables to the Docker build as build arguments, so
  `INSTALL_ML` is picked up at build time (the Dockerfile declares it via `ARG`).
- Railway only deploys git-tracked files; the baked `models/` and `data/` are
  committed, so the learned weights ship inside the image.
- Railway has no permanent free tier (trial credit, then the Hobby plan). Attach
  a **Volume** mounted at `/app/data` if you want the feedback store to persist
  across deploys.

---

## Project layout

```
ai-service/
├── app/
│   ├── main.py              FastAPI app + endpoints
│   ├── pipeline.py          orchestration (payload -> severity result)
│   ├── preprocessing.py     coercion + normalisation
│   ├── reference_ranges.py  NEWS2 / qSOFA / lab ranges
│   ├── analyzers/           vitals, nlp, lab, history, image
│   ├── fusion.py            learned weight fusion
│   ├── triage.py            band -> level -> action policy
│   ├── explainability.py    per-factor contributions
│   ├── storage.py           SQLite store + PII hashing
│   ├── override_feedback.py doctor override + retrain
│   ├── model_store.py       model artifact loading
│   └── schemas.py           Pydantic request/response models
├── scripts/                 generate_sample_data, train_history_model, train_fusion_model
├── tests/                   pytest suite (43 tests)
├── examples/                sample request/response JSON
├── models/                  trained artifacts (fusion_weights.json, history_risk.joblib)
└── data/                    generated cohort + feedback store
```

See [INTEGRATION.md](INTEGRATION.md) for wiring the Node backend and React
frontend to this service.

---

## Disclaimer

This service produces a severity estimate from recorded patient data to assist a
qualified clinician. It is **not** a diagnosis, prescription, or treatment plan.
The final clinical decision always rests with the treating doctor.
