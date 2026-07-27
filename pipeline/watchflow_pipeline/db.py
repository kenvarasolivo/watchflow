"""Database access for the pipeline.

The pipeline issues **DML only**. Every table below mirrors DDL that Drizzle
owns (`src/db/schema.ts`); nothing here ever calls `create_all`. If the two
drift, `npm run db:migrate` is the fix — there is exactly one migration path and
it is the TypeScript one.
"""

from __future__ import annotations

from datetime import date as Date
from decimal import Decimal
from typing import Any, Iterable, Iterator, Sequence

from sqlalchemy import (
    BigInteger,
    Column,
    Date as SADate,
    DateTime,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    create_engine,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import ENUM, insert as pg_insert
from sqlalchemy.engine import Connection, Engine

metadata = MetaData()

watchlists = Table(
    "watchlists",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("created_at", DateTime(timezone=True)),
)

watchlist_tickers = Table(
    "watchlist_tickers",
    metadata,
    Column("watchlist_id", Integer, primary_key=True),
    Column("ticker", String(16), primary_key=True),
    Column("added_at", DateTime(timezone=True)),
)

prices = Table(
    "prices",
    metadata,
    Column("ticker", String(16), primary_key=True),
    Column("date", SADate, primary_key=True),
    Column("open", Numeric(18, 6), nullable=False),
    Column("high", Numeric(18, 6), nullable=False),
    Column("low", Numeric(18, 6), nullable=False),
    Column("close", Numeric(18, 6), nullable=False),
    Column("volume", BigInteger, nullable=False),
    Column("updated_at", DateTime(timezone=True)),
)

metrics = Table(
    "metrics",
    metadata,
    Column("ticker", String(16), primary_key=True),
    Column("date", SADate, primary_key=True),
    Column("daily_return", Numeric(12, 6)),
    Column("ma_20", Numeric(18, 6)),
    Column("ma_50", Numeric(18, 6)),
    Column("volatility_30d", Numeric(12, 6)),
    Column("updated_at", DateTime(timezone=True)),
)

pipeline_runs = Table(
    "pipeline_runs",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("started_at", DateTime(timezone=True)),
    Column("finished_at", DateTime(timezone=True)),
    Column("tickers_processed", Integer),
    Column("rows_upserted", Integer),
    Column("rows_rejected", Integer),
    Column(
        "status",
        ENUM(
            "running",
            "success",
            "partial_failure",
            "failed",
            name="pipeline_status",
            create_type=False,
        ),
    ),
    Column("error_summary", Text),
    Column("details", Text),
    Column("trigger", String(32)),
)

#: Rows per executemany batch. Large enough to keep round trips down, small
#: enough that a single statement stays well inside Postgres' parameter limit.
CHUNK_SIZE = 500


def build_engine(database_url: str) -> Engine:
    """Create an engine suited to a short-lived batch job.

    ``pool_pre_ping`` matters specifically because Neon suspends idle compute:
    a connection checked out after a scale-to-zero can be dead on arrival, and
    the ping turns that into a transparent reconnect instead of a failed run.
    """
    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=0,
        connect_args={"connect_timeout": 20},
    )


