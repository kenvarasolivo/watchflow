import math
import statistics
from datetime import date, timedelta
from decimal import Decimal

import pytest

from watchflow_pipeline.forecast import (
    DRIFT_CAP_SIGMAS,
    FORECAST_WINDOW,
    MIN_SAMPLE,
    build_forecast,
    forecasts_to_rows,
    next_session,
    next_trading_day,
    trades_every_day,
)


def closes_series(values, start=date(2026, 1, 5)):
    """Consecutive weekday closes, oldest first."""
    series = []
    current = start
    for value in values:
        while current.weekday() >= 5:
            current += timedelta(days=1)
        series.append((current, Decimal(f"{value:.6f}")))
        current += timedelta(days=1)
    return series


def daily_series(values, start=date(2026, 1, 5)):
    """Every calendar day, weekends included — how a crypto pair prints."""
    return [
        (start + timedelta(days=index), Decimal(f"{value:.6f}"))
        for index, value in enumerate(values)
    ]


def trending(count, step, wobble=0.004, start=100.0):
    """A trend of ``step`` per session with a small alternating wobble on top.

    The wobble is not decoration. A perfectly constant log return has zero
    measured volatility, which is a degenerate case the forecaster refuses on
    purpose — so a fixture without it would test the refusal path rather than
    the trend behaviour it is named for.
    """
    values = []
    price = start
    for index in range(count):
        values.append(price * math.exp(wobble if index % 2 == 0 else -wobble))
        price *= math.exp(step)
    return values


def alternating(count, amplitude, start=100.0):
    """A zero-drift series that oscillates by ±``amplitude`` in log terms."""
    values = []
    price = start
    for index in range(count):
        values.append(price)
        price *= math.exp(amplitude if index % 2 == 0 else -amplitude)
    return values


class TestNextTradingDay:
    def test_weekday_rolls_to_the_following_day(self):
        # Tuesday 2026-08-04 → Wednesday.
        assert next_trading_day(date(2026, 8, 4)) == date(2026, 8, 5)

    def test_friday_rolls_across_the_weekend(self):
        # Friday 2026-08-07 → Monday, not Saturday.
        assert next_trading_day(date(2026, 8, 7)) == date(2026, 8, 10)

    def test_holiday_is_skipped(self):
        # 2026-07-03 is the observed Independence Day closure (4 July is a
        # Saturday), so Thursday 2 July forecasts Monday 6 July.
        assert next_trading_day(date(2026, 7, 2)) == date(2026, 7, 6)

    def test_result_is_always_after_the_input(self):
        day = date(2026, 1, 1)
        for _ in range(400):
            assert next_trading_day(day) > day
            day += timedelta(days=1)


class TestSevenDayInstruments:
    """A crypto pair must not be handed the NYSE calendar.

    A Friday bar targeting Monday would have its one-session band graded
    against three days of movement, which drags the hit rate down on exactly
    the symbols where nothing is wrong with the model.
    """

    def test_weekday_only_history_is_not_seven_day(self):
        dates = [day for day, _ in closes_series([100.0] * 40)]
        assert trades_every_day(dates) is False

    def test_weekend_bars_mark_a_seven_day_instrument(self):
        dates = [day for day, _ in daily_series([100.0] * 40)]
        assert trades_every_day(dates) is True

    def test_next_session_uses_the_calendar_for_equities(self):
        weekdays = [day for day, _ in closes_series([100.0] * 40)]
        # Friday 2026-08-07 → Monday.
        assert next_session(date(2026, 8, 7), weekdays) == date(2026, 8, 10)

    def test_next_session_is_tomorrow_for_seven_day_instruments(self):
        every_day = [day for day, _ in daily_series([100.0] * 40)]
        assert next_session(date(2026, 8, 7), every_day) == date(2026, 8, 8)

    def test_crypto_forecast_targets_the_next_calendar_day(self):
        closes = daily_series(alternating(60, 0.02))
        forecast = build_forecast("BTC-USD", closes)

        assert forecast.target_date == closes[-1][0] + timedelta(days=1)

    def test_equity_forecast_still_skips_the_weekend(self):
        closes = closes_series(alternating(60, 0.01))
        forecast = build_forecast("AAPL", closes)

        assert forecast.target_date.weekday() < 5


