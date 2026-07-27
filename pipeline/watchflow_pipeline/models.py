"""Pydantic schemas every row must satisfy before it can reach Postgres.

The contract is: a row that fails validation is *rejected and logged*, never
silently dropped and never allowed to crash the run. A single malformed bar for
one ticker must not cost us the other nineteen tickers' data.
"""

from __future__ import annotations

from datetime import date as Date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

#: prices.* columns are numeric(18, 6); quantising here means the value we
#: validate is byte-identical to the value Postgres stores, so a re-run's
#: ON CONFLICT UPDATE writes the same bytes rather than churning the row.
PRICE_QUANTUM = Decimal("0.000001")

PositivePrice = Annotated[Decimal, Field(gt=Decimal("0"))]


class RawBar(BaseModel):
    """One validated daily OHLCV bar."""

    model_config = ConfigDict(frozen=True)

    ticker: str = Field(min_length=1, max_length=16)
    date: Date
    open: PositivePrice
    high: PositivePrice
    low: PositivePrice
    close: PositivePrice
    volume: int = Field(ge=0)

    @field_validator("ticker")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("open", "high", "low", "close")
    @classmethod
    def _quantise(cls, value: Decimal) -> Decimal:
        if not value.is_finite():
            raise ValueError("price must be finite")
        return value.quantize(PRICE_QUANTUM)

    @model_validator(mode="after")
    def _ohlc_consistency(self) -> "RawBar":
        """Reject bars that are internally impossible.

        Yahoo occasionally serves a partially-formed bar for the current
        session, where `high`/`low` have not yet caught up with `open`/`close`.
        Those are genuinely malformed rather than merely surprising, and loading
        them would put an impossible candle in the chart.
        """
        if self.high < self.low:
            raise ValueError(f"high {self.high} is below low {self.low}")
        if self.high < max(self.open, self.close):
            raise ValueError(
                f"high {self.high} is below open/close max {max(self.open, self.close)}"
            )
        if self.low > min(self.open, self.close):
            raise ValueError(
                f"low {self.low} is above open/close min {min(self.open, self.close)}"
            )
        return self


class MetricRow(BaseModel):
    """Derived analytics for one ticker/date.

    Every metric is nullable on purpose: a ticker's first bar has no previous
    close, and the moving averages/volatility need a full window before they
    mean anything. Emitting `None` is honest; emitting a 3-day "20-day average"
    would not be.
    """

    model_config = ConfigDict(frozen=True)

    ticker: str = Field(min_length=1, max_length=16)
    date: Date
    daily_return: float | None = None
    ma_20: Decimal | None = None
    ma_50: Decimal | None = None
    volatility_30d: float | None = None


class Rejection(BaseModel):
    """A row that failed validation, kept for the run log."""

    ticker: str
    date: str
    reason: str

    def __str__(self) -> str:  # pragma: no cover - formatting only
        return f"{self.ticker} {self.date}: {self.reason}"
