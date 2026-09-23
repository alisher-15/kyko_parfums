from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Kyko Parfums API"
    database_url: str = "postgresql+psycopg://kyko:kyko@localhost:5432/kyko"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 30
    password_reset_ttl_minutes: int = 60

    # CORS / frontend
    cors_origins: list[str] = ["http://localhost:3000"]
    frontend_url: str = "http://localhost:3000"

    # Media (uploaded product photos / brand logos)
    media_dir: Path = BASE_DIR / "media"
    media_url_prefix: str = "/media"
    max_upload_mb: int = 5

    # SMTP for password recovery. Empty host => reset links are written to the log (dev mode).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@kyko.local"
    smtp_tls: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
