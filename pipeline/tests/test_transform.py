import math
import statistics
from datetime import date, timedelta
from decimal import Decimal

from watchflow_pipeline.transform import (
    TRADING_DAYS_PER_YEAR,
    compute_metrics,
    detect_gaps,
    validate_bars,
)


def raw(ticker="AAPL", day=date(2026, 7, 24), close="100.00", **overrides):
    payload = {
        "ticker": ticker,
        "date": day,
        "open": close,
        "high": close,
        "low": close,
        "close": close,
        "volume": 1_000_000,
    }
    payload.update(overrides)
    return payload


def closes_series(values, start=date(2026, 1, 5)):
    """Consecutive weekday closes, oldest first."""
    series = []
    current = start
    for value in values:
        while current.weekday() >= 5:
            current += timedelta(days=1)
        series.append((current, Decimal(str(value))))
        current += timedelta(days=1)
    return series


class TestValidateBars:
    def test_splits_valid_from_invalid(self):
        rows = [
            raw(day=date(2026, 7, 22)),
            # A half-formed bar: the high never caught up with the close.
            raw(
                day=date(2026, 7, 23),
                open="98.50",
                high="99.00",
                low="98.00",
                close="100.00",
            ),
            raw(day=date(2026, 7, 24)),
        ]
        bars, rejections = validate_bars(rows)

        assert [bar.date for bar in bars] == [date(2026, 7, 22), date(2026, 7, 24)]
        assert len(rejections) == 1
        assert rejections[0].ticker == "AAPL"
        assert rejections[0].date == "2026-07-23"
        assert "below open/close max" in rejections[0].reason

    def test_one_bad_row_does_not_lose_the_others(self):
        """The core contract: reject and log, never crash or drop silently."""
        rows = [raw(day=date(2026, 7, 20), close="abc")] + [
            raw(day=date(2026, 7, 21) + timedelta(days=i)) for i in range(3)
        ]
        bars, rejections = validate_bars(rows)
        assert len(bars) == 3
        assert len(rejections) == 1

    def test_duplicate_dates_keep_the_last_seen(self):
        """The overlap refetch legitimately returns a date twice.

        The later copy is the more recently revised one, so it wins.
        """
        rows = [
            raw(day=date(2026, 7, 24), close="100.00"),
            raw(day=date(2026, 7, 24), close="101.50"),
        ]
        bars, rejections = validate_bars(rows)
        assert len(bars) == 1
        assert bars[0].close == Decimal("101.500000")
        assert rejections == []

    def test_output_is_sorted(self):
        rows = [raw(day=date(2026, 7, 24)), raw(day=date(2026, 7, 20))]
        bars, _ = validate_bars(rows)
        assert [bar.date for bar in bars] == [date(2026, 7, 20), date(2026, 7, 24)]

    def test_empty_input(self):
        assert validate_bars([]) == ([], [])


class TestDetectGaps:
    def test_no_gap_across_a_weekend(self):
        bars, _ = validate_bars(
            [raw(day=date(2026, 7, 17)), raw(day=date(2026, 7, 20))]
        )
        assert detect_gaps("AAPL", bars) == []

    def test_missing_weekday_is_flagged(self):
        bars, _ = validate_bars(
            [raw(day=date(2026, 7, 20)), raw(day=date(2026, 7, 22))]
        )
        assert detect_gaps("AAPL", bars) == [date(2026, 7, 21)]

    def test_range_is_bounded_by_the_tickers_own_data(self):
        """A recent listing has no history before its first bar, not a gap."""
        bars, _ = validate_bars(
            [raw(day=date(2026, 7, 22)), raw(day=date(2026, 7, 23))]
        )
        assert detect_gaps("AAPL", bars) == []

    def test_single_bar_cannot_have_gaps(self):
        bars, _ = validate_bars([raw(day=date(2026, 7, 22))])
        assert detect_gaps("AAPL", bars) == []

    def test_result_is_capped(self):
        # A whole month present only at its endpoints.
        bars, _ = validate_bars(
            [raw(day=date(2026, 3, 2)), raw(day=date(2026, 4, 30))]
        )
        assert len(detect_gaps("AAPL", bars, limit=5)) == 5


