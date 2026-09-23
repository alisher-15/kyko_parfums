from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import UserRole
from app.schemas.common import ORMModel

Password = Field(min_length=8, max_length=128)


def _normalize_email(v: str) -> str:
    return v.strip().lower()


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Password
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)

    _email = field_validator("email")(_normalize_email)


class LoginIn(BaseModel):
    # Plain str: logging in must not depend on today's email-validation rules.
    email: str = Field(max_length=255)
    password: str = Field(max_length=128)

    _email = field_validator("email")(_normalize_email)


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotPasswordIn(BaseModel):
    email: str = Field(max_length=255)

    _email = field_validator("email")(_normalize_email)


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Password


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Password


class UserOut(ORMModel):
    id: int
    email: str
    role: UserRole
    full_name: str | None
    phone: str | None
    company_name: str | None
    wholesale_requested: bool
    created_at: datetime


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)


class WholesaleRequestIn(BaseModel):
    company_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=3, max_length=64)