def _chunks(rows: Sequence[dict[str, Any]], size: int) -> Iterator[Sequence[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


# --------------------------------------------------------------------------
# Reads
# --------------------------------------------------------------------------


def fetch_watchlist_tickers(conn: Connection) -> list[str]:
    """The distinct union of every watchlist's tickers.

    v1 has a single watchlist, but taking the union here means adding more
    watchlists later needs no pipeline change — the extract set is already
    defined as "everything anyone is watching".
    """
    stmt = select(watchlist_tickers.c.ticker).distinct().order_by(watchlist_tickers.c.ticker)
    return [row[0] for row in conn.execute(stmt)]


def fetch_last_dates(conn: Connection, tickers: Sequence[str]) -> dict[str, Date]:
    """Latest stored bar date per ticker — the incremental watermark."""
    if not tickers:
        return {}
    stmt = (
        select(prices.c.ticker, func.max(prices.c.date))
        .where(prices.c.ticker.in_(list(tickers)))
        .group_by(prices.c.ticker)
    )
    return {ticker: last for ticker, last in conn.execute(stmt) if last is not None}


def fetch_closes_since(conn: Connection, ticker: str, since: Date) -> list[tuple[Date, Decimal]]:
    """Stored closes from ``since`` onward, oldest first.

    Used as metric warm-up context. Rolling windows need history the current
    incremental fetch does not contain: a run that pulls three new bars still
    has to see the previous 49 closes to produce a correct MA-50 for them.
    """
    stmt = (
        select(prices.c.date, prices.c.close)
        .where(prices.c.ticker == ticker, prices.c.date >= since)
        .order_by(prices.c.date.asc())
    )
    return [(row[0], row[1]) for row in conn.execute(stmt)]


# --------------------------------------------------------------------------
# Writes
# --------------------------------------------------------------------------


def upsert_prices(conn: Connection, rows: Sequence[dict[str, Any]]) -> int:
    """Idempotent load of OHLCV bars.

    ``ON CONFLICT (ticker, date) DO UPDATE`` is what makes re-running the
    pipeline over an already-loaded range safe: the second run overwrites each
    bar with the same values instead of creating a duplicate or erroring. It is
    also how Yahoo's after-the-fact revisions to recent bars get picked up.
    """
    if not rows:
        return 0

    total = 0
    for chunk in _chunks(rows, CHUNK_SIZE):
        stmt = pg_insert(prices).values(list(chunk))
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker", "date"],
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
                "updated_at": func.now(),
            },
        )
        conn.execute(stmt)
        total += len(chunk)
    return total


def upsert_metrics(conn: Connection, rows: Sequence[dict[str, Any]]) -> int:
    """Idempotent load of derived metrics, same conflict contract as prices."""
    if not rows:
        return 0

    total = 0
    for chunk in _chunks(rows, CHUNK_SIZE):
        stmt = pg_insert(metrics).values(list(chunk))
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker", "date"],
            set_={
                "daily_return": stmt.excluded.daily_return,
                "ma_20": stmt.excluded.ma_20,
                "ma_50": stmt.excluded.ma_50,
                "volatility_30d": stmt.excluded.volatility_30d,
                "updated_at": func.now(),
            },
        )
        conn.execute(stmt)
        total += len(chunk)
    return total


def start_run(conn: Connection, trigger: str) -> int:
    """Open a `pipeline_runs` row before any work happens.

    Written first, and committed immediately, so that a run which dies hard
    (OOM, runner cancellation) still leaves evidence it started. Such a row
    stays in `running` and shows up as such in the UI — a stuck run is visible
    rather than indistinguishable from a run that never happened.
    """
    stmt = (
        pipeline_runs.insert()
        .values(status="running", trigger=trigger, started_at=func.now())
        .returning(pipeline_runs.c.id)
    )
    return int(conn.execute(stmt).scalar_one())


def finish_run(
    conn: Connection,
    run_id: int,
    *,
    status: str,
    tickers_processed: int,
    rows_upserted: int,
    rows_rejected: int,
    error_summary: str | None,
    details: str | None,
) -> None:
    conn.execute(
        pipeline_runs.update()
        .where(pipeline_runs.c.id == run_id)
        .values(
            finished_at=func.now(),
            status=status,
            tickers_processed=tickers_processed,
            rows_upserted=rows_upserted,
            rows_rejected=rows_rejected,
            error_summary=_truncate(error_summary, 4000),
            details=_truncate(details, 8000),
        )
    )


def _truncate(text: str | None, limit: int) -> str | None:
    """Keep the run log readable when a run rejects thousands of rows."""
    if text is None:
        return None
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def ensure_iterable(value: Iterable[str] | None) -> list[str]:
    return list(value) if value else []
