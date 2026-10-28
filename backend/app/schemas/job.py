import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class ManualJobIn(BaseModel):
    """A job the user copied from any site and pasted into FitWork."""

    title: str = Field(min_length=3, max_length=300)
    description: str = Field(min_length=20, max_length=20000)
    skills: list[str] = Field(default_factory=list, max_length=30)
    budget_min: float | None = Field(default=None, ge=0, le=1_000_000)
    budget_max: float | None = Field(default=None, ge=0, le=1_000_000)
    budget_type: Literal["fixed", "hourly"] = "fixed"
    url: HttpUrl | None = None

    @model_validator(mode="after")
    def check_budget(self) -> "ManualJobIn":
        if self.budget_min is not None and self.budget_max is not None and self.budget_min > self.budget_max:
            raise ValueError("budget_min cannot be larger than budget_max")
        self.skills = [s.strip()[:80] for s in self.skills if s.strip()]
        return self


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: str
    external_id: str
    title: str
    description: str
    skills: list[str]
    budget_min: float | None
    budget_max: float | None
    budget_type: str
    currency: str
    client_country: str | None
    client_hire_rate: float | None
    proposals_count: int | None
    posted_at: datetime
    url: str | None
    is_active: bool


class IngestRunIn(BaseModel):
    pages: int = Field(default=3, ge=1, le=20)
    start_offset: int = Field(default=0, ge=0, le=5000)


class IngestStatsOut(BaseModel):
    source: str
    fetched: int
    inserted: int
    updated: int
    deactivated: int
    seconds: float
