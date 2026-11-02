"""
FitWork FastAPI application.

Run (from /backend):  .venv\\Scripts\\uvicorn app.main:app --reload --port 8000
API docs:             http://localhost:8000/api/docs
"""
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.database import get_db
from app.routers import admin, agency, auth, chat, jobs, matches, profile, proposals, skill_gap, skills
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

async def catch_errors(request: Request, call_next):  # type: ignore[no-untyped-def]
    """
    Turn any unexpected error into a JSON 500 (no stack trace). This middleware sits INSIDE the CORS
    middleware, so the error still carries CORS headers and the website can show it; without that the
    browser hid the response and the app wrongly said "Cannot reach the server".
    """
    try:
        return await call_next(request)
    except Exception:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


app.add_middleware(BaseHTTPMiddleware, dispatch=catch_errors)  # added first = innermost
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
    if settings.FRAME_ANCESTORS == "'none'":
        response.headers["X-Frame-Options"] = "DENY"  # nobody may show our pages inside a frame
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/docs"):
        # The API only returns JSON, so it never needs to load scripts, styles or frames.
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["Cache-Control"] = "no-store"  # never cache personal data in shared caches
    elif not path.startswith("/api/"):
        # The React web app (served from the same origin in production): only our own scripts,
        # our own API, and Google Fonts are allowed.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
            f"frame-ancestors {settings.FRAME_ANCESTORS}; base-uri 'self'; form-action 'self'"
        )
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
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(agency.router, prefix=API_PREFIX)
app.include_router(skill_gap.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(admin.internal_router, prefix=API_PREFIX)


@app.api_route("/api/health", methods=["GET", "HEAD"], tags=["health"])
def health(db: Session = Depends(get_db)) -> JSONResponse:
    """Uptime check (uptime monitors often send HEAD). Also checks that the database answers."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        log.exception("Health check: database unreachable")
        return JSONResponse(status_code=503, content={"status": "database unavailable"})
    return JSONResponse(content={"status": "ok"})


# ---- Web app (production): the built React files are served by this same server ----------
# One origin for the website and the API means no proxy and no cross-site cookie problems.
# In development the Vite dev server serves the web app instead, so this folder does not exist.
_dist = Path(settings.FRONTEND_DIST)
if (_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def web_app(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")  # unknown API route stays a JSON 404
        file = (_dist / full_path).resolve()
        if full_path and file.is_file() and _dist.resolve() in file.parents:
            return FileResponse(file)  # e.g. /favicon.svg
        return FileResponse(_dist / "index.html")  # every other path is a React Router page
