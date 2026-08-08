"""Forecast: a one-session-ahead range for each ticker, written to be scored.

What this is
------------
A volatility band, not a prediction of direction. The next session's close is
modelled as the last close times a lognormal shock whose width is estimated
from the ticker's own recent behaviour. The output is a central estimate plus
the one-sigma interval around it — "about 68% of sessions should land in here".

Why it is deliberately this modest
----------------------------------
Next-day direction in liquid equities is close to a coin flip, and any model
that claims otherwise from daily OHLCV alone is fitting noise. What *is*
forecastable from daily bars is the **scale** of the next move: volatility
clusters strongly (a violent week is followed by a violent week far more often
than chance), which is why the band width carries real information even though
its centre barely does.

So the honest product is an interval, and the honest way to ship an interval is
to score it. Every row this module produces is stored before the outcome exists
and is compared against the real close later (see `db.score_predictions`), so
the UI can state the realised hit rate instead of asking to be trusted. A
well-calibrated one-sigma band lands around 68% of the time; if this one lands
40% of the time, the page says 40%.

Modelling choices, and why
--------------------------
*Log returns, not simple returns.* The band is built multiplicatively —
``close * exp(mu ± sigma)`` — so it cannot produce a negative price, and it is
asymmetric in price space in the direction real price distributions actually
are. A symmetric ±x% band around the close is the same statement about the
upside and the downside, which is not what a lognormal shock implies.

*The drift is capped rather than trusted.* The sample mean of 30 daily returns
has a standard error of roughly ``sigma / sqrt(30)`` ≈ ``0.18 * sigma``, which
is the same order of magnitude as the mean itself. Extrapolating it verbatim
would be reading a number that is mostly estimation error, and it would make
the band chase momentum right at the turns. It is clamped to a quarter of a
sigma: enough for a strong sustained trend to nudge the centre, not enough for
a noisy fortnight to swing it.

*The window matches the volatility metric already on the page.* Sigma is
estimated over the same 30 sessions as `metrics.volatility_30d`, so the band and
the volatility figure shown next to it are two views of one number rather than
two numbers that disagree.
"""

from __future__ import annotations

import logging
import math
import statistics
from datetime import date as Date, timedelta
from decimal import Decimal
from typing import Sequence

from .models import ForecastRow
from .trading_calendar import is_trading_day

logger = logging.getLogger("watchflow.forecast")

#: Trailing sessions used to estimate sigma. Matches `transform.VOLATILITY_WINDOW`
#: on purpose — see the module docstring.
FORECAST_WINDOW = 30

#: Below this many usable returns the estimate is too thin to publish. A band
#: fitted to eight sessions would be presented with the same confidence as one
#: fitted to thirty, and would be wrong far more often.
MIN_SAMPLE = 20

#: Hard ceiling on the drift, as a multiple of sigma. See the module docstring.
DRIFT_CAP_SIGMAS = 0.25

#: Narrowest band worth publishing, as a percentage half-width — one basis
#: point. Below this the symbol is not really trading (halted, pegged, a stale
#: feed repeating one close), and a band that tight would be graded as a miss on
#: any move at all, quietly dragging the hit rate down with a stock that never
#: moved. It also keeps a sigma that is pure floating-point residue from
#: reaching the `> 0` constraint on the stored column as a rounded 0.0.
MIN_SIGMA_PCT = 0.01

#: Guard against a runaway search if the calendar is ever asked about a date far
#: outside the range it models. Ten calendar days always contains a session.
_MAX_CALENDAR_SEARCH_DAYS = 10


def next_trading_day(after: Date) -> Date:
    """The first NYSE session strictly after ``after``.

    The forecast targets a specific dated session rather than "tomorrow", so a
    Friday close forecasts Monday and the row can be matched against the real
    bar by date when it arrives.
    """
    candidate = after + timedelta(days=1)
    for _ in range(_MAX_CALENDAR_SEARCH_DAYS):
        if is_trading_day(candidate):
            return candidate
        candidate += timedelta(days=1)
    # Unreachable for any real date: no NYSE closure runs ten days.
    raise ValueError(f"No trading day found within 10 days of {after}")


def trades_every_day(dates: Sequence[Date]) -> bool:
    """Whether this instrument produces bars on weekends.

    Crypto pairs (`BTC-USD`) settle seven days a week. Handing them the NYSE
    calendar would make every Friday forecast target Monday, so the band — built
    from one-session volatility — would be scored against three days of
    movement. That is not a cosmetic mismatch: it biases the hit rate downward
    on exactly the symbols where nothing is wrong with the model.

    Inferring the schedule from the ticker's own bars beats maintaining a list
    of crypto suffixes, because it is right by construction for anything that
    turns up later.
    """
    return any(day.weekday() >= 5 for day in dates)


