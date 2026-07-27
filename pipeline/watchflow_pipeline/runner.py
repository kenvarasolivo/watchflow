"""Orchestration: extract → transform → load, with a run log around it."""

from __future__ import annotations

import logging
import traceback
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from sqlalchemy.engine import Engine

from . import db
from .config import Settings
from .extract import ExtractError, build_session, fetch_batch, plan_batches
from .models import Rejection
from .transform import (
    WARMUP_BARS,
    bars_to_price_rows,
    compute_metrics,
    detect_gaps,
    metrics_to_rows,
    validate_bars,
)

logger = logging.getLogger("watchflow.runner")

#: Calendar days of history to read back as metric warm-up context. WARMUP_BARS
#: is a count of *trading* days, and ~5 trading days fall in every 7 calendar
#: days, so the span is widened accordingly plus slack for holiday clusters.
_WARMUP_CALENDAR_DAYS = int(WARMUP_BARS * 7 / 5) + 15


@dataclass
class RunResult:
    """Everything the run log needs, plus what the CLI prints."""

    run_id: int | None = None
    tickers_processed: int = 0
    rows_upserted: int = 0
    rows_rejected: int = 0
    status: str = "running"
    errors: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    rejections: list[Rejection] = field(default_factory=list)

    def error_summary(self) -> str | None:
        return "\n".join(self.errors) if self.errors else None

    def details(self) -> str | None:
        lines = list(self.notes)
        if self.rejections:
            lines.append(f"Rejected rows ({len(self.rejections)}), first 20:")
            lines.extend(f"  - {rejection}" for rejection in self.rejections[:20])
        return "\n".join(lines) if lines else None


def run_pipeline(settings: Settings, today: date | None = None) -> RunResult:
    """Execute one full pipeline run and record it in `pipeline_runs`."""
    today = today or date.today()
    result = RunResult()

    engine = db.build_engine(settings.database_url)

    # The run row is opened and committed before any work starts, so a run that
    # dies without reaching `finish_run` still leaves a `running` row behind
    # rather than vanishing.
    if not settings.dry_run:
        with engine.begin() as conn:
            result.run_id = db.start_run(conn, settings.trigger)
        logger.info("Opened pipeline run #%s (trigger=%s)", result.run_id, settings.trigger)
    else:
        logger.info("Dry run: no rows will be written and no run will be logged")

    try:
        _execute(engine, settings, today, result)
        result.status = _resolve_status(result)
    except Exception as exc:  # noqa: BLE001 - recorded, re-raised below
        result.status = "failed"
        result.errors.append(f"{type(exc).__name__}: {exc}")
        logger.error("Pipeline failed: %s", exc)
        logger.debug("%s", traceback.format_exc())
        _close_run(engine, settings, result)
        raise
    else:
        _close_run(engine, settings, result)

    return result


def _execute(engine: Engine, settings: Settings, today: date, result: RunResult) -> None:
    with engine.connect() as conn:
        tickers = db.fetch_watchlist_tickers(conn)
        last_dates = db.fetch_last_dates(conn, tickers)

    if not tickers:
        result.notes.append(
            "No tickers on any watchlist — nothing to extract. "
            "Seed one with `npm run db:seed` or add one in the UI."
        )
        logger.warning("Watchlist is empty; nothing to do")
        return

    logger.info(
        "Extracting %d ticker(s); %d already have stored history",
        len(tickers),
        len(last_dates),
    )

    session = build_session(settings.impersonate)
    batches = plan_batches(tickers, last_dates, today, settings)
    logger.info("Planned %d batch(es)", len(batches))

    raw_by_ticker: dict[str, list[dict[str, Any]]] = {ticker: [] for ticker in tickers}

    for index, (start, group) in enumerate(batches, start=1):
        logger.info(
            "Batch %d/%d: %s from %s", index, len(batches), ",".join(group), start
        )
        try:
            fetched = fetch_batch(group, start, today, session, settings)
        except ExtractError as exc:
            # One dead batch must not cost the other batches their data, so the
            # failure is recorded and the run continues as a partial failure.
            message = f"Batch {','.join(group)} from {start} failed: {exc}"
            logger.error("%s", message)
            result.errors.append(message)
            continue

        for ticker, rows in fetched.items():
            raw_by_ticker.setdefault(ticker, []).extend(rows)

    for ticker in tickers:
        _process_ticker(
            engine, settings, ticker, raw_by_ticker.get(ticker, []), result, today
        )