class TestBuildForecast:
    def test_returns_none_below_the_minimum_sample(self):
        closes = closes_series(trending(MIN_SAMPLE, 0.001))
        assert build_forecast("AAPL", closes) is None

    def test_produces_a_forecast_at_the_minimum_sample(self):
        closes = closes_series(alternating(MIN_SAMPLE + 1, 0.01))
        forecast = build_forecast("AAPL", closes)
        assert forecast is not None
        assert forecast.sample_size == MIN_SAMPLE

    def test_band_is_ordered_and_straddles_the_basis(self):
        closes = closes_series(alternating(60, 0.012))
        forecast = build_forecast("AAPL", closes)

        assert forecast.low < forecast.central < forecast.high
        assert forecast.low < forecast.basis_close < forecast.high

    def test_basis_is_the_last_close(self):
        closes = closes_series(alternating(60, 0.01))
        forecast = build_forecast("AAPL", closes)

        assert forecast.basis_date == closes[-1][0]
        assert forecast.basis_close == closes[-1][1]
        assert forecast.target_date == next_trading_day(closes[-1][0])

    def test_sigma_pct_is_the_bands_own_half_width(self):
        """The reported sigma must be the same number as the band, not near it.

        Two nearly-equal volatilities on one card is a reconciliation the reader
        should never be asked to do, so this is asserted exactly rather than
        loosely.
        """
        closes = closes_series(alternating(60, 0.015))
        forecast = build_forecast("AAPL", closes)

        implied = (float(forecast.high) / float(forecast.central) - 1.0) * 100.0
        assert forecast.sigma_pct == pytest.approx(implied, abs=1e-4)

    def test_drift_pct_matches_the_central_estimate(self):
        closes = closes_series(trending(60, 0.004))
        forecast = build_forecast("AAPL", closes)

        implied = (float(forecast.central) / float(forecast.basis_close) - 1.0) * 100.0
        assert forecast.drift_pct == pytest.approx(implied, abs=1e-4)

    def test_only_the_trailing_window_is_used(self):
        """Ancient history must not widen today's band.

        A calm recent stretch preceded by a violent one should produce a narrow
        band; if the whole series fed the estimate, the old turbulence would
        keep the band inflated for months.
        """
        violent = alternating(80, 0.08)
        calm_start = violent[-1]
        calm = [
            calm_start * math.exp(0.002 if index % 2 == 0 else -0.002)
            for index in range(FORECAST_WINDOW + 5)
        ]
        closes = closes_series(violent + calm)

        forecast = build_forecast("AAPL", closes)
        assert forecast.sample_size == FORECAST_WINDOW
        # The calm stretch moves ~0.2% a session; anything near the violent 8%
        # would mean the window is not being applied.
        assert forecast.sigma_pct < 1.0

    def test_drift_is_capped_at_a_fraction_of_sigma(self):
        """A hard trend must not let the midpoint run away from the band.

        The raw mean of a steadily compounding series is the full step, which
        here is several times sigma. The cap is what stops the forecast from
        extrapolating a fortnight of momentum into the next session.
        """
        step = 0.02
        closes = closes_series(trending(60, step))
        forecast = build_forecast("AAPL", closes)

        drift_log = math.log(float(forecast.central) / float(forecast.basis_close))
        sigma_log = math.log(float(forecast.high) / float(forecast.central))

        assert drift_log == pytest.approx(DRIFT_CAP_SIGMAS * sigma_log, rel=1e-6)
        assert drift_log < step

    def test_drift_direction_follows_the_trend(self):
        rising = build_forecast("UP", closes_series(trending(60, 0.004)))
        falling = build_forecast("DOWN", closes_series(trending(60, -0.004)))

        assert rising.drift_pct > 0
        assert falling.drift_pct < 0

    def test_flat_series_produces_no_forecast(self):
        """A halted symbol has zero measured volatility.

        A zero-width band would be graded as a miss on any move at all, which
        would quietly poison the hit rate with a stock that is not trading.
        """
        closes = closes_series([100.0] * 60)
        assert build_forecast("HALT", closes) is None

    def test_near_flat_series_produces_no_forecast(self):
        """The guard has to be on the published width, not the raw sigma.

        A window of closes that differ only in the last decimal leaves a stdev
        that is floating-point residue — positive, so a `sigma > 0` check waves
        it through, but rounding to a 0.00% band on the way out and tripping the
        `> 0` constraint on the stored column. That crashed a whole ticker's
        load before the threshold moved to the rounded value.
        """
        closes = closes_series(alternating(60, 1e-9))
        assert build_forecast("PEGGED", closes) is None

    def test_sigma_tracks_the_realised_volatility(self):
        amplitude = 0.01
        closes = closes_series(alternating(60, amplitude))
        forecast = build_forecast("AAPL", closes)

        # A strictly alternating ±amplitude series has a sample stdev of
        # amplitude (up to the n-1 correction), so the band half-width should
        # land within a hair of exp(amplitude) - 1.
        expected = (math.exp(amplitude * math.sqrt(60 / 59)) - 1.0) * 100.0
        assert forecast.sigma_pct == pytest.approx(expected, rel=0.05)

    def test_unordered_input_is_sorted(self):
        closes = closes_series(alternating(60, 0.01))
        shuffled = list(reversed(closes))

        assert build_forecast("AAPL", shuffled) == build_forecast("AAPL", closes)

    def test_empty_input(self):
        assert build_forecast("AAPL", []) is None


class TestForecastsToRows:
    def test_shapes_every_column_the_upsert_needs(self):
        forecast = build_forecast("AAPL", closes_series(alternating(60, 0.01)))
        [row] = forecasts_to_rows([forecast])

        assert set(row) == {
            "ticker",
            "target_date",
            "basis_date",
            "basis_close",
            "central",
            "low",
            "high",
            "sigma_pct",
            "drift_pct",
            "sample_size",
        }
        assert row["ticker"] == "AAPL"
        assert row["sample_size"] == FORECAST_WINDOW

    def test_empty(self):
        assert forecasts_to_rows([]) == []


class TestQuantisation:
    def test_prices_match_the_numeric_column_scale(self):
        """Six decimals, so a re-run rewrites identical bytes rather than churning."""
        forecast = build_forecast("AAPL", closes_series(alternating(60, 0.013)))

        for value in (forecast.basis_close, forecast.central, forecast.low, forecast.high):
            assert isinstance(value, Decimal)
            assert -value.as_tuple().exponent == 6

    def test_stdev_reference(self):
        """Guards the assumption the sigma test leans on."""
        returns = [0.01, -0.01] * 15
        assert statistics.stdev(returns) == pytest.approx(0.01 * math.sqrt(30 / 29))
