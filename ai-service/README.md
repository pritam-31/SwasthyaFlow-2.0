# आरोग्य Sathi — AI Triage Service

Data-driven, **non-diagnostic** patient severity scoring and triage decision-support for आरोग्य Sathi.

It takes a patient record (vitals, symptoms text, labs, history, and optional imaging) and returns a severity score `0..100`, a triage level (`LOW` / `MODERATE` / `URGENT` / `CRITICAL`), an explainable factor breakdown, and a suggested action plan.

> **The AI proposes; a qualified clinician confirms or overrides.** Nothing here diagnoses, prescribes, or replaces clinical judgement.

आरोग्य Sathi AI Service is a **FastAPI** application built with Python 3.10+ (developed on 3.13). It is CPU-friendly and runs with zero configuration — every clinical field is optional, and missing data is handled gracefully.

---

## What It Does

| Layer | Method | Notes |
|---|---|---|
| Vitals | NEWS2 + qSOFA + Isolation Forest | Anomaly detection on vitals |
| Symptoms | Multilingual NLP classifier, else bilingual lexicon | English + Hindi (Odia via lexicon) |
| Labs | Reference-range rules | Critical / high / low flags |
| History | scikit-learn logistic model | Learned from a generated cohort |
| Imaging | Optional ECG/X-ray hook | Disabled unless images are supplied |
| Fusion | Learned least-squares weights over the components | Weights fitted from data, not hardcoded |
| Explainability | Per-factor signed contributions | Explains why a score was generated |
| Feedback | Doctor override store + retrain endpoint | SQLite, PII pseudonymised |

### Trained Fusion Weights

The trained fusion weights from the bundled dataset are roughly:

```
vitals 0.297 · labs 0.251 · symptoms 0.248 · history 0.148 · images 0.057
```

### Triage Levels

| Severity Score | Triage Level |
|---|---|
| 0–25 | LOW |
| 26–50 | MODERATE |
| 51–75 | URGENT |
| 76–100 | CRITICAL |

### Privacy

`patient_id` is **never** stored raw in the feedback store. It is pseudonymised using a salted SHA-256 hash (`AI_PII_SALT`) before logging.

Production deployments must use a strong, secret salt and implement appropriate privacy, security, and compliance controls. Hashing alone does not guarantee HIPAA or GDPR compliance.

---

## Quick Start

```bash
cd ai-service

# 1. Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

# 2. Install core dependencies
pip install -r requirements.txt

# 3. Optional: Install the full ML stack
pip install -r requirements-ml.txt

# 4. Generate sample data and train the models
python -m scripts.generate_sample_data
python -m scripts.train_history_model
python -m scripts.train_fusion_model

# 5. Start the आरोग्य Sathi AI service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Verify the Service

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Check model information:

```bash
curl http://127.0.0.1:8000/model-info
```

Send a sample patient record:

```bash
curl -X POST http://127.0.0.1:8000/predict-severity \
  -H "content-type: application/json" \
  --data-binary @examples/predict_severity_request.json
