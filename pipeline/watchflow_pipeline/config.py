"""Runtime configuration, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    """Raised when the environment cannot produce a usable configuration."""


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from exc


def normalise_database_url(url: str) -> str:
    """Make a Neon connection string usable by SQLAlchemy + psycopg 3.

    Neon hands out ``postgresql://…`` (and older tooling ``postgres://…``).
    SQLAlchemy would route both to psycopg2, which is not installed here, so the
    driver is pinned explicitly. Doing this in code rather than asking the
    operator to hand-edit the URL means the *same* ``DATABASE_URL`` secret works
    for Next.js, Drizzle and this pipeline.
    """
    if url.startswith("postgresql+"):
        return url
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    raise ConfigError(
        f"DATABASE_URL must start with postgresql:// or postgres://, got {url[:24]!r}…"
    )


@dataclass(frozen=True)
class Settings:
    database_url: str

    #: curl_cffi impersonation target. See extract.py for why this matters.
    impersonate: str = "chrome"

    #: Lookback used the first time a ticker is seen (no rows in `prices`).
    backfill_days: int = 400

    #: Days of already-stored history to re-request and upsert on every run.
    #: Yahoo revises recent bars, so the tail is refetched rather than trusted.
    overlap_days: int = 5

    max_retries: int = 5
    backoff_base_seconds: float = 1.5

    #: Tickers per yfinance call. Yahoo tolerates modest batches; very large
    #: ones raise the odds that one bad symbol poisons the whole response.
    batch_size: int = 12

    #: Recorded on the pipeline_runs row so scheduled and manual runs are
    #: distinguishable in the UI.
    trigger: str = "manual"

    #: Ignore stored watermarks and refetch `backfill_days` for every ticker.
    #: Needed after a split, because Yahoo retroactively adjusts *all* history
    #: and the usual few-day overlap would leave old bars unadjusted.
    full_refresh: bool = False

    #: Skip the load step. Used by `--dry-run` to exercise extract+transform
    #: against the live API without touching the database.
    dry_run: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        url = os.environ.get("DATABASE_URL", "").strip()
        if not url:
            raise ConfigError(
                "DATABASE_URL is not set. Export it, or copy .env.example to "
                ".env and source it before running the pipeline."
            )

        return cls(
            database_url=normalise_database_url(url),
            impersonate=os.environ.get("WATCHFLOW_IMPERSONATE", "chrome").strip() or "chrome",
            backfill_days=_int("WATCHFLOW_BACKFILL_DAYS", 400),
            overlap_days=_int("WATCHFLOW_OVERLAP_DAYS", 5),
            max_retries=_int("WATCHFLOW_MAX_RETRIES", 5),
            backoff_base_seconds=_float("WATCHFLOW_BACKOFF_BASE_SECONDS", 1.5),
            batch_size=_int("WATCHFLOW_BATCH_SIZE", 12),
            trigger=os.environ.get("WATCHFLOW_TRIGGER", "manual").strip() or "manual",
        )
