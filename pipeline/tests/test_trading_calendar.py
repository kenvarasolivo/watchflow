from datetime import date

from watchflow_pipeline.trading_calendar import (
    easter_sunday,
    is_trading_day,
    missing_trading_days,
    nyse_holidays,
    trading_days,
)


class TestEaster:
    def test_known_dates(self):
        # Cross-checked against published Gregorian Easter tables.
        assert easter_sunday(2024) == date(2024, 3, 31)
        assert easter_sunday(2025) == date(2025, 4, 20)
        assert easter_sunday(2026) == date(2026, 4, 5)
        assert easter_sunday(2027) == date(2027, 3, 28)


class TestHolidays:
    def test_2025_holiday_set(self):
        holidays = nyse_holidays(2025)
        assert holidays == {
            date(2025, 1, 1),  # New Year's Day
            date(2025, 1, 20),  # MLK Jr Day
            date(2025, 2, 17),  # Washington's Birthday
            date(2025, 4, 18),  # Good Friday
            date(2025, 5, 26),  # Memorial Day
            date(2025, 6, 19),  # Juneteenth
            date(2025, 7, 4),  # Independence Day
            date(2025, 9, 1),  # Labor Day
            date(2025, 11, 27),  # Thanksgiving
            date(2025, 12, 25),  # Christmas
        }

    def test_2026_holiday_set(self):
        holidays = nyse_holidays(2026)
        assert date(2026, 1, 1) in holidays
        assert date(2026, 4, 3) in holidays  # Good Friday
        assert date(2026, 7, 3) in holidays  # 4 Jul is a Saturday → Friday
        assert date(2026, 6, 19) in holidays  # Juneteenth, a Friday
        assert date(2026, 11, 26) in holidays  # Thanksgiving
        assert date(2026, 12, 25) in holidays

    def test_juneteenth_only_from_2022(self):
        assert date(2021, 6, 18) not in nyse_holidays(2021)
        assert date(2021, 6, 19) not in nyse_holidays(2021)
        assert date(2022, 6, 20) in nyse_holidays(2022)  # 19 Jun 2022 was a Sunday

    def test_sunday_holiday_observed_on_monday(self):
        # Christmas 2022 fell on a Sunday; the NYSE closed Monday 26 December.
        assert date(2022, 12, 26) in nyse_holidays(2022)
        assert not is_trading_day(date(2022, 12, 26))

    def test_saturday_holiday_observed_on_friday(self):
        # Independence Day 2020 fell on a Saturday; observed Friday 3 July.
        assert date(2020, 7, 3) in nyse_holidays(2020)

    def test_new_years_day_on_saturday_is_not_observed(self):
        """The one fixed holiday that breaks the usual weekend rule.

        When 1 January falls on a Saturday the NYSE does *not* close the
        preceding Friday — 31 December stays a full trading session.
        """
        assert date(2022, 1, 1).weekday() == 5
        assert date(2021, 12, 31) not in nyse_holidays(2021)
        assert is_trading_day(date(2021, 12, 31))
        assert date(2022, 1, 1) not in nyse_holidays(2022)


class TestTradingDays:
    def test_weekends_excluded(self):
        # 4 Jul 2026 is a Saturday, observed on Friday the 3rd.
        days = trading_days(date(2026, 6, 29), date(2026, 7, 5))
        assert days == [
            date(2026, 6, 29),
            date(2026, 6, 30),
            date(2026, 7, 1),
            date(2026, 7, 2),
        ]

    def test_reversed_range_is_empty(self):
        assert trading_days(date(2026, 7, 10), date(2026, 7, 1)) == []

    def test_single_day(self):
        assert trading_days(date(2026, 7, 27), date(2026, 7, 27)) == [date(2026, 7, 27)]

    def test_ad_hoc_closure_excluded(self):
        assert not is_trading_day(date(2012, 10, 29))  # Hurricane Sandy
        assert date(2012, 10, 29) not in trading_days(date(2012, 10, 26), date(2012, 11, 2))


class TestMissingTradingDays:
    def test_weekend_hole_is_not_a_gap(self):
        present = {date(2026, 7, 17), date(2026, 7, 20)}  # Friday then Monday
        assert missing_trading_days(present, date(2026, 7, 17), date(2026, 7, 20)) == []

    def test_holiday_hole_is_not_a_gap(self):
        # 3 Jul 2026 is the observed Independence Day.
        present = {date(2026, 7, 2), date(2026, 7, 6)}
        assert missing_trading_days(present, date(2026, 7, 2), date(2026, 7, 6)) == []

    def test_missing_weekday_is_a_gap(self):
        present = {date(2026, 7, 20), date(2026, 7, 22)}  # Tuesday absent
        assert missing_trading_days(present, date(2026, 7, 20), date(2026, 7, 22)) == [
            date(2026, 7, 21)
        ]
