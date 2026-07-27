"""Transform: validate raw bars, flag gaps, and derive analytics."""

from __future__ import annotations

import logging
import math
import statistics
from datetime import date as Date
from decimal import Decimal
from typing import Any, Iterable, Sequence

from pydantic import ValidationError

from .models import MetricRow, RawBar, Rejection
from .trading_calendar import missing_trading_days

logger = logging.getLogger("watchflow.transform")

MA_SHORT_WINDOW = 20
MA_LONG_WINDOW = 50
VOLATILITY_WINDOW = 30

#: Trading days per year, the conventional factor for annualising a daily
#: standard deviation. Volatility is reported annualised because "18%" is a
#: number people have intuition for; the raw daily figure (~1.1%) is not.
TRADING_DAYS_PER_YEAR = 252

#: Enough prior closes for the longest window (MA-50) plus slack, so an
#: incremental run can still produce correct rolling values for its new bars.
WARMUP_BARS = MA_LONG_WINDOW + VOLATILITY_WINDOW + 5


def validate_bars(rows: Iterable[dict[str, Any]]) -> tuple[list[RawBar], list[Rejection]]:
    """Split raw rows into validated bars and logged rejections.

    A malformed row is never allowed to abort the run: one bad bar for one
    ticker must not cost every other ticker its data. Rejections are counted and
    written to the run log so they are visible rather than silently swallowed.

    Duplicate dates keep the last occurrence — the batch overlap window means
    the same date can legitimately arrive twice, and the later copy is the more
    recently revised one.
    """
    accepted: dict[tuple[str, Date], RawBar] = {}
    rejections: list[Rejection] = []

    for row in rows:
        try:
            bar = RawBar.model_validate(row)
        except ValidationError as exc:
            rejections.append(
                Rejection(
                    ticker=str(row.get("ticker", "?")),
                    date=str(row.get("date", "?")),
                    reason=_summarise_validation_error(exc),
                )
            )
            continue

        accepted[(bar.ticker, bar.date)] = bar

    bars = sorted(accepted.values(), key=lambda bar: (bar.ticker, bar.date))
    return bars, rejections


def _summarise_validation_error(exc: ValidationError) -> str:
    """Flatten a pydantic error into one line fit for a log column."""
    parts: list[str] = []
    for error in exc.errors():
        location = ".".join(str(item) for item in error["loc"]) or "row"
        parts.append(f"{location}: {error['msg']}")
    return "; ".join(parts[:4])


def detect_gaps(
    ticker: str,
    bars: Sequence[RawBar],
    limit: int = 12,
) -> list[Date]:
    """NYSE sessions inside the returned range that produced no bar.

    Bounded by the ticker's *own* first and last returned bar, not by the
    requested window — a symbol listed halfway through the range has no data
    before its IPO and that is not a gap.

    Weekends and holidays never appear here, which is the whole point: routine
    market closure is expected and silent, while a hole on a real trading day is
    surfaced for a human to look at.

    Caveat worth knowing when reading the run log: the calendar is NYSE. A
    non-US listing (`RY.TO`, `BP.L`) will show false gaps on its own local
    holidays. That is why gaps are informational and never fail a run.
    """
    if len(bars) < 2:
        return []

    present = {bar.date for bar in bars}
    missing = missing_trading_days(present, min(present), max(present))

    if missing:
        logger.info(
            "%s: %d trading day(s) with no bar between %s and %s%s",
            ticker,
            len(missing),
            min(present),
            max(present),
            f" (showing first {limit})" if len(missing) > limit else "",
        )
    return missing[:limit]


def compute_metrics(
    ticker: str,
    closes: Sequence[tuple[Date, Decimal]],
    emit_from: Date | None = None,
) -> list[MetricRow]:
    """Derive daily return, MA-20, MA-50 and 30-day volatility.

    ``closes`` must be the ticker's full recent history, oldest first — warm-up
    bars already in the database concatenated with the newly fetched ones. That
    is what makes an incremental run correct: fetching three new bars still
    yields a true MA-50 for them, because the previous 49 closes are present as
    context even though they are not re-emitted.

    ``emit_from`` limits the output to dates at or after it, so a run writes
    metrics only for the range it actually refreshed.

    Every metric is ``None`` until its window is full. A 12-observation
    "20-day average" would be a different statistic wearing the same name.
    """
    ordered = sorted(closes, key=lambda item: item[0])
    if not ordered:
        return []

    dates = [item[0] for item in ordered]
    values = [float(item[1]) for item in ordered]

    returns: list[float | None] = [None] * len(values)
    for index in range(1, len(values)):
        previous = values[index - 1]
        if previous > 0:
            returns[index] = (values[index] / previous - 1.0) * 100.0

    rows: list[MetricRow] = []
    for index, current_date in enumerate(dates):
        if emit_from is not None and current_date < emit_from:
            continue

        rows.append(
            MetricRow(
                ticker=ticker,
                date=current_date,
                daily_return=_round_or_none(returns[index], 6),
                ma_20=_moving_average(values, index, MA_SHORT_WINDOW),
                ma_50=_moving_average(values, index, MA_LONG_WINDOW),
                volatility_30d=_volatility(returns, index, VOLATILITY_WINDOW),
            )
        )

    return rows


def _moving_average(values: Sequence[float], index: int, window: int) -> Decimal | None:
    if index + 1 < window:
        return None
    average = sum(values[index + 1 - window : index + 1]) / window
    return Decimal(f"{average:.6f}")


def _volatility(
    returns: Sequence[float | None],
    index: int,
    window: int,
) -> float | None:
    """Annualised sample standard deviation of the trailing daily returns."""
    if index + 1 <= window:
        # Needs `window` *returns*, and the first bar has none — so the earliest
        # possible index is `window`, not `window - 1`.
        return None

    recent = returns[index + 1 - window : index + 1]
    if any(value is None for value in recent):
        return None

    daily = statistics.stdev([float(value) for value in recent])  # type: ignore[arg-type]
    return _round_or_none(daily * math.sqrt(TRADING_DAYS_PER_YEAR), 6)


def _round_or_none(value: float | None, digits: int) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def bars_to_price_rows(bars: Iterable[RawBar]) -> list[dict[str, Any]]:
    """Shape validated bars for `db.upsert_prices`."""
    return [
        {
            "ticker": bar.ticker,
            "date": bar.date,
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
        }
        for bar in bars
    ]


def metrics_to_rows(rows: Iterable[MetricRow]) -> list[dict[str, Any]]:
    """Shape derived metrics for `db.upsert_metrics`."""
    return [
        {
            "ticker": row.ticker,
            "date": row.date,
            "daily_return": row.daily_return,
            "ma_20": row.ma_20,
            "ma_50": row.ma_50,
            "volatility_30d": row.volatility_30d,
        }
        for row in rows
    ]
