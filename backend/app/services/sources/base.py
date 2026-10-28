"""The common shape every job source must produce before it is saved."""
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class JobData:
    source: str               # freelancer | upwork | csv | manual | synthetic
    external_id: str          # id on the original site (unique per source)
    title: str
    description: str
    posted_at: datetime       # timezone-aware UTC
    skills: list[str] = field(default_factory=list)
    budget_min: float | None = None   # USD
    budget_max: float | None = None   # USD
    budget_type: str = "fixed"        # fixed | hourly
    currency: str = "USD"
    client_country: str | None = None
    client_hire_rate: float | None = None
    proposals_count: int | None = None
    url: str | None = None
