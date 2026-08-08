from datetime import datetime, timezone

from watchflow_pipeline.news import (
    MAX_TITLE_LENGTH,
    article_id,
    articles_to_rows,
    normalise_article,
    normalise_articles,
)

# The two payload shapes yfinance has served across the range this project
# pins. Both are exercised here because pinning one is how the news feed goes
# silently empty after a routine dependency bump — the call still succeeds and
# just returns rows the parser no longer recognises.

LEGACY = {
    "uuid": "8f2c-legacy",
    "title": "Nvidia slips as data-centre orders cool",
    "publisher": "Reuters",
    "link": "https://example.com/nvda-orders",
    "providerPublishTime": 1_754_553_600,  # 2025-08-07 08:00:00 UTC
    "type": "STORY",
}

CURRENT = {
    "id": "abc-current",
    "content": {
        "contentType": "STORY",
        "title": "Chip index drops for a third day",
        "pubDate": "2026-08-07T07:40:00Z",
        "provider": {"displayName": "Bloomberg"},
        "canonicalUrl": {"url": "https://example.com/chip-index"},
        "clickThroughUrl": {"url": "https://example.com/chip-index?src=yahoo"},
    },
}


class TestArticleId:
    def test_is_stable_for_the_same_url(self):
        assert article_id("https://example.com/a") == article_id("https://example.com/a")

    def test_ignores_surrounding_whitespace(self):
        assert article_id(" https://example.com/a ") == article_id("https://example.com/a")

    def test_differs_across_urls(self):
        assert article_id("https://example.com/a") != article_id("https://example.com/b")

    def test_fits_the_column(self):
        assert len(article_id("https://example.com/a")) <= 64


class TestNormaliseArticleLegacyShape:
    def test_reads_every_field(self):
        article = normalise_article(LEGACY, "NVDA")

        assert article.ticker == "NVDA"
        assert article.title == "Nvidia slips as data-centre orders cool"
        assert article.publisher == "Reuters"
        assert article.link == "https://example.com/nvda-orders"
        assert article.published_at == datetime(2025, 8, 7, 8, 0, tzinfo=timezone.utc)

    def test_id_comes_from_the_url_not_the_uuid(self):
        """Yahoo has renamed and reformatted its own id; the URL has not.

        Keying on the publisher's id would make the same article arrive as a
        brand new row after a dependency bump.
        """
        article = normalise_article(LEGACY, "NVDA")
        assert article.article_id == article_id(LEGACY["link"])


class TestNormaliseArticleCurrentShape:
    def test_reads_the_nested_fields(self):
        article = normalise_article(CURRENT, "NVDA")

        assert article.title == "Chip index drops for a third day"
        assert article.publisher == "Bloomberg"
        assert article.published_at == datetime(2026, 8, 7, 7, 40, tzinfo=timezone.utc)

    def test_prefers_the_canonical_url_over_the_tracking_one(self):
        article = normalise_article(CURRENT, "NVDA")
        assert article.link == "https://example.com/chip-index"

    def test_falls_back_to_the_click_through_url(self):
        payload = {"content": dict(CURRENT["content"])}
        del payload["content"]["canonicalUrl"]

        article = normalise_article(payload, "NVDA")
        assert article.link == "https://example.com/chip-index?src=yahoo"


class TestNormaliseArticleRejections:
    def test_missing_title(self):
        payload = {k: v for k, v in LEGACY.items() if k != "title"}
        assert normalise_article(payload, "NVDA") is None

    def test_missing_link(self):
        payload = {k: v for k, v in LEGACY.items() if k != "link"}
        assert normalise_article(payload, "NVDA") is None

    def test_missing_publish_time(self):
        """A headline stamped with the fetch time would float to the top of
        every window and get attributed to whatever session was on screen."""
        payload = {k: v for k, v in LEGACY.items() if k != "providerPublishTime"}
        assert normalise_article(payload, "NVDA") is None

    def test_unparseable_publish_time(self):
        assert normalise_article({**LEGACY, "providerPublishTime": "not a date"}, "N") is None

    def test_blank_title(self):
        assert normalise_article({**LEGACY, "title": "   "}, "NVDA") is None

    def test_non_dict_entry(self):
        assert normalise_article("just a string", "NVDA") is None
        assert normalise_article(None, "NVDA") is None

    def test_missing_publisher_is_tolerated(self):
        """Publisher is the one optional field — a headline still works without it."""
        payload = {k: v for k, v in LEGACY.items() if k != "publisher"}
        article = normalise_article(payload, "NVDA")

        assert article is not None
        assert article.publisher is None


class TestTimestampParsing:
    def test_iso_with_offset(self):
        payload = {**CURRENT}
        payload["content"] = {**CURRENT["content"], "pubDate": "2026-08-07T09:40:00+02:00"}

        article = normalise_article(payload, "NVDA")
        assert article.published_at == datetime(2026, 8, 7, 7, 40, tzinfo=timezone.utc)

    def test_naive_iso_is_read_as_utc(self):
        payload = {**CURRENT}
        payload["content"] = {**CURRENT["content"], "pubDate": "2026-08-07T07:40:00"}

        article = normalise_article(payload, "NVDA")
        assert article.published_at == datetime(2026, 8, 7, 7, 40, tzinfo=timezone.utc)

    def test_result_is_always_timezone_aware(self):
        for payload in (LEGACY, CURRENT):
            assert normalise_article(payload, "NVDA").published_at.tzinfo is not None

    def test_zero_and_negative_timestamps_rejected(self):
        assert normalise_article({**LEGACY, "providerPublishTime": 0}, "N") is None
        assert normalise_article({**LEGACY, "providerPublishTime": -5}, "N") is None


class TestNormaliseArticles:
    def test_handles_both_shapes_in_one_response(self):
        articles = normalise_articles([LEGACY, CURRENT], "NVDA")
        assert len(articles) == 2

    def test_collapses_duplicates_by_url(self):
        """Yahoo repeats stories across feeds; a plain insert would hit the
        primary key twice inside a single batch."""
        duplicate = {**CURRENT, "id": "different-id"}
        articles = normalise_articles([CURRENT, duplicate], "NVDA")

        assert len(articles) == 1

    def test_drops_unusable_entries_without_losing_the_rest(self):
        articles = normalise_articles([LEGACY, {"title": "orphan"}, None, CURRENT], "NVDA")
        assert len(articles) == 2

    def test_long_title_is_truncated_not_dropped(self):
        payload = {**LEGACY, "title": "x" * (MAX_TITLE_LENGTH + 200)}
        [article] = normalise_articles([payload], "NVDA")

        assert len(article.title) == MAX_TITLE_LENGTH

    def test_non_sequence_response(self):
        assert normalise_articles(None, "NVDA") == []
        assert normalise_articles({"quotes": []}, "NVDA") == []
        assert normalise_articles("a string is a sequence but not a feed", "NVDA") == []

    def test_empty(self):
        assert normalise_articles([], "NVDA") == []


class TestArticlesToRows:
    def test_shapes_every_column_the_upsert_needs(self):
        [row] = articles_to_rows(normalise_articles([CURRENT], "NVDA"))

        assert set(row) == {
            "ticker",
            "article_id",
            "title",
            "publisher",
            "link",
            "published_at",
        }
        assert row["ticker"] == "NVDA"

    def test_empty(self):
        assert articles_to_rows([]) == []