```

The service degrades gracefully. With only `requirements.txt` installed, it uses deterministic lexicon and rule-based analyzers. With the optional ML dependencies and model artifacts available, it can use trained models and the transformer NLP backend where supported.

---

## API Endpoints

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Liveness and model loading status |
| `GET` | `/model-info` | None | Fusion weights, component methods, NLP backend |
| `POST` | `/predict-severity` | Bearer token, if configured | Score one patient record |
| `POST` | `/override` | Bearer token, if configured | Record a doctor confirmation or override |
| `POST` | `/feedback/retrain` | Bearer token, if configured | Refit fusion weights using stored feedback |
| `GET` | `/feedback/summary` | None | Feedback agreement statistics |

**Authentication:** If `AI_SERVICE_TOKEN` is set, protected endpoints require:

```
Authorization: Bearer YOUR_AI_SERVICE_TOKEN
```

---

## Predict Severity API

### Request Body

Endpoint: `POST /predict-severity`

Example request:

```json
{
  "patient_id": "P12345",
  "age": 62,
  "gender": "male",
  "vitals": {
    "bp_systolic": 150,
    "bp_diastolic": 95,
    "heart_rate": 118,
    "spo2": 88,
    "temperature": 38.4,
    "respiratory_rate": 26,
    "blood_glucose": 210
  },
  "symptoms_text": "Severe chest pain radiating to the left arm",
  "symptoms_language": "en",
  "medical_history": ["diabetes", "hypertension", "smoker"],
  "medications": ["metformin"],
  "lab_reports": {
    "troponin": 0.9,
    "creatinine": 1.6
  },
  "past_admissions": 2,
  "last_visit_days_ago": 14,
  "ecg_image_url": null,
  "xray_image_url": null
}
```

All fields are optional. Numeric values may be supplied as strings where supported by preprocessing. Malformed values are handled gracefully rather than causing the entire request to fail.

### Response

The response includes:

- `patient_id_hash`: Pseudonymised patient identifier
- `severity_score`: Severity estimate from 0 to 100
- `triage_level`: LOW, MODERATE, URGENT, or CRITICAL
- `confidence`: Model confidence estimate
- `components`: Component-level scores, weights, and signals
- `top_factors`: Main factors contributing to the score
- `action`: Suggested triage actions and response target
- `red_flags`: Detected warning signals
- `missing_data`: Information not supplied in the request
- `model_versions`: Versions or methods used by the pipeline
- `fallbacks_used`: Fallback analyzers used during prediction
- `prediction_id`: Unique prediction reference
- `generated_at`: Prediction timestamp
- `disclaimer`: Clinical decision-support disclaimer

See `examples/predict_severity_response.json` for the complete response format.

---

## Doctor Override API

Endpoint: `POST /override`

Example request:

```json
{
  "prediction_id": "pred-example-001",
  "session_id": "sess-demo-001",
  "doctor_level": "URGENT",
  "reason": "Patient requires urgent clinical review.",
  "ai_severity_score": 83.6,
  "ai_triage_level": "CRITICAL"
}
```

The endpoint records the clinician's assessment and can return:

- `recorded`: Whether the feedback was recorded
- `agreement`: Whether the clinician and AI triage levels agree
- `feedback_id`: Feedback record identifier
- `message`: Result message
- `retrain_queued`: Whether retraining was queued

A clinician's assessment always takes precedence over an AI suggestion.

---

## Configuration

Copy `.env.example` to `.env` and configure the environment variables you need.

| Variable | Default | Purpose |
|---|---|---|
| `AI_HOST` | `0.0.0.0` | Bind address |
| `AI_PORT` | `8000` | Service port |
| `AI_MODELS_DIR` | `./models` | Model artifact directory |
| `AI_DATA_DIR` | `./data` | Data storage directory |
| `AI_DB_PATH` | `./data/predictions.sqlite3` | Predictions and feedback database |
| `AI_PII_SALT` | `change-me-in-production` | Secret salt for pseudonymisation |
| `AI_NLP_MODEL` | `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` | Transformer NLP model |
| `AI_SERVICE_TOKEN` | *(empty)* | Optional API authentication token |
| `AI_CORS_ORIGINS` | *(empty)* | Comma-separated allowed origins |
| `AI_ENABLE_FEEDBACK` | `true` | Enable or disable feedback storage |
| `AI_AUTO_RETRAIN_ON_OVERRIDE` | `false` | Automatically refit weights after overrides |

> **Production recommendation:** Replace the default salt with a strong random secret. Never commit `.env` files or production credentials to GitHub.

---

## Testing

Run the test suite:

```bash
python -m pytest -q
```

The project includes 43 tests covering:

- Input preprocessing and type coercion
- Vitals scoring using NEWS2 and qSOFA
- Symptom NLP and language handling
- Laboratory reference-range thresholds
- Medical history risk scoring
- Fusion scoring and triage bands
- Explainability and factor contributions
- Doctor override persistence
- HTTP API behavior
- Malformed and partially supplied inputs

Run the tests before deploying changes to the आरोग्य Sathi AI service.

---

## Docker

Build the core image:

```bash
docker build -t aarogya-sathi-ai .
```

Build the lightweight ML image:

```bash
docker build --build-arg INSTALL_ML=lite -t aarogya-sathi-ai:lite .
```

Build the full ML image:

```bash
docker build --build-arg INSTALL_ML=full -t aarogya-sathi-ai:ml .
```

Start the service with Docker Compose:

```bash
docker compose up --build
```

Local service URL: <http://localhost:8000>

The container is designed to use the configured model artifacts and reference data bundled with the image. Verify that the required artifacts exist before building the image. The container listens on `${PORT}`, defaulting to `8000`, where configured by the Docker setup.

---

## Deploy to Render

A Blueprint configuration is included at the repository root in `render.yaml`.

### Steps

1. Push the project repository to GitHub.
2. Open Render.
3. Select **New + → Blueprint**.
4. Select the GitHub repository and the correct branch.
5. Review the service configuration and required environment variables.
6. Set the required secrets in Render.
7. Deploy the service and wait for the build to finish.
8. Copy the generated service URL.

Configure these variables as appropriate:

```env
INSTALL_ML=lite
AI_PII_SALT=<strong-random-secret>
AI_SERVICE_TOKEN=<random-secret>
```

The service URL may look like `https://aarogya-sathi-ai.onrender.com` (the actual URL is generated by Render and may differ).

Set the following variables in your Node.js backend:

```env
AI_SERVICE_URL=https://YOUR-ACTUAL-RENDER-URL
AI_SERVICE_TOKEN=YOUR_CONFIGURED_AI_SERVICE_TOKEN
```

Use the same `AI_SERVICE_TOKEN` value in both services.

### Deployment Notes

