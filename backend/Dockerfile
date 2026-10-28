# FitWork API image (CPU only, no PyTorch: the NLP model runs on ONNX Runtime via fastembed).
# Build from the REPO ROOT so the seed dataset can be included:  docker build -f backend/Dockerfile .
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    EMBEDDING_CACHE_DIR=/app/.cache/fastembed \
    SEED_CSV_PATH=/app/data/jobs_seed.csv

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
COPY data/jobs_seed.csv /app/data/jobs_seed.csv

# Download the all-MiniLM-L6-v2 ONNX model at build time, so a cold start does not download it.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('sentence-transformers/all-MiniLM-L6-v2', cache_dir='/app/.cache/fastembed')"

# Non-root user
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

# Render/Railway set $PORT. Migrations run on every start (they are idempotent).
# One worker only (see CLAUDE.md: the scheduler must not run twice). --proxy-headers so the
# real client IP (from Vercel/Render's proxy) is used for the login rate limit.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
