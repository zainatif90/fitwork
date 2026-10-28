import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Tone = Literal["professional", "friendly", "technical"]
Length = Literal["concise", "standard", "detailed"]


class ProposalIn(BaseModel):
    job_id: uuid.UUID
    tone: Tone = "professional"
    length: Length = "standard"


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    tone: str
    length: str
    content: str
    is_fallback: bool
    provider: str
    model: str | None
    created_at: datetime


class GeneratedProposalOut(ProposalOut):
    remaining_today: int
