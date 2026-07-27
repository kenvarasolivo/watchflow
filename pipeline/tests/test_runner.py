from datetime import date

from sqlalchemy.dialects.postgresql import ENUM

from watchflow_pipeline import db
from watchflow_pipeline.config import Settings
from watchflow_pipeline.runner import RunResult, _process_ticker, _resolve_status

TODAY = date(2026, 7, 27)


def settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+psycopg://u:p@h/db",
        # The dry-run path exercises validation, gap detection and note-keeping
        # without touching a database.
        "dry_run": True,
    }
    base.update(overrides)
    return Settings(**base)


def raw(day: date, **overrides) -> dict:
    payload = {
        "ticker": "AAPL",
        "date": day,
        "open": "100.00",
        "high": "100.00",
        "low": "100.00",
        "close": "100.00",
        "volume": 1_000,
    }
    payload.update(overrides)
    return payload


class TestRejectionClassification:
    def test_a_corrupt_historical_bar_counts_as_a_rejection(self):
        result = RunResult()
        rows = [
            raw(date(2026, 7, 23), high="90.00", low="80.00", close="95.00", open="99.00"),
            raw(date(2026, 7, 24)),
        ]
        _process_ticker(None, settings(), "AAPL", rows, result, TODAY)

        assert result.rows_rejected == 1
        assert len(result.rejections) == 1

    def test_todays_unsettled_bar_is_a_note_not_a_rejection(self):
        """An in-progress session must not paint the run amber.

        While the market is open Yahoo serves a partial candle whose high/low
        have not caught up with the live price. It is provisional, not corrupt,
        and the next run's overlap window refetches it once settled.
        """
        result = RunResult()
        rows = [
            raw(date(2026, 7, 24)),
            raw(TODAY, open="99.00", high="99.50", low="99.00", close="101.00"),
        ]
        _process_ticker(None, settings(), "AAPL", rows, result, TODAY)

        assert result.rows_rejected == 0
        assert result.rejections == []
        assert any("provisional" in note for note in result.notes)

    def test_a_clean_window_produces_neither(self):
        result = RunResult()
        rows = [raw(date(2026, 7, 23)), raw(date(2026, 7, 24))]
        _process_ticker(None, settings(), "AAPL", rows, result, TODAY)

        assert result.rows_rejected == 0
        assert result.notes == []
        assert result.tickers_processed == 1

    def test_no_rows_is_reported_but_not_an_error(self):
        result = RunResult()
        _process_ticker(None, settings(), "AAPL", [], result, TODAY)

        assert result.tickers_processed == 0
        assert result.errors == []
        assert any("no rows returned" in note for note in result.notes)

    def test_gaps_are_recorded_as_notes(self):
        result = RunResult()
        # 21 July 2026 is a Tuesday with no bar.
        rows = [raw(date(2026, 7, 20)), raw(date(2026, 7, 22))]
        _process_ticker(None, settings(), "AAPL", rows, result, TODAY)

        assert result.errors == []
        assert any("2026-07-21" in note for note in result.notes)


class TestPipelineStatusTyping:
    def test_pipeline_run_status_uses_native_postgres_enum(self):
        assert isinstance(db.pipeline_runs.c.status.type, ENUM)
        assert db.pipeline_runs.c.status.type.name == "pipeline_status"


class TestResolveStatus:
    def test_clean_run_is_success(self):
        assert _resolve_status(RunResult(tickers_processed=5)) == "success"

    def test_rejected_rows_downgrade_to_partial(self):
        """Data that was fetched and then discarded is a real loss."""
        result = RunResult(tickers_processed=5, rows_rejected=2)
        assert _resolve_status(result) == "partial_failure"

    def test_some_tickers_failing_is_partial(self):
        result = RunResult(tickers_processed=3, errors=["MSFT: load failed"])
        assert _resolve_status(result) == "partial_failure"

    def test_nothing_processed_with_errors_is_failed(self):
        result = RunResult(tickers_processed=0, errors=["batch failed"])
        assert _resolve_status(result) == "failed"

    def test_empty_watchlist_is_still_a_success(self):
        # Nothing to do is not the same as something going wrong.
        assert _resolve_status(RunResult()) == "success"


class TestRunResultFormatting:
    def test_error_summary_is_none_when_clean(self):
        assert RunResult().error_summary() is None

    def test_details_lists_rejections_after_notes(self):
        from watchflow_pipeline.models import Rejection

        result = RunResult(
            notes=["AAPL: 1 unexpected gap"],
            rejections=[Rejection(ticker="SPY", date="2026-07-24", reason="bad high")],
        )
        details = result.details()

        assert details is not None
        assert details.index("AAPL: 1 unexpected gap") < details.index("SPY")
        assert "Rejected rows (1)" in details
