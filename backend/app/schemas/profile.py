import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

PLATFORMS = ("Freelancer.com", "Upwork", "Fiverr", "LinkedIn", "Toptal", "PeoplePerHour", "Guru", "Other")


class ProfileIn(BaseModel):
    skills: list[str] = Field(min_length=1, max_length=40)
    experience_level: Literal["beginner", "intermediate", "expert"]
    hourly_rate: float = Field(gt=0, le=1000, description="USD per hour")
    bio: str = Field(default="", max_length=2000)
    portfolio_urls: list[HttpUrl] = Field(default_factory=list, max_length=10)
    platforms: list[Literal[PLATFORMS]] = Field(default_factory=list, max_length=len(PLATFORMS))  # type: ignore[valid-type]

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, v: list[str]) -> list[str]:
        """Trim spaces, drop empties, remove case-insensitive duplicates, keep the order."""
        seen: set[str] = set()
        cleaned: list[str] = []
        for raw in v:
            s = " ".join(raw.split())
            if not s:
                continue
            if len(s) > 60:
                raise ValueError(f"Skill '{s[:20]}...' is too long (max 60 characters)")
            if s.lower() not in seen:
                seen.add(s.lower())
                cleaned.append(s)
        if not cleaned:
            raise ValueError("Add at least one skill")
        return cleaned

    @field_validator("platforms")
    @classmethod
    def unique_platforms(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    skills: list[str]
    experience_level: str
    hourly_rate: float
    bio: str
    portfolio_urls: list[str]
    platforms: list[str]
    embedding_status: str
    updated_at: datetime


class SkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    category: str
