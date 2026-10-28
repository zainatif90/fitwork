"""
FitWork FastAPI application.

Run (from /backend):  .venv\\Scripts\\uvicorn app.main:app --reload --port 8000
API docs:             http://localhost:8000/api/docs
"""
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.routers import admin, agency, auth, jobs, matches, profile, proposals, skill_gap, skills
from app.services import embeddings
from app.services.bootstrap import start_bootstrap
from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("fitwork")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log.info("FitWork API starting (env=%s)", settings.ENV)
    try:
        embeddings.warm_up()  # load the NLP model once, before the first request
    except Exception:
        log.exception("Embedding model failed to load; profiles will be saved as 'pending'")
    start_bootstrap()  # production first start: seed jobs + demo accounts (only if missing)
    start_scheduler()
    yield
    stop_scheduler()
    log.info("FitWork API stopped")


# Interactive API docs are handy in development but are switched off in production
# (set ENABLE_API_DOCS=true to keep them, e.g. for the viva demo).
_docs = not settings.is_production or settings.ENABLE_API_DOCS

app = FastAPI(
    title="FitWork API",
    version="1.0.0",
    docs_url="/api/docs" if _docs else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if _docs else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,  # needed so the browser sends the refresh cookie
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Add standard security headers to every response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if not request.url.path.startswith("/api/docs"):
        # The API only returns JSON, so it never needs to load scripts, styles or frames.
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["Cache-Control"] = "no-store"  # never cache personal data in shared caches
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Never show a stack trace to users. Log it on the server instead."""
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


API_PREFIX = "/api"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(profile.router, prefix=API_PREFIX)
app.include_router(skills.router, prefix=API_PREFIX)
app.include_router(jobs.router, prefix=API_PREFIX)
app.include_router(matches.router, prefix=API_PREFIX)
app.include_router(proposals.router, prefix=API_PREFIX)
app.include_router(agency.router, prefix=API_PREFIX)
app.include_router(skill_gap.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
