# SwasthyaFlow AI triage service.
#
# Build (core only, smallest):      docker build -t swasthyaflow-ai .
# Build (lite ML: numpy/sklearn):   docker build --build-arg INSTALL_ML=lite -t swasthyaflow-ai:lite .
# Build (full ML stack):            docker build --build-arg INSTALL_ML=full -t swasthyaflow-ai:ml .
#
# The image runs as a non-root user and listens on ${PORT} (default 8000) so it
# works both locally and on PaaS platforms such as Render.
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_MODELS_DIR=/app/models \
    AI_DATA_DIR=/app/data \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-ml.txt requirements-ml-lite.txt ./

# INSTALL_ML: none (default) | lite (numpy + scikit-learn + joblib) | full (whole stack).
ARG INSTALL_ML=none
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && if [ "$INSTALL_ML" = "lite" ]; then pip install -r requirements-ml-lite.txt; fi \
    && if [ "$INSTALL_ML" = "full" ] || [ "$INSTALL_ML" = "true" ]; then pip install -r requirements-ml.txt; fi

COPY app ./app
COPY scripts ./scripts
# Trained artifacts and the reference cohort are baked into the image so the
# learned fusion weights are used without a separate training step.
COPY models ./models
COPY data ./data
COPY pyproject.toml README.md ./

RUN mkdir -p models data/feedback \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
