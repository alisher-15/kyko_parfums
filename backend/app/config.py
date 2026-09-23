from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
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
    # Used in password-reset links. On Render the public URL is picked up automatically.
    frontend_url: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("FRONTEND_URL", "RENDER_EXTERNAL_URL"),
    )

    # Business day boundaries for "today" figures on the dashboard.
    timezone: str = "Asia/Almaty"
    # Used in human-readable order history messages.
    currency_sign: str = "₸"

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

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        # Hosting providers hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the driver.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
