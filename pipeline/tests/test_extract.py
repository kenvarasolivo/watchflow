from datetime import date, timedelta

import pandas as pd
import pytest

from watchflow_pipeline.config import ConfigError, Settings, normalise_database_url
from watchflow_pipeline.extract import (
    _frame_for_ticker,
    _is_retryable,
    _rows_from_frame,
    _sleep_for,
    plan_batches,
    start_date_for,
)

TODAY = date(2026, 7, 27)


def settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+psycopg://user:pw@host/db",
        "backfill_days": 400,
        "overlap_days": 5,
        "batch_size": 3,
    }
    base.update(overrides)
    return Settings(**base)


class TestNormaliseDatabaseUrl:
    def test_postgresql_scheme_gets_the_psycopg_driver(self):
        assert normalise_database_url("postgresql://u:p@h/db").startswith(
            "postgresql+psycopg://"
        )

    def test_legacy_postgres_scheme(self):
        assert (
            normalise_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
        )

    def test_already_qualified_url_is_untouched(self):
        url = "postgresql+psycopg://u:p@h/db"
        assert normalise_database_url(url) == url

    def test_query_string_is_preserved(self):
        assert normalise_database_url("postgresql://u:p@h/db?sslmode=require").endswith(
            "/db?sslmode=require"
        )

    def test_unknown_scheme_is_rejected(self):
        with pytest.raises(ConfigError):
            normalise_database_url("mysql://u:p@h/db")


class TestStartDate:
    def test_unknown_ticker_gets_the_full_backfill(self):
        assert start_date_for("AAPL", {}, TODAY, settings()) == TODAY - timedelta(days=400)

    def test_known_ticker_starts_before_its_watermark(self):
        """Deliberately overlaps stored data rather than resuming after it.

        Yahoo revises recent bars; the upsert collapses the overlap, so the
        cheap re-fetch is what keeps already-stored rows correct.
        """
        last = {"AAPL": date(2026, 7, 24)}
        assert start_date_for("AAPL", last, TODAY, settings()) == date(2026, 7, 19)

    def test_full_refresh_ignores_the_watermark(self):
        last = {"AAPL": date(2026, 7, 24)}
        result = start_date_for("AAPL", last, TODAY, settings(full_refresh=True))
        assert result == TODAY - timedelta(days=400)


class TestPlanBatches:
    def test_tickers_sharing_a_start_date_batch_together(self):
        batches = plan_batches(["AAPL", "MSFT"], {}, TODAY, settings())
        assert len(batches) == 1
        assert batches[0][1] == ["AAPL", "MSFT"]

    def test_different_windows_are_not_mixed(self):
        """One call carries one start date, so mismatched windows must split."""
        last = {"AAPL": date(2026, 7, 24), "MSFT": date(2026, 6, 1)}
        batches = plan_batches(["AAPL", "MSFT"], last, TODAY, settings())
        assert len(batches) == 2
        assert {tuple(group) for _, group in batches} == {("AAPL",), ("MSFT",)}

    def test_batch_size_is_respected(self):
        tickers = [f"T{i}" for i in range(7)]
        batches = plan_batches(tickers, {}, TODAY, settings(batch_size=3))
        assert [len(group) for _, group in batches] == [3, 3, 1]

    def test_every_ticker_appears_exactly_once(self):
        tickers = [f"T{i}" for i in range(10)]
        last = {"T0": date(2026, 7, 1), "T5": date(2026, 7, 1)}
        batches = plan_batches(tickers, last, TODAY, settings())
        flattened = [ticker for _, group in batches for ticker in group]
        assert sorted(flattened) == sorted(tickers)

    def test_empty_watchlist(self):
        assert plan_batches([], {}, TODAY, settings()) == []


class TestRetryClassification:
    @pytest.mark.parametrize(
        "message",
        [
            "HTTP Error 429: Too Many Requests",
            "Connection reset by peer",
            "Read timed out",
            "curl: (35) TLS handshake failure",
            "401 Unauthorized",
            "503 Service Unavailable",
        ],
    )
    def test_transport_failures_are_retryable(self, message):
        assert _is_retryable(Exception(message))

    @pytest.mark.parametrize(
        "message",
        ["No data found for this date range", "AAPL: possibly delisted"],
    )
    def test_data_problems_are_not_retryable(self, message):
        """Retrying a symbol Yahoo has no data for just wastes the budget."""
        assert not _is_retryable(Exception(message))

    def test_backoff_grows_and_stays_bounded(self):
        base = 1.5
        # Full jitter means each delay is in [0, backoff]; assert the ceiling.
        assert _sleep_for(0, base) <= base
        assert _sleep_for(3, base) <= base * 8
        assert _sleep_for(30, base) <= 60.0

    def test_backoff_is_never_negative(self):
        assert all(_sleep_for(attempt, 1.5) >= 0 for attempt in range(8))


