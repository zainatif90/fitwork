"""
Central configuration for the FitWork backend.

Every value is read from environment variables (or the .env file) by pydantic-settings,
so no secret is ever written in the code. Tunable numbers (Match Score weights,
thresholds, cache times) also live here so there is exactly one place to change them.
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),  # works when started from /backend or the repo root
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- General ---
    ENV: str = "development"  # development | production | test
    ENABLE_API_DOCS: bool = False  # docs are always on outside production
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: str = "http://localhost:5173"  # comma separated

    # --- Database / cache ---
    DATABASE_URL: str = "postgresql+psycopg://fitwork:fitwork_dev_pw@localhost:5433/fitwork"
    TEST_DATABASE_URL: str = "postgresql+psycopg://fitwork:fitwork_dev_pw@localhost:5433/fitwork_test"
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Auth ---
    JWT_SECRET: str = Field(default="", description="Required. Long random string.")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_HOURS: int = 24
    REFRESH_TOKEN_DAYS: int = 7
    VERIFY_TOKEN_HOURS: int = 48
    BCRYPT_ROUNDS: int = 12
    LOGIN_RATE_LIMIT_PER_MIN: int = 5

    # --- NLP ---
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIM: int = 384
    EMBEDDING_CACHE_DIR: str = ".cache/fastembed"

    # --- Job ingestion ---
    FREELANCER_API_BASE: str = "https://www.freelancer.com/api"
    FREELANCER_API_TOKEN: str = ""  # optional; public endpoints work without it
    FREELANCER_PAGES_PER_RUN: int = 3
    FREELANCER_PAGE_SIZE: int = 100
    FREELANCER_REQUEST_DELAY_SEC: float = 1.5
    SCHEDULER_ENABLED: bool = True
    INGEST_INTERVAL_MIN: int = 30
    LIVE_JOB_MAX_AGE_HOURS: int = 72

    # --- Match Score (heuristic, tunable; see CLAUDE.md) ---
    W_SEM: float = 0.70
    W_BUDGET: float = 0.15
    W_RECENCY: float = 0.15
    SEM_LOW: float = 0.15   # cosine at/below this -> semantic 0
    SEM_HIGH: float = 0.65  # cosine at/above this -> semantic 1
    MATCH_CANDIDATES: int = 50
    MATCH_TOP_N: int = 5
    MATCH_CACHE_SEC: int = 600
    MATCH_THRESHOLD: int = 60  # "a match" for Skill Gap Radar
    LOW_TEAM_FIT: int = 50     # agency routing

    # --- Skill gap ---
    SKILL_GAP_CANDIDATES: int = 15
    SKILL_GAP_CACHE_SEC: int = 3600

    # --- LLM (proposals only) ---
    LLM_PROVIDER: str = "gemini"  # gemini | openai
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"
    LLM_TIMEOUT_SEC: float = 30.0
    PROPOSALS_PER_DAY: int = 20

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.JWT_SECRET or len(settings.JWT_SECRET) < 32:
        raise RuntimeError("JWT_SECRET is missing or shorter than 32 characters. Set it in .env")
    return settings


settings = get_settings()
