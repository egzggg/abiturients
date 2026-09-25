"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean value")


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    value = int(os.getenv(name, default))
    if value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return value


def _env_float(
    name: str,
    default: float,
    *,
    minimum: float = 0.0,
    maximum: float | None = None,
) -> float:
    value = float(os.getenv(name, default))
    if value < minimum or (maximum is not None and value > maximum):
        suffix = f" and <= {maximum}" if maximum is not None else ""
        raise ValueError(f"{name} must be >= {minimum}{suffix}")
    return value


@dataclass(frozen=True, slots=True)
class Settings:
    telegram_bot_token: str | None
    gigachat_credentials: str | None
    gigachat_model: str
    gigachat_verify_ssl: bool
    qdrant_host: str
    qdrant_port: int
    redis_host: str
    redis_port: int
    knowledge_collection: str
    query_collection: str
    embedding_model: str
    embedding_dimension: int
    retrieval_search_limit: int
    retrieval_result_limit: int
    retrieval_min_kb_score: float
    retrieval_cq_boost: float
    log_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        log_dir = Path(os.getenv("LOG_DIR", str(PROJECT_ROOT / "logs")))
        if not log_dir.is_absolute():
            log_dir = PROJECT_ROOT / log_dir

        return cls(
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN") or None,
            gigachat_credentials=os.getenv("GIGACHAT_CREDENTIALS") or None,
            gigachat_model=os.getenv("GIGACHAT_MODEL", "GigaChat"),
            gigachat_verify_ssl=_env_bool("GIGACHAT_VERIFY_SSL", True),
            qdrant_host=os.getenv("QDRANT_HOST", "localhost"),
            qdrant_port=_env_int("QDRANT_PORT", 6333),
            redis_host=os.getenv("REDIS_HOST", "localhost"),
            redis_port=_env_int("REDIS_PORT", 6379),
            knowledge_collection=os.getenv(
                "QDRANT_KNOWLEDGE_COLLECTION", "knowledge_base"
            ),
            query_collection=os.getenv("QDRANT_QUERY_COLLECTION", "query_index"),
            embedding_model=os.getenv(
                "EMBEDDING_MODEL", "intfloat/multilingual-e5-large"
            ),
            embedding_dimension=_env_int("EMBEDDING_DIMENSION", 1024),
            retrieval_search_limit=_env_int("RETRIEVAL_SEARCH_LIMIT", 10),
            retrieval_result_limit=_env_int("RETRIEVAL_RESULT_LIMIT", 10),
            retrieval_min_kb_score=_env_float(
                "RETRIEVAL_MIN_KB_SCORE", 0.78, maximum=1.0
            ),
            retrieval_cq_boost=_env_float("RETRIEVAL_CQ_BOOST", 1.05),
            log_dir=log_dir,
        )

    def require_telegram_token(self) -> str:
        if not self.telegram_bot_token:
            raise RuntimeError(
                "TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and "
                "provide a bot token."
            )
        return self.telegram_bot_token

    def require_gigachat_credentials(self) -> str:
        if not self.gigachat_credentials:
            raise RuntimeError(
                "GIGACHAT_CREDENTIALS is not set. Copy .env.example to .env and "
                "provide credentials."
            )
        return self.gigachat_credentials


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_dotenv(PROJECT_ROOT / ".env")
    return Settings.from_env()