class TestFrameParsing:
    def _frame(self, index, **columns):
        return pd.DataFrame(columns, index=pd.DatetimeIndex(index))

    def test_flat_columns_single_ticker(self):
        frame = self._frame(
            ["2026-07-23", "2026-07-24"],
            Open=[1.0, 2.0],
            High=[1.0, 2.0],
            Low=[1.0, 2.0],
            Close=[1.0, 2.0],
            Volume=[10, 20],
        )
        assert _frame_for_ticker(frame, "AAPL") is frame

    def test_multiindex_with_ticker_on_the_outer_level(self):
        columns = pd.MultiIndex.from_product([["AAPL", "MSFT"], ["Open", "Close"]])
        frame = pd.DataFrame(
            [[1, 2, 3, 4]], index=pd.DatetimeIndex(["2026-07-24"]), columns=columns
        )
        sub = _frame_for_ticker(frame, "MSFT")
        assert list(sub.columns) == ["Open", "Close"]
        assert sub.iloc[0]["Open"] == 3

    def test_multiindex_with_ticker_on_the_inner_level(self):
        columns = pd.MultiIndex.from_product([["Open", "Close"], ["AAPL", "MSFT"]])
        frame = pd.DataFrame(
            [[1, 2, 3, 4]], index=pd.DatetimeIndex(["2026-07-24"]), columns=columns
        )
        sub = _frame_for_ticker(frame, "AAPL")
        assert sub.iloc[0]["Open"] == 1

    def test_unknown_ticker_returns_none(self):
        columns = pd.MultiIndex.from_product([["AAPL"], ["Open"]])
        frame = pd.DataFrame([[1]], index=pd.DatetimeIndex(["2026-07-24"]), columns=columns)
        assert _frame_for_ticker(frame, "TSLA") is None

    def test_empty_frame_returns_none(self):
        assert _frame_for_ticker(pd.DataFrame(), "AAPL") is None


class TestRowsFromFrame:
    def _frame(self, rows):
        index = pd.DatetimeIndex([r[0] for r in rows])
        return pd.DataFrame(
            {
                "Open": [r[1] for r in rows],
                "High": [r[2] for r in rows],
                "Low": [r[3] for r in rows],
                "Close": [r[4] for r in rows],
                "Volume": [r[5] for r in rows],
            },
            index=index,
        )

    def test_rows_are_flattened_with_calendar_dates(self):
        frame = self._frame([("2026-07-24", 1.0, 2.0, 0.5, 1.5, 100)])
        rows, padded = _rows_from_frame(frame, "AAPL")

        assert padded == 0
        assert rows[0]["ticker"] == "AAPL"
        assert rows[0]["date"] == date(2026, 7, 24)
        assert rows[0]["close"] == 1.5

    def test_all_nan_rows_are_batch_padding_not_rejections(self):
        """Pandas pads a batch when one ticker trades on a date another does not.

        Those rows are an artefact of batching, so they are skipped quietly
        rather than logged as malformed data.
        """
        nan = float("nan")
        frame = self._frame(
            [
                ("2026-07-23", nan, nan, nan, nan, nan),
                ("2026-07-24", 1.0, 2.0, 0.5, 1.5, 100),
            ]
        )
        rows, padded = _rows_from_frame(frame, "AAPL")

        assert padded == 1
        assert len(rows) == 1
        assert rows[0]["date"] == date(2026, 7, 24)

    def test_partially_nan_rows_are_kept_for_validation_to_reject(self):
        """A half-formed bar is genuinely malformed and must be counted."""
        frame = self._frame([("2026-07-24", 1.0, float("nan"), 0.5, 1.5, 100)])
        rows, padded = _rows_from_frame(frame, "AAPL")

        assert padded == 0
        assert len(rows) == 1

    def test_missing_columns_yield_no_rows(self):
        frame = pd.DataFrame(
            {"Open": [1.0]}, index=pd.DatetimeIndex(["2026-07-24"])
        )
        rows, padded = _rows_from_frame(frame, "AAPL")
        assert rows == []
        assert padded == 0
