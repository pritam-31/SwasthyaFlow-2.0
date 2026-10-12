# SwasthyaFlow AI triage service.
#
# Build (CPU-only, core deps):      docker build -t swasthyaflow-ai .
# Build (full ML stack):            docker build --build-arg INSTALL_ML=true -t swasthyaflow-ai:ml .
#
# The image runs as a non-root user and exposes the FastAPI app on :8000.
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_MODELS_DIR=/app/models \
    AI_DATA_DIR=/app/data

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-ml.txt ./

# INSTALL_ML=true pulls the heavy optional stack (xgboost, shap, transformers, torch).
ARG INSTALL_ML=false
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && if [ "$INSTALL_ML" = "true" ]; then pip install -r requirements-ml.txt; fi

COPY app ./app
COPY scripts ./scripts
COPY tests ./tests
COPY pyproject.toml README.md ./

# Model artifacts and the feedback store live on a mounted volume in production.
RUN mkdir -p models data/feedback \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
