"""Database access for the pipeline.

The pipeline issues **DML only**. Every table below mirrors DDL that Drizzle
owns (`src/db/schema.ts`); nothing here ever calls `create_all`. If the two
drift, `npm run db:migrate` is the fix — there is exactly one migration path and
it is the TypeScript one.
"""

from __future__ import annotations

from datetime import date as Date, datetime as DateTimeValue
from decimal import Decimal
from typing import Any, Iterable, Iterator, Sequence

from sqlalchemy import (
    BigInteger,
    Boolean,
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

news = Table(
    "news",
    metadata,
    Column("ticker", String(16), primary_key=True),
    Column("article_id", String(64), primary_key=True),
    Column("title", Text, nullable=False),
    Column("publisher", String(128)),
    Column("link", Text, nullable=False),
    Column("published_at", DateTime(timezone=True), nullable=False),
    Column("fetched_at", DateTime(timezone=True)),
)

predictions = Table(
    "predictions",
    metadata,
    Column("ticker", String(16), primary_key=True),
    Column("target_date", SADate, primary_key=True),
    Column("basis_date", SADate, nullable=False),
    Column("basis_close", Numeric(18, 6), nullable=False),
    Column("central", Numeric(18, 6), nullable=False),
    Column("low", Numeric(18, 6), nullable=False),
    Column("high", Numeric(18, 6), nullable=False),
    Column("sigma_pct", Numeric(12, 6), nullable=False),
    Column("drift_pct", Numeric(12, 6), nullable=False),
    Column("sample_size", Integer, nullable=False),
    Column("actual_close", Numeric(18, 6)),
    Column("actual_return_pct", Numeric(12, 6)),
    Column("within_band", Boolean),
    Column("error_pct", Numeric(12, 6)),
    Column("scored_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True)),
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


def upsert_news(conn: Connection, rows: Sequence[dict[str, Any]]) -> int:
    """Idempotent load of headlines.

    The title and publisher are refreshed on conflict because outlets do edit
    headlines after publication, and the stored copy should track the article it
    links to. `published_at` is deliberately *not* updated: it is what the
    headline is matched against a trading session by, and letting it drift would
    silently re-file an old story under a newer day's move.
    """
    if not rows:
        return 0

    total = 0
    for chunk in _chunks(rows, CHUNK_SIZE):
        stmt = pg_insert(news).values(list(chunk))
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker", "article_id"],
            set_={
                "title": stmt.excluded.title,
                "publisher": stmt.excluded.publisher,
                "link": stmt.excluded.link,
                "fetched_at": func.now(),
            },
        )
        conn.execute(stmt)
        total += len(chunk)
    return total


def upsert_predictions(conn: Connection, rows: Sequence[dict[str, Any]]) -> int:
    """Write or revise the standing forecast for a future session.

    Two runs on the same day revise one row rather than stacking up duplicates,
    because the primary key is ``(ticker, target_date)`` — the session being
    forecast, not the moment of forecasting.

    The scoring columns are cleared on conflict. A revised forecast has not been
    graded yet, and leaving the previous row's verdict attached would credit the
    new numbers with an old outcome. In practice this only fires for a forecast
    whose session has not settled, since a scored row's target date is in the
    past and no longer the next trading day.
    """
    if not rows:
        return 0

    total = 0
    for chunk in _chunks(rows, CHUNK_SIZE):
        stmt = pg_insert(predictions).values(list(chunk))
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker", "target_date"],
            set_={
                "basis_date": stmt.excluded.basis_date,
                "basis_close": stmt.excluded.basis_close,
                "central": stmt.excluded.central,
                "low": stmt.excluded.low,
                "high": stmt.excluded.high,
                "sigma_pct": stmt.excluded.sigma_pct,
                "drift_pct": stmt.excluded.drift_pct,
                "sample_size": stmt.excluded.sample_size,
                "actual_close": None,
                "actual_return_pct": None,
                "within_band": None,
                "error_pct": None,
                "scored_at": None,
                "updated_at": func.now(),
            },
        )
        conn.execute(stmt)
        total += len(chunk)
    return total


def score_predictions(conn: Connection, ticker: str) -> int:
    """Grade every forecast whose target session now has a real close.

    This is the half that makes the forecast falsifiable: the band was written
    before the outcome existed, and this compares it against what actually
    happened without touching the band itself.

    Rows already scored are re-scored when the stored close no longer matches
    the price table. That is not paranoia — the load step deliberately refetches
    and upserts a few days of tail because Yahoo revises recent bars, so a
    verdict reached against a provisional close has to be able to change with
    it. ``IS DISTINCT FROM`` rather than ``!=`` so a previously unscored row
    (NULL) is picked up by the same predicate.
    """
    stmt = (
        predictions.update()
        .where(
            predictions.c.ticker == ticker,
            prices.c.ticker == predictions.c.ticker,
            prices.c.date == predictions.c.target_date,
            predictions.c.actual_close.is_distinct_from(prices.c.close),
        )
        .values(
            actual_close=prices.c.close,
            actual_return_pct=(
                (prices.c.close - predictions.c.basis_close)
                / predictions.c.basis_close
                * 100
            ),
            within_band=(
                prices.c.close.between(predictions.c.low, predictions.c.high)
            ),
            error_pct=(
                (prices.c.close - predictions.c.central) / predictions.c.central * 100
            ),
            scored_at=func.now(),
            updated_at=func.now(),
        )
    )
    return int(conn.execute(stmt).rowcount or 0)


def prune_news(conn: Connection, before: DateTimeValue) -> int:
    """Drop headlines published before ``before`` (an aware UTC datetime).

    The table exists to annotate sessions the UI can actually show, and the
    longest range on the ticker page is a year. Without this, an unbounded feed
    of a dozen headlines per ticker per run would grow forever to serve reads
    that never reach back that far.

    Takes a datetime rather than a date so the cutoff is an absolute instant.
    A bare date would be compared against `timestamptz` at midnight in whatever
    the *server's* TimeZone happens to be, which makes the boundary depend on a
    setting neither this pipeline nor the app controls.
    """
    stmt = news.delete().where(news.c.published_at < before)
    return int(conn.execute(stmt).rowcount or 0)


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
