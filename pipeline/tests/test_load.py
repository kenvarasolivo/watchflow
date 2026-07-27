"""Load-step tests.

Idempotency is the property that matters most here: re-running the pipeline over
a range that is already loaded must never duplicate a row or corrupt an existing
one. It is verified at two levels.

1. **Always** — the emitted SQL is compiled and asserted to be a genuine
   `ON CONFLICT (ticker, date) DO UPDATE`. This needs no database and runs in
   CI on every push.
2. **When a database is available** — set `WATCHFLOW_TEST_DATABASE_URL` to a
   Postgres instance with the migration applied, and the round-trip tests below
   actually load the same rows twice and check the table afterwards. They are
   skipped otherwise rather than silently passing.
"""

from __future__ import annotations

import os
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.dialects import postgresql

from watchflow_pipeline import db
from watchflow_pipeline.config import normalise_database_url

TEST_TICKER = "__WATCHFLOW_TEST__"


class RecordingConnection:
    """Captures statements instead of executing them."""

    def __init__(self) -> None:
        self.statements: list[object] = []

    def execute(self, statement, *args, **kwargs):
        self.statements.append(statement)
        return None


def compiled(statement) -> str:
    return str(statement.compile(dialect=postgresql.dialect())).lower()


def price_row(day: date, close: str = "100.00") -> dict:
    return {
        "ticker": TEST_TICKER,
        "date": day,
        "open": Decimal(close),
        "high": Decimal(close),
        "low": Decimal(close),
        "close": Decimal(close),
        "volume": 1_000,
    }


def metric_row(day: date) -> dict:
    return {
        "ticker": TEST_TICKER,
        "date": day,
        "daily_return": 1.5,
        "ma_20": Decimal("100.000000"),
        "ma_50": Decimal("99.000000"),
        "volatility_30d": 18.0,
    }


class TestUpsertSql:
    def test_prices_upsert_targets_the_composite_key(self):
        conn = RecordingConnection()
        db.upsert_prices(conn, [price_row(date(2026, 7, 24))])

        sql = compiled(conn.statements[0])
        assert "insert into prices" in sql
        assert "on conflict (ticker, date) do update set" in sql

    def test_prices_upsert_refreshes_every_mutable_column(self):
        conn = RecordingConnection()
        db.upsert_prices(conn, [price_row(date(2026, 7, 24))])

        sql = compiled(conn.statements[0])
        for column in ("open", "high", "low", "close", "volume", "updated_at"):
            assert f"{column} =" in sql, f"{column} is not refreshed on conflict"

    def test_prices_upsert_never_rewrites_the_key(self):
        """Rewriting the conflict key on update would corrupt the row."""
        conn = RecordingConnection()
        db.upsert_prices(conn, [price_row(date(2026, 7, 24))])

        set_clause = compiled(conn.statements[0]).split("do update set", 1)[1]
        assert "ticker =" not in set_clause
        assert "date =" not in set_clause

    def test_metrics_upsert_targets_the_composite_key(self):
        conn = RecordingConnection()
        db.upsert_metrics(conn, [metric_row(date(2026, 7, 24))])

        sql = compiled(conn.statements[0])
        assert "insert into metrics" in sql
        assert "on conflict (ticker, date) do update set" in sql
        for column in ("daily_return", "ma_20", "ma_50", "volatility_30d"):
            assert f"{column} =" in sql

    def test_rows_are_chunked(self):
        conn = RecordingConnection()
        rows = [price_row(date(2026, 1, 1)) for _ in range(db.CHUNK_SIZE * 2 + 7)]
        total = db.upsert_prices(conn, rows)

        assert total == len(rows)
        assert len(conn.statements) == 3

    def test_empty_input_issues_no_statement(self):
        conn = RecordingConnection()
        assert db.upsert_prices(conn, []) == 0
        assert db.upsert_metrics(conn, []) == 0
        assert conn.statements == []


TEST_DATABASE_URL = os.environ.get("WATCHFLOW_TEST_DATABASE_URL", "").strip()

pytestmark_live = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set WATCHFLOW_TEST_DATABASE_URL to a migrated Postgres to run round-trip tests.",
)


@pytest.fixture
def live_engine():
    engine = db.build_engine(normalise_database_url(TEST_DATABASE_URL))
    yield engine
    with engine.begin() as conn:
        conn.execute(delete(db.metrics).where(db.metrics.c.ticker == TEST_TICKER))
        conn.execute(delete(db.prices).where(db.prices.c.ticker == TEST_TICKER))
    engine.dispose()


@pytestmark_live
class TestUpsertRoundTrip:
    def test_reloading_the_same_range_creates_no_duplicates(self, live_engine):
        rows = [price_row(date(2026, 7, 20 + offset)) for offset in range(3)]

        with live_engine.begin() as conn:
            db.upsert_prices(conn, rows)
            db.upsert_prices(conn, rows)

        with live_engine.connect() as conn:
            count = conn.execute(
                select(func.count())
                .select_from(db.prices)
                .where(db.prices.c.ticker == TEST_TICKER)
            ).scalar_one()

        assert count == 3

    def test_a_revised_bar_overwrites_the_stored_one(self, live_engine):
        day = date(2026, 7, 24)

        with live_engine.begin() as conn:
            db.upsert_prices(conn, [price_row(day, close="100.00")])
            db.upsert_prices(conn, [price_row(day, close="101.25")])

        with live_engine.connect() as conn:
            stored = conn.execute(
                select(db.prices.c.close).where(
                    db.prices.c.ticker == TEST_TICKER, db.prices.c.date == day
                )
            ).scalar_one()

        assert stored == Decimal("101.250000")

    def test_metrics_are_idempotent_too(self, live_engine):
        day = date(2026, 7, 24)

        with live_engine.begin() as conn:
            db.upsert_prices(conn, [price_row(day)])
            db.upsert_metrics(conn, [metric_row(day)])
            db.upsert_metrics(conn, [metric_row(day)])

        with live_engine.connect() as conn:
            count = conn.execute(
                select(func.count())
                .select_from(db.metrics)
                .where(db.metrics.c.ticker == TEST_TICKER)
            ).scalar_one()

        assert count == 1
