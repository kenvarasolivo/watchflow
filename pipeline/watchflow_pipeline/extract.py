"""Extract: pull daily OHLCV from Yahoo Finance.

The TLS fingerprint problem
---------------------------
Yahoo Finance does not merely rate-limit by IP. Its edge fingerprints the
*TLS ClientHello* — cipher suite order, extensions, ALPN, elliptic curves, the
JA3/JA4 hash — and Python's `requests`/`urllib3` produce a ClientHello no real
browser emits. From a residential IP that is tolerated. From a datacenter IP
(GitHub Actions runners, Vercel, Render, any cloud) the combination of
"datacenter ASN" + "non-browser TLS fingerprint" gets served HTTP 429 or a
challenge page almost immediately, and often *only after* a handful of requests
have succeeded — which makes it look like ordinary rate limiting and sends you
down the wrong path adding sleeps.

Changing the `User-Agent` header does not help. The header is application-layer;
the fingerprint is taken during the handshake, before a single byte of HTTP is
sent. The rejection happens above the transport, on data the header cannot
reach.

`curl_cffi` fixes it properly: it binds to curl-impersonate, a build of libcurl
patched to reproduce a specific browser's TLS and HTTP/2 stack byte for byte.
A session created with `impersonate="chrome"` presents Chrome's ClientHello, so
the handshake is indistinguishable from a real browser's and the request is
served normally from a cloud IP.

The session built here is handed to yfinance so every underlying call — quotes,
history, the initial crumb/cookie negotiation — travels over the impersonated
transport. Impersonating on only some calls is worse than not at all: the
inconsistency itself is a signal.
"""

from __future__ import annotations

import inspect
import logging
import math
import random
import time
from datetime import date, timedelta
from typing import Any, Sequence

from .config import Settings

logger = logging.getLogger("watchflow.extract")

#: Substrings that mark a response as "Yahoo is refusing us", as opposed to a
#: genuine data problem. Only these are worth backing off and retrying.
_RETRYABLE_MARKERS = (
    "429",
    "too many requests",
    "rate limit",
    "timed out",
    "timeout",
    "connection",
    "temporarily unavailable",
    "503",
    "502",
    "504",
    "curl",
    "handshake",
    "unauthorized",
    "401",
)

#: Never sleep longer than this between attempts, however many have failed.
_MAX_BACKOFF_SECONDS = 60.0


class ExtractError(RuntimeError):
    """Raised when a batch could not be fetched after every retry."""


def build_session(impersonate: str):
    """A curl_cffi session presenting a real browser's TLS fingerprint.

    Raises rather than silently degrading to `requests`: falling back would
    "work" locally and then fail in CI with an opaque 429, which is exactly the
    failure mode this module exists to prevent.
    """
    try:
        from curl_cffi import requests as curl_requests
    except ImportError as exc:  # pragma: no cover - dependency is required
        raise ExtractError(
            "curl_cffi is not installed. It is not optional: without it Yahoo "
            "Finance rejects requests from datacenter IPs. Install it with "
            "`pip install -r requirements.txt`."
        ) from exc

    try:
        session = curl_requests.Session(impersonate=impersonate)
    except Exception as exc:
        raise ExtractError(
            f"curl_cffi could not impersonate {impersonate!r}. Pick a target "
            "your curl_cffi version supports (e.g. chrome, chrome124, "
            "safari17_0) via WATCHFLOW_IMPERSONATE."
        ) from exc

    logger.info("curl_cffi session ready, impersonating %s", impersonate)
    return session


def _download_accepts_session() -> bool:
    """Whether this yfinance exposes a `session` parameter on `download`.

    yfinance moved to curl_cffi internally around 0.2.54 and has shuffled this
    parameter more than once. Inspecting beats guessing from a version string,
    and beats catching TypeError after the request has already gone out.
    """
    import yfinance as yf

    try:
        return "session" in inspect.signature(yf.download).parameters
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return False


def _is_retryable(error: Exception) -> bool:
    message = str(error).lower()
    return any(marker in message for marker in _RETRYABLE_MARKERS)


def _sleep_for(attempt: int, base: float) -> float:
    """Exponential backoff with full jitter.

    Full jitter (uniform in ``[0, backoff]``) rather than fixed backoff because
    every ticker batch fails at the same moment when Yahoo throttles; retrying
    them all on the same schedule reproduces the burst that caused it.
    """
    backoff = min(base * (2**attempt), _MAX_BACKOFF_SECONDS)
    return random.uniform(0, backoff)


def _with_retry(operation, description: str, settings: Settings):
    """Run ``operation``, retrying retryable failures with backoff."""
    last_error: Exception | None = None

    for attempt in range(settings.max_retries):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001 - classified immediately below
            last_error = exc
            if not _is_retryable(exc):
                logger.warning("%s failed unretryably: %s", description, exc)
                raise
            if attempt == settings.max_retries - 1:
                break
            delay = _sleep_for(attempt, settings.backoff_base_seconds)
            logger.warning(
                "%s failed (attempt %d/%d): %s — retrying in %.1fs",
                description,
                attempt + 1,
                settings.max_retries,
                exc,
                delay,
            )
            time.sleep(delay)

    raise ExtractError(
        f"{description} failed after {settings.max_retries} attempts: {last_error}"
    ) from last_error


def start_date_for(
    ticker: str,
    last_dates: dict[str, date],
    today: date,
    settings: Settings,
) -> date:
    """Where this ticker's fetch window begins.

    Incremental by default: start a few days *before* the last stored bar rather
    than the day after it. The overlap costs almost nothing (the upsert
    collapses it) and it repairs the common case where Yahoo revised a recent
    bar after we first stored it.
    """
    if settings.full_refresh or ticker not in last_dates:
        return today - timedelta(days=settings.backfill_days)
    return last_dates[ticker] - timedelta(days=settings.overlap_days)


