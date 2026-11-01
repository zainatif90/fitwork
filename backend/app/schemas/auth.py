import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def check_password_strength(v: str) -> str:
    if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one letter and one number")
    # bcrypt reads at most 72 BYTES (bcrypt 5 refuses longer ones). Urdu letters and emoji use 2-4 bytes each,
    # so a 42-character Urdu password (82 bytes) passed the 72-character check and crashed sign-up.
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password is too long. Use a shorter one (Urdu letters and emoji count as 2-4 characters each).")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt only uses the first 72 bytes
    full_name: str = Field(min_length=2, max_length=120)
    # Public sign-up can only create solo freelancers or agency owners.
    # agency_member is only reachable through an invite link.
    role: Literal["freelancer", "agency_owner"] = "freelancer"

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name is too short")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return check_password_strength(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_verified: bool
    is_admin: bool
    created_at: datetime


class TokenOut(BaseModel):
    """The access token goes in the JSON body; the refresh token goes in an httpOnly cookie."""

    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MessageOut(BaseModel):
    message: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=2000)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return check_password_strength(v)