- The `lite` ML flavor is intended for a smaller deployment footprint. Actual memory usage depends on the installed dependencies and workload.
- The full transformer stack may require substantially more memory.
- Free hosting plans may sleep during inactivity, causing cold-start delays.
- Local SQLite data may not persist across redeployments unless persistent storage is configured.
- Attach a persistent disk at the configured data path if feedback must survive redeployments.
- Configure `AI_CORS_ORIGINS` when a browser calls the AI service directly. If only the Node.js backend calls it, direct browser CORS access may not be necessary.

---

## Deploy to Railway

Railway can deploy the AI service using its Dockerfile.

### Steps

1. Push the latest project code to GitHub.
2. Open Railway.
3. Select **New Project → Deploy from GitHub repo**.
4. Choose the repository.
5. Open the AI service and go to **Settings → Source**.
6. Set the **Root Directory** to `ai-service`.
7. Confirm that Railway detects the intended Dockerfile and build configuration.
8. Open the service's **Variables** section and configure the required environment variables.

Recommended variables:

```env
INSTALL_ML=lite
AI_PII_SALT=<strong-random-secret>
AI_SERVICE_TOKEN=<random-secret>
AI_ENABLE_FEEDBACK=true
AI_AUTO_RETRAIN_ON_OVERRIDE=false
```

9. Deploy the service and review the build and runtime logs.
10. Open **Settings → Networking → Generate Domain** to create a public domain.

Your generated URL may look like `https://aarogya-sathi-ai.up.railway.app` (the actual domain is assigned by Railway).

### Connect to the Node.js Backend

In the Node.js backend's environment variables, set:

```env
AI_SERVICE_URL=https://YOUR-ACTUAL-RAILWAY-URL
AI_SERVICE_TOKEN=YOUR_CONFIGURED_AI_SERVICE_TOKEN
```

Ensure the token matches the one configured in the AI service.

### Railway Notes

- Confirm that `INSTALL_ML` is handled as intended by your Dockerfile and Railway build configuration.
- The `lite` flavor is intended to reduce resource requirements; the `full` flavor may need more RAM and storage.
- Railway plan availability, pricing, and resource limits can change; check the current plan before deploying.
- Attach a persistent Volume at the configured data path if the SQLite feedback database must survive redeployments.
- Ensure that the model artifacts and required reference data are present in the Git-tracked files or are otherwise available to the Docker build.
- Never expose the AI service token in frontend code or public repositories.

---

## Project Structure

```
ai-service/
├── app/
│   ├── main.py              FastAPI application and endpoints
│   ├── pipeline.py          Prediction pipeline orchestration
│   ├── preprocessing.py     Input coercion and normalization
│   ├── reference_ranges.py  NEWS2, qSOFA and laboratory ranges
│   ├── analyzers/
│   │   ├── vitals.py        Vital-sign analysis
│   │   ├── nlp.py           Symptom text analysis
│   │   ├── lab.py           Laboratory result analysis
│   │   ├── history.py       Medical history risk analysis
│   │   └── image.py         Optional imaging analysis
│   ├── fusion.py            Fusion scoring
│   ├── triage.py            Triage level and action policy
│   ├── explainability.py    Factor contribution explanations
│   ├── storage.py           SQLite storage and PII hashing
│   ├── override_feedback.py Clinician override and retraining
│   ├── model_store.py       Model artifact loading
│   └── schemas.py           Pydantic request/response schemas
├── scripts/
│   ├── generate_sample_data.py
│   ├── train_history_model.py
│   └── train_fusion_model.py
├── tests/                   Automated tests
├── examples/                Example API requests and responses
├── models/                  Trained model artifacts
└── data/                    Reference cohort and feedback data
```

See `INTEGRATION.md` for instructions on integrating the AI service with the Node.js backend and React frontend.

---

## Integration with आरोग्य Sathi

The AI service is designed to work as the AI decision-support layer in the application.

Typical request flow:

1. The frontend submits patient information to the Node.js backend.
2. The backend validates the request and calls the आरोग्य Sathi AI service.
3. The AI service analyzes available vitals, symptoms, lab reports, and history.
4. The AI service returns a severity estimate, triage level, contributing factors, and suggested actions.
5. The backend passes the result to the frontend.
6. A qualified clinician reviews and confirms or overrides the suggestion.

The AI service should be called from the backend rather than exposing its authentication token to the browser.

---

## Disclaimer

आरोग्य Sathi AI Triage Service is a clinical decision-support tool, **not a diagnostic system**.

It produces a severity estimate based on the patient data provided. Its predictions may be incomplete or incorrect, particularly when data is missing, input quality is poor, or the model encounters situations outside its training data.

- It does not replace a qualified clinician.
- It does not independently establish a diagnosis.
- It does not prescribe medicines or replace professional treatment decisions.
- Its suggested actions must be reviewed in the appropriate clinical context.
- Urgent symptoms must not be ignored because of a low AI score.

The final clinical decision always rests with the treating healthcare professional.

---

**Project Name:** आरोग्य Sathi
**Service:** आरोग्य Sathi AI Triage Service
**Technology:** Python, FastAPI, scikit-learn, optional NLP transformers, SQLite, Docker