"""CLI entry point: `python -m watchflow_pipeline`."""

from __future__ import annotations

import argparse
import dataclasses
import sys
from datetime import date

from .config import ConfigError, Settings
from .logging_setup import configure_logging
from .runner import run_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m watchflow_pipeline",
        description=(
            "Extract daily OHLCV for every watchlisted ticker, validate and "
            "enrich it, and upsert it into Postgres."
        ),
    )
    parser.add_argument(
        "--full-refresh",
        action="store_true",
        help=(
            "Ignore stored watermarks and refetch the full backfill window for "
            "every ticker. Needed after a stock split, because Yahoo revises "
            "all prior history and the normal few-day overlap cannot repair it."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract and transform, but write nothing and log no run.",
    )
    parser.add_argument(
        "--trigger",
        default=None,
        help='Label recorded on the run row (e.g. "schedule", "manual").',
    )
    parser.add_argument(
        "--as-of",
        default=None,
        metavar="YYYY-MM-DD",
        help="Treat this date as today. Useful for reproducing a past run.",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Debug logging.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logger = configure_logging(verbose=args.verbose)

    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        logger.error("%s", exc)
        return 2

    settings = dataclasses.replace(
        settings,
        full_refresh=args.full_refresh,
        dry_run=args.dry_run,
        trigger=args.trigger or settings.trigger,
    )

    as_of: date | None = None
    if args.as_of:
        try:
            as_of = date.fromisoformat(args.as_of)
        except ValueError:
            logger.error("--as-of must be an ISO date (YYYY-MM-DD), got %r", args.as_of)
            return 2

    try:
        result = run_pipeline(settings, today=as_of)
    except Exception as exc:  # noqa: BLE001 - top-level boundary
        logger.error("Pipeline aborted: %s", exc)
        return 1

    logger.info(
        "Run %s: status=%s tickers=%d upserted=%d rejected=%d",
        f"#{result.run_id}" if result.run_id else "(dry)",
        result.status,
        result.tickers_processed,
        result.rows_upserted,
        result.rows_rejected,
    )

    # A partial failure exits non-zero on purpose: a scheduled run that quietly
    # lost a ticker should turn the workflow amber, not green.
    return 0 if result.status == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