def plan_batches(
    tickers: Sequence[str],
    last_dates: dict[str, date],
    today: date,
    settings: Settings,
) -> list[tuple[date, list[str]]]:
    """Group tickers that share a start date into batched requests.

    One request for twelve tickers instead of twelve requests is the single
    biggest lever on how hard we lean on Yahoo. Tickers only batch together when
    their windows match, because `yf.download` takes one start date for the
    whole call — batching mismatched windows would silently over-fetch history
    for some and under-fetch for others.
    """
    by_start: dict[date, list[str]] = {}
    for ticker in tickers:
        start = start_date_for(ticker, last_dates, today, settings)
        by_start.setdefault(start, []).append(ticker)

    batches: list[tuple[date, list[str]]] = []
    for start in sorted(by_start):
        group = sorted(by_start[start])
        for offset in range(0, len(group), settings.batch_size):
            batches.append((start, group[offset : offset + settings.batch_size]))
    return batches


def _frame_for_ticker(frame, ticker: str):
    """Pull one ticker's sub-frame out of a yfinance response.

    `yf.download` returns flat columns for a single ticker and a MultiIndex for
    several — and which level holds the ticker has changed between releases. All
    three shapes are handled here so the caller never has to care.
    """
    import pandas as pd

    if frame is None or frame.empty:
        return None

    columns = frame.columns
    if not isinstance(columns, pd.MultiIndex):
        return frame

    if ticker in columns.get_level_values(0):
        return frame.xs(ticker, axis=1, level=0)
    if columns.nlevels > 1 and ticker in columns.get_level_values(1):
        return frame.xs(ticker, axis=1, level=1)
    return None


def _rows_from_frame(frame, ticker: str) -> tuple[list[dict[str, Any]], int]:
    """Flatten one ticker's sub-frame into raw row dicts.

    Returns the rows plus a count of all-NaN rows that were skipped. Those are
    an artefact of batching — when one ticker in a batch trades on a date
    another does not (different exchange holidays, a listing that starts later),
    pandas pads the missing side with NaN. That is not malformed data and must
    not be logged as a rejection; a genuinely missing session is caught later by
    calendar-based gap detection instead.
    """
    rows: list[dict[str, Any]] = []
    padded = 0

    required = ("Open", "High", "Low", "Close", "Volume")
    if any(column not in frame.columns for column in required):
        logger.warning(
            "%s: response is missing columns %s",
            ticker,
            [c for c in required if c not in frame.columns],
        )
        return rows, padded

    for timestamp, record in frame.iterrows():
        values = {name: record[name] for name in required}

        if all(_is_nan(values[name]) for name in ("Open", "High", "Low", "Close")):
            padded += 1
            continue

        # yfinance indexes daily bars at midnight in the *exchange's* timezone,
        # so the calendar date is read straight off the timestamp. Normalising
        # through UTC here would shift bars across the date boundary.
        bar_date = timestamp.date() if hasattr(timestamp, "date") else timestamp

        rows.append(
            {
                "ticker": ticker,
                "date": bar_date,
                "open": values["Open"],
                "high": values["High"],
                "low": values["Low"],
                "close": values["Close"],
                "volume": values["Volume"],
            }
        )

    return rows, padded


def _is_nan(value: Any) -> bool:
    try:
        return value is None or math.isnan(float(value))
    except (TypeError, ValueError):
        return False


def fetch_batch(
    tickers: Sequence[str],
    start: date,
    end: date,
    session,
    settings: Settings,
) -> dict[str, list[dict[str, Any]]]:
    """Fetch one batch of tickers, returning raw (unvalidated) rows per ticker."""
    import yfinance as yf

    ticker_list = list(tickers)
    description = f"download {len(ticker_list)} ticker(s) from {start}"

    kwargs: dict[str, Any] = {
        "tickers": ticker_list,
        "start": start.isoformat(),
        # yfinance treats `end` as exclusive, so it is pushed a day past today
        # to include today's bar once the session has settled.
        "end": (end + timedelta(days=1)).isoformat(),
        "interval": "1d",
        # Split- and dividend-adjusted OHLC. Unadjusted prices would put a
        # fabricated -50% daily return in the metrics on every split date.
        # The trade-off is that Yahoo revises *all* history after a split, which
        # the few-day overlap window cannot repair — hence `--full-refresh`.
        "auto_adjust": True,
        "actions": False,
        "progress": False,
        # Single-threaded on purpose: yfinance's thread pool issues concurrent
        # requests, and a burst of them from one datacenter IP is precisely what
        # triggers Yahoo's throttling.
        "threads": False,
        "group_by": "ticker",
    }

    if _download_accepts_session():
        kwargs["session"] = session
    else:  # pragma: no cover - depends on installed yfinance
        logger.warning(
            "This yfinance build does not accept an external session; falling "
            "back to its internal curl_cffi transport. Impersonation target "
            "WATCHFLOW_IMPERSONATE=%s will be ignored.",
            settings.impersonate,
        )

    frame = _with_retry(lambda: yf.download(**kwargs), description, settings)

    results: dict[str, list[dict[str, Any]]] = {}
    for ticker in ticker_list:
        sub = _frame_for_ticker(frame, ticker)
        if sub is None or sub.empty:
            logger.info("%s: no rows returned for %s → %s", ticker, start, end)
            results[ticker] = []
            continue

        rows, padded = _rows_from_frame(sub, ticker)
        if padded:
            logger.debug("%s: skipped %d batch-padding row(s)", ticker, padded)
        results[ticker] = rows

    return results
