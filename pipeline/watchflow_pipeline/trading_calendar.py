"""A self-contained NYSE trading calendar.

Why not a library: the pipeline needs exactly one thing from a market calendar —
"should there have been a bar on this date?" — so it can tell a *weekend* (not a
gap, expected, silent) from a *missing trading day* (a real gap worth flagging in
the run log). Pulling in `pandas_market_calendars` for that would add a
dependency, and the NYSE rules are short and fully deterministic.

Scope and limits, stated plainly:
  * Regular annual holidays and their weekend-observance rules are handled.
  * Ad-hoc closures are not derivable from rules (hurricanes, national days of
    mourning, 9/11). Known ones since 2000 are listed explicitly in
    ``AD_HOC_CLOSURES``; a future one would show up as a flagged gap in the run
    log, which is the correct failure mode — visible, not silent.
  * Half-days (day after Thanksgiving, Christmas Eve) still produce a bar, so
    they need no special handling here.
"""

from __future__ import annotations

from datetime import date, timedelta

#: Unscheduled full-day closures. A flagged gap on one of these is expected.
AD_HOC_CLOSURES: frozenset[date] = frozenset(
    {
        date(2001, 9, 11),
        date(2001, 9, 12),
        date(2001, 9, 13),
        date(2001, 9, 14),
        date(2004, 6, 11),  # Reagan national day of mourning
        date(2007, 1, 2),  # Ford national day of mourning
        date(2012, 10, 29),  # Hurricane Sandy
        date(2012, 10, 30),
        date(2018, 12, 5),  # G. H. W. Bush national day of mourning
        date(2025, 1, 9),  # Carter national day of mourning
    }
)


def easter_sunday(year: int) -> date:
    """Gregorian Easter, via the anonymous computus."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    lam = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * lam) // 451
    month, day = divmod(h + lam - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """The nth ``weekday`` (Mon=0) of a month."""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    """The last ``weekday`` (Mon=0) of a month."""
    next_month = date(year + (month == 12), (month % 12) + 1, 1)
    last = next_month - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(day: date) -> date | None:
    """Apply the weekend-observance rule to a fixed-date holiday.

    Saturday shifts back to Friday, Sunday forward to Monday. Returns ``None``
    when the holiday produces no closure at all — see the New Year's Day case
    in :func:`nyse_holidays`.
    """
    if day.weekday() == 5:
        return day - timedelta(days=1)
    if day.weekday() == 6:
        return day + timedelta(days=1)
    return day


def nyse_holidays(year: int) -> frozenset[date]:
    """Full-day NYSE closures for a calendar year."""
    holidays: set[date] = set()

    # New Year's Day. The NYSE does *not* close the preceding Friday when 1 Jan
    # falls on a Saturday — 31 Dec stays a normal session. This is the one
    # fixed-date holiday that breaks the usual observance rule.
    new_year = date(year, 1, 1)
    if new_year.weekday() != 5:
        observed = _observed(new_year)
        if observed is not None:
            holidays.add(observed)

    holidays.add(_nth_weekday(year, 1, 0, 3))  # MLK Jr Day (from 1998)
    holidays.add(_nth_weekday(year, 2, 0, 3))  # Washington's Birthday
    holidays.add(easter_sunday(year) - timedelta(days=2))  # Good Friday
    holidays.add(_last_weekday(year, 5, 0))  # Memorial Day

    if year >= 2022:  # Juneteenth became a market holiday in 2022.
        juneteenth = _observed(date(year, 6, 19))
        if juneteenth is not None:
            holidays.add(juneteenth)

    independence = _observed(date(year, 7, 4))
    if independence is not None:
        holidays.add(independence)

    holidays.add(_nth_weekday(year, 9, 0, 1))  # Labor Day
    holidays.add(_nth_weekday(year, 11, 3, 4))  # Thanksgiving

    christmas = _observed(date(year, 12, 25))
    if christmas is not None:
        holidays.add(christmas)

    # An observance can spill across a year boundary (1 Jan on a Sunday is
    # observed on 2 Jan; 25 Dec on a Saturday on 24 Dec). Keep only this year's.
    return frozenset(day for day in holidays if day.year == year)


def is_trading_day(day: date) -> bool:
    """True when the NYSE holds a regular session on ``day``."""
    if day.weekday() >= 5:
        return False
    if day in AD_HOC_CLOSURES:
        return False
    return day not in nyse_holidays(day.year)


def trading_days(start: date, end: date) -> list[date]:
    """Every NYSE session in ``[start, end]`` inclusive."""
    if end < start:
        return []

    # Cache per year so a 400-day backfill computes each year's holidays once
    # rather than once per candidate date.
    holidays: dict[int, frozenset[date]] = {}
    days: list[date] = []
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in AD_HOC_CLOSURES:
            year_holidays = holidays.get(current.year)
            if year_holidays is None:
                year_holidays = nyse_holidays(current.year)
                holidays[current.year] = year_holidays
            if current not in year_holidays:
                days.append(current)
        current += timedelta(days=1)
    return days


def missing_trading_days(present: set[date], start: date, end: date) -> list[date]:
    """Trading days in the window with no corresponding bar.

    This is the gap-detection primitive: weekends and holidays never appear in
    the result, so anything returned is a genuinely unexpected hole worth
    flagging rather than routine market closure.
    """
    return [day for day in trading_days(start, end) if day not in present]
