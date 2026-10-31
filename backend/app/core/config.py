"""Application settings, read from environment variables / .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "SuryaOps"
    database_url: str = "postgresql+psycopg://suryaops:suryaops@localhost:5432/suryaops"
    jwt_secret: str = "change-me-in-.env"
    jwt_expire_hours: int = 8
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    upload_dir: Path = BASE_DIR / "uploads"
    max_upload_mb: int = 5
    public_base_url: str = "http://localhost:5173"
    dashboard_cache_seconds: int = 60

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
