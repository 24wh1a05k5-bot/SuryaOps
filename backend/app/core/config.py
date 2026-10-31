"""Application settings, read from environment variables / .env file."""
from functools import lru_cache
from pathlib import Path

import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "Rayora"
    database_url: str = "postgresql+psycopg://suryaops:suryaops@localhost:5432/suryaops"
    jwt_secret: str = "change-me-in-.env"
    jwt_expire_hours: int = 8
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    upload_dir: Path = BASE_DIR / "uploads"
    max_upload_mb: int = 5
    # On Render, RENDER_EXTERNAL_URL is set automatically, so QR stickers and tracking links use the live address
    public_base_url: str = os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:5173")
    frontend_dist: Path = BASE_DIR.parent / "frontend" / "dist"
    dashboard_cache_seconds: int = 60

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Hosts like Render give "postgres://" or "postgresql://"; SQLAlchemy needs the psycopg 3 driver name
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()