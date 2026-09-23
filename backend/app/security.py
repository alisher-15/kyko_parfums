import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.config import get_settings

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _create_token(user_id: int, token_type: TokenType, ttl: timedelta, **claims) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "type": token_type, "iat": now, "exp": now + ttl, **claims}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    ttl = timedelta(minutes=get_settings().access_token_ttl_minutes)
    return _create_token(user_id, "access", ttl)


def create_refresh_token(user_id: int, token_version: int) -> str:
    ttl = timedelta(days=get_settings().refresh_token_ttl_days)
    return _create_token(user_id, "refresh", ttl, ver=token_version)


def decode_token(token: str, expected_type: TokenType) -> dict | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload


def generate_reset_token() -> tuple[str, str]:
    """Return (raw token for the email link, sha256 hash to store in the DB)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_reset_token(raw)


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