def _process_ticker(
    engine: Engine,
    settings: Settings,
    ticker: str,
    raw_rows: list[dict[str, Any]],
    result: RunResult,
    today: date,
) -> None:
    """Validate, load and re-derive metrics for one ticker."""
    if not raw_rows:
        result.notes.append(f"{ticker}: no rows returned by Yahoo for this window.")
        return

    bars, rejections = validate_bars(raw_rows)

    # A bar dated today can legitimately fail validation while the session is
    # still open: Yahoo serves a partially-formed candle whose high/low have not
    # caught up with the live price. That is a provisional row, not corrupt
    # data, and the next run's overlap window refetches the settled bar anyway.
    #
    # Counting it as a rejection would paint every intraday run
    # `partial_failure` in perpetuity, which would train everyone to ignore the
    # one status the run log exists to make meaningful.
    provisional = [item for item in rejections if item.date == today.isoformat()]
    corrupt = [item for item in rejections if item.date != today.isoformat()]

    result.rows_rejected += len(corrupt)
    result.rejections.extend(corrupt)

    if provisional:
        result.notes.append(
            f"{ticker}: skipped {len(provisional)} provisional bar(s) for {today} "
            "— the session had not settled. The next run will pick them up."
        )
        logger.info("%s: skipped %d provisional bar(s) for today", ticker, len(provisional))

    if corrupt:
        logger.warning("%s: rejected %d malformed row(s)", ticker, len(corrupt))

    if not bars:
        result.notes.append(f"{ticker}: every returned row failed validation.")
        return

    gaps = detect_gaps(ticker, bars)
    if gaps:
        result.notes.append(
            f"{ticker}: {len(gaps)} unexpected gap(s) on trading days — "
            + ", ".join(day.isoformat() for day in gaps)
        )

    first_new = min(bar.date for bar in bars)
    price_rows = bars_to_price_rows(bars)

    if settings.dry_run:
        logger.info(
            "%s: dry run — would upsert %d price row(s) from %s",
            ticker,
            len(price_rows),
            first_new,
        )
        result.tickers_processed += 1
        return

    try:
        with engine.begin() as conn:
            upserted = db.upsert_prices(conn, price_rows)

            # Metrics are derived *after* prices land, reading back a warm-up
            # window so rolling calculations see the history this incremental
            # fetch did not include.
            warmup_start = first_new - timedelta(days=_WARMUP_CALENDAR_DAYS)
            closes = db.fetch_closes_since(conn, ticker, warmup_start)
            metric_rows = metrics_to_rows(compute_metrics(ticker, closes, emit_from=first_new))
            db.upsert_metrics(conn, metric_rows)
    except Exception as exc:  # noqa: BLE001 - one ticker must not stop the rest
        message = f"{ticker}: load failed: {type(exc).__name__}: {exc}"
        logger.error("%s", message)
        result.errors.append(message)
        return

    result.rows_upserted += upserted
    result.tickers_processed += 1
    logger.info(
        "%s: upserted %d price row(s) and %d metric row(s)",
        ticker,
        upserted,
        len(metric_rows),
    )


def _resolve_status(result: RunResult) -> str:
    """Map what happened onto the three terminal statuses.

    `partial_failure` is deliberately reported for rejected rows as well as for
    failed batches: data that was fetched and then thrown away is a real loss,
    and a run log that called it "success" would hide exactly the thing the log
    exists to reveal.
    """
    if result.errors and result.tickers_processed == 0:
        return "failed"
    if result.errors or result.rows_rejected > 0:
        return "partial_failure"
    return "success"


def _close_run(engine: Engine, settings: Settings, result: RunResult) -> None:
    if settings.dry_run or result.run_id is None:
        return
    try:
        with engine.begin() as conn:
            db.finish_run(
                conn,
                result.run_id,
                status=result.status,
                tickers_processed=result.tickers_processed,
                rows_upserted=result.rows_upserted,
                rows_rejected=result.rows_rejected,
                error_summary=result.error_summary(),
                details=result.details(),
            )
    except Exception as exc:  # noqa: BLE001 - never mask the original failure
        logger.error("Could not finalise run #%s: %s", result.run_id, exc)