def next_session(after: Date, observed: Sequence[Date]) -> Date:
    """The next session for an instrument with this observed bar history."""
    if trades_every_day(observed):
        return after + timedelta(days=1)
    return next_trading_day(after)


def _log_returns(values: Sequence[float]) -> list[float]:
    """Close-to-close log returns, skipping any non-positive close.

    A non-positive close cannot happen in validated data (`RawBar` requires
    ``> 0``), but the guard keeps a corrupt warm-up row from producing a NaN
    that would silently poison the whole band.
    """
    returns: list[float] = []
    for index in range(1, len(values)):
        previous, current = values[index - 1], values[index]
        if previous > 0 and current > 0:
            returns.append(math.log(current / previous))
    return returns


def build_forecast(
    ticker: str,
    closes: Sequence[tuple[Date, Decimal]],
) -> ForecastRow | None:
    """Forecast the session after the last close in ``closes``.

    ``closes`` is the ticker's recent history, oldest first — the same warm-up
    window the metrics are derived from. Returns ``None`` when there is not
    enough history to estimate a band, which is a normal outcome for a ticker
    added days ago and must not be treated as a failure.
    """
    ordered = sorted(closes, key=lambda item: item[0])
    if len(ordered) < MIN_SAMPLE + 1:
        logger.debug(
            "%s: %d close(s) is below the %d needed for a forecast",
            ticker,
            len(ordered),
            MIN_SAMPLE + 1,
        )
        return None

    basis_date, basis_close_decimal = ordered[-1]
    basis_close = float(basis_close_decimal)
    if basis_close <= 0:
        return None

    values = [float(item[1]) for item in ordered]
    returns = _log_returns(values)[-FORECAST_WINDOW:]

    # Read the schedule off the same window the sigma is estimated over, so a
    # symbol is judged on how it trades now rather than on a listing history
    # that may predate a change to it.
    recent_dates = [item[0] for item in ordered[-(FORECAST_WINDOW + 1) :]]

    if len(returns) < MIN_SAMPLE:
        logger.debug("%s: only %d usable return(s), need %d", ticker, len(returns), MIN_SAMPLE)
        return None

    sigma = statistics.stdev(returns)
    sigma_pct = round((math.exp(sigma) - 1.0) * 100.0, 6) if math.isfinite(sigma) else 0.0

    # Tested on the *published* half-width, not on the raw sigma. A window of
    # near-identical closes leaves a sigma that is floating-point residue rather
    # than zero, which would pass a `sigma > 0` check and then round to a 0.00%
    # band on the way out.
    if sigma_pct < MIN_SIGMA_PCT:
        logger.info(
            "%s: volatility over the last %d sessions is too small to band (%.6f%%)",
            ticker,
            len(returns),
            sigma_pct,
        )
        return None

    raw_drift = statistics.fmean(returns)
    cap = DRIFT_CAP_SIGMAS * sigma
    drift = max(-cap, min(cap, raw_drift))

    central = basis_close * math.exp(drift)
    low = basis_close * math.exp(drift - sigma)
    high = basis_close * math.exp(drift + sigma)

    if not all(math.isfinite(value) for value in (central, low, high)):  # pragma: no cover
        logger.warning("%s: non-finite forecast, skipping", ticker)
        return None

    return ForecastRow(
        ticker=ticker,
        target_date=next_session(basis_date, recent_dates),
        basis_date=basis_date,
        basis_close=_money(basis_close),
        central=_money(central),
        low=_money(low),
        high=_money(high),
        # The band's own half-width in price terms, so `sigma_pct` and
        # `high / central - 1` are the same number rather than two nearly-equal
        # ones the reader has to reconcile.
        sigma_pct=sigma_pct,
        drift_pct=round((math.exp(drift) - 1.0) * 100.0, 6),
        sample_size=len(returns),
    )


def _money(value: float) -> Decimal:
    """Quantise to the `numeric(18, 6)` the column stores.

    Same reasoning as `models.PRICE_QUANTUM`: the value validated here is
    byte-identical to the value Postgres keeps, so re-running the pipeline on
    the same day rewrites the row with the same bytes instead of churning it.
    """
    return Decimal(f"{value:.6f}")


def forecasts_to_rows(rows: Sequence[ForecastRow]) -> list[dict]:
    """Shape forecasts for `db.upsert_predictions`."""
    return [
        {
            "ticker": row.ticker,
            "target_date": row.target_date,
            "basis_date": row.basis_date,
            "basis_close": row.basis_close,
            "central": row.central,
            "low": row.low,
            "high": row.high,
            "sigma_pct": row.sigma_pct,
            "drift_pct": row.drift_pct,
            "sample_size": row.sample_size,
        }
        for row in rows
    ]
