"""Extract: headlines per ticker, for putting a session's move in context.

Why this rides along with the price fetch
-----------------------------------------
It has to run from somewhere that can actually reach Yahoo. The Next.js app is
on Vercel — a datacenter IP behind a Node runtime that cannot forge a browser
TLS ClientHello — and `lib/yahoo.ts` documents what happens there. This module
runs inside the pipeline, which already holds a `curl_cffi` session presenting
Chrome's fingerprint (see `extract.py`), so the same transport that gets the
prices gets the headlines.

Why failures here are always soft
---------------------------------
News is context, prices are the product. A run that loads every bar correctly
and gets a 429 on the news endpoint has succeeded at its job. Every function
below therefore returns what it managed to collect and lets the caller record a
note; nothing in this module raises into the run's error list, and no news
failure can change a run's status.

The response shape moves around
-------------------------------
yfinance has served two different news payloads across the range this project
pins. The pre-0.2.55 shape is flat (``uuid`` / ``title`` / ``publisher`` /
``link`` / ``providerPublishTime`` as a unix timestamp); the current shape nests
everything under ``content`` with an ISO ``pubDate``. Both are normalised here,
because pinning one is how you get an empty news feed after a routine
dependency bump — silently, since the call still succeeds and just returns rows
this code no longer recognises.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Sequence

from pydantic import ValidationError

from .models import NewsArticle

logger = logging.getLogger("watchflow.news")

#: Headlines requested per ticker. Yahoo caps this well below what a busy
#: symbol produces in a week, and the UI only ever shows a handful around one
#: session, so asking for more is bandwidth spent on rows nobody reads.
ARTICLES_PER_TICKER = 12

#: Titles longer than this are almost always a truncated article body that came
#: through the wrong field. Stored truncated rather than dropped, since the
#: first sentence still identifies the story.
MAX_TITLE_LENGTH = 500


def article_id(link: str) -> str:
    """Stable id for a headline, derived from its canonical URL.

    Not the publisher's own id: Yahoo has renamed that field (``uuid`` → ``id``)
    and changed its format across yfinance releases, so keying on it would make
    the same article arrive as a new row after a dependency bump. The URL is the
    one identifier that has survived every shape change.
    """
    return hashlib.sha1(link.strip().encode("utf-8")).hexdigest()


def _first_str(*candidates: Any) -> str | None:
    """First candidate that is a non-empty string, after stripping."""
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _nested_url(value: Any) -> str | None:
    """Pull a URL out of either a bare string or a ``{"url": ...}`` wrapper."""
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        return _first_str(value.get("url"))
    return None


def _parse_timestamp(value: Any) -> datetime | None:
    """Accept both payload flavours' notion of a publish time, as UTC.

    Returns ``None`` rather than falling back to "now" for an unparseable
    value. A headline stamped with the fetch time would sort to the top of every
    window and get attributed to whatever session happened to be on screen,
    which is worse than not showing it at all.
    """
    if isinstance(value, (int, float)) and value > 0:
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None

    if isinstance(value, str) and value.strip():
        text = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        # A naive timestamp from Yahoo is UTC; saying so explicitly keeps the
        # column's `timestamptz` from being handed an ambiguous value.
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed

    return None


def normalise_article(raw: Any, ticker: str) -> NewsArticle | None:
    """Flatten one raw news entry into a validated row, or ``None``.

    Anything missing a title, a link or a usable publish time is dropped: all
    three are load-bearing for the only thing this data is used for, which is
    "what was being reported around the session that moved".
    """
    if not isinstance(raw, dict):
        return None

    # Current shape nests under `content`; the legacy shape is flat. Reading
    # both from one merged view avoids two near-identical extraction paths.
    content = raw.get("content")
    body: dict[str, Any] = content if isinstance(content, dict) else raw

    title = _first_str(body.get("title"), raw.get("title"))
    if title is None:
        return None

    link = _nested_url(body.get("canonicalUrl")) or _nested_url(
        body.get("clickThroughUrl")
    ) or _first_str(body.get("link"), raw.get("link"))
    if link is None:
        return None

    published = _parse_timestamp(
        body.get("pubDate")
        or body.get("displayTime")
        or body.get("providerPublishTime")
        or raw.get("providerPublishTime")
    )
    if published is None:
        return None

    provider = body.get("provider")
    publisher = _first_str(
        provider.get("displayName") if isinstance(provider, dict) else None,
        body.get("publisher"),
        raw.get("publisher"),
    )

    try:
        return NewsArticle(
            ticker=ticker,
            article_id=article_id(link),
            title=title[:MAX_TITLE_LENGTH],
            publisher=publisher[:128] if publisher else None,
            link=link,
            published_at=published,
        )
    except ValidationError as exc:
        logger.debug("%s: dropped a headline: %s", ticker, exc)
        return None


def normalise_articles(raw_items: Any, ticker: str) -> list[NewsArticle]:
    """Normalise a whole response, de-duplicated by article id.

    Yahoo repeats the same story across its feeds often enough that a plain
    insert would hit the primary key twice inside one batch, so the collapse
    happens here rather than being left to the upsert.
    """
    if not isinstance(raw_items, Sequence) or isinstance(raw_items, (str, bytes)):
        return []

    seen: dict[str, NewsArticle] = {}
    for item in raw_items:
        article = normalise_article(item, ticker)
        if article is not None:
            seen.setdefault(article.article_id, article)
    return list(seen.values())


def fetch_news(ticker: str, session, count: int = ARTICLES_PER_TICKER) -> list[NewsArticle]:
    """Headlines for one ticker over the impersonated session.

    Never raises. A symbol with no coverage, a throttled endpoint and a yfinance
    build that renamed the accessor are all the same outcome from the caller's
    point of view — no headlines this run — and none of them is worth failing a
    price load over.
    """
    import yfinance as yf

    try:
        handle = yf.Ticker(ticker, session=session)
    except TypeError:  # pragma: no cover - depends on installed yfinance
        # Older builds do not accept an external session and fall back to their
        # own transport. Worth a warning: that request is not impersonated and
        # is the one most likely to be throttled from a runner.
        logger.warning(
            "%s: this yfinance build does not accept an external session for "
            "news; the request will not be impersonated.",
            ticker,
        )
        handle = yf.Ticker(ticker)

    try:
        raw = handle.get_news(count=count)
    except TypeError:
        # `get_news` gained its `count` parameter mid-series, and older builds
        # expose the feed as a plain property.
        try:
            raw = handle.news
        except Exception as exc:  # noqa: BLE001 - soft by contract
            logger.warning("%s: news fetch failed: %s", ticker, exc)
            return []
    except Exception as exc:  # noqa: BLE001 - soft by contract
        logger.warning("%s: news fetch failed: %s", ticker, exc)
        return []

    articles = normalise_articles(raw, ticker)
    logger.info("%s: %d headline(s) usable", ticker, len(articles))
    return articles


def articles_to_rows(articles: Sequence[NewsArticle]) -> list[dict[str, Any]]:
    """Shape headlines for `db.upsert_news`."""
    return [
        {
            "ticker": article.ticker,
            "article_id": article.article_id,
            "title": article.title,
            "publisher": article.publisher,
            "link": article.link,
            "published_at": article.published_at,
        }
        for article in articles
    ]