class TestDailyReturn:
    def test_first_bar_has_no_return(self):
        rows = compute_metrics("AAPL", closes_series([100]))
        assert rows[0].daily_return is None

    def test_simple_close_to_close(self):
        rows = compute_metrics("AAPL", closes_series([100, 110, 99]))
        assert rows[1].daily_return == 10.0
        assert rows[2].daily_return == -10.0

    def test_expressed_in_percent_not_fraction(self):
        rows = compute_metrics("AAPL", closes_series([100, 101]))
        assert rows[1].daily_return == 1.0


class TestMovingAverages:
    def test_ma20_is_none_until_the_window_fills(self):
        rows = compute_metrics("AAPL", closes_series(list(range(1, 21))))
        assert all(row.ma_20 is None for row in rows[:19])
        assert rows[19].ma_20 is not None

    def test_ma20_value(self):
        rows = compute_metrics("AAPL", closes_series([10.0] * 20))
        assert rows[19].ma_20 == Decimal("10.000000")

    def test_ma20_is_a_trailing_window(self):
        values = [float(v) for v in range(1, 21)]  # 1..20
        rows = compute_metrics("AAPL", closes_series(values))
        assert rows[19].ma_20 == Decimal(f"{statistics.mean(values):.6f}")

    def test_ma50_needs_fifty_bars(self):
        rows = compute_metrics("AAPL", closes_series([5.0] * 50))
        assert rows[48].ma_50 is None
        assert rows[49].ma_50 == Decimal("5.000000")

    def test_ma50_tracks_only_the_last_fifty(self):
        values = [1.0] * 50 + [100.0] * 50
        rows = compute_metrics("AAPL", closes_series(values))
        assert rows[99].ma_50 == Decimal("100.000000")


class TestVolatility:
    def test_none_until_thirty_returns_exist(self):
        """Needs 30 *returns*, and the first bar has none — so 31 closes."""
        rows = compute_metrics("AAPL", closes_series([100.0] * 30))
        assert all(row.volatility_30d is None for row in rows)

        rows = compute_metrics("AAPL", closes_series([100.0] * 31))
        assert rows[30].volatility_30d is not None

    def test_flat_series_has_zero_volatility(self):
        rows = compute_metrics("AAPL", closes_series([100.0] * 31))
        assert rows[30].volatility_30d == 0.0

    def test_matches_annualised_sample_stddev(self):
        values = [100.0]
        for index in range(40):
            values.append(values[-1] * (1.01 if index % 2 == 0 else 0.995))

        rows = compute_metrics("AAPL", closes_series(values))
        target = rows[35]

        returns = []
        for index in range(1, len(values)):
            returns.append((values[index] / values[index - 1] - 1) * 100)
        window = returns[35 - 30 : 35]  # the 30 returns ending at index 35
        expected = statistics.stdev(window) * math.sqrt(TRADING_DAYS_PER_YEAR)

        assert target.volatility_30d is not None
        assert abs(target.volatility_30d - expected) < 1e-6


class TestWarmup:
    def test_emit_from_limits_output_but_not_the_calculation(self):
        """The point of the warm-up window.

        An incremental run emits metrics only for its new bars, yet those bars
        still get a correct MA-20 because the prior closes were read back from
        the database as context.
        """
        series = closes_series([float(v) for v in range(1, 26)])
        cutoff = series[-3][0]

        rows = compute_metrics("AAPL", series, emit_from=cutoff)

        assert [row.date for row in rows] == [item[0] for item in series[-3:]]
        # Would be None if the calculation had started at `cutoff`.
        assert all(row.ma_20 is not None for row in rows)
        assert rows[-1].ma_20 == Decimal(f"{statistics.mean(range(6, 26)):.6f}")

    def test_unordered_input_is_sorted_first(self):
        series = closes_series([100.0, 110.0, 121.0])
        rows = compute_metrics("AAPL", list(reversed(series)))
        assert [row.date for row in rows] == [item[0] for item in series]
        assert rows[1].daily_return == 10.0

    def test_empty_input(self):
        assert compute_metrics("AAPL", []) == []

    def test_zero_previous_close_does_not_divide_by_zero(self):
        # Guarded rather than crashing; a zero close never passes validation,
        # but compute_metrics also reads historical rows straight from the DB.
        rows = compute_metrics("AAPL", closes_series([0.0, 50.0]))
        assert rows[1].daily_return is None
