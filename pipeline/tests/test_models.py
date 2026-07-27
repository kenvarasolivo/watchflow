from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from watchflow_pipeline.models import RawBar


def bar(**overrides):
    payload = {
        "ticker": "aapl",
        "date": date(2026, 7, 24),
        "open": "191.20",
        "high": "194.05",
        "low": "190.85",
        "close": "193.40",
        "volume": 51_233_100,
    }
    payload.update(overrides)
    return payload


class TestRawBarAcceptance:
    def test_valid_bar(self):
        parsed = RawBar.model_validate(bar())
        assert parsed.ticker == "AAPL"
        assert parsed.close == Decimal("193.400000")
        assert parsed.volume == 51_233_100

    def test_prices_are_quantised_to_the_column_scale(self):
        """Values are stored to exactly numeric(18,6).

        Quantising at validation time means a re-run's ON CONFLICT UPDATE writes
        byte-identical values rather than churning the row on float noise.
        """
        parsed = RawBar.model_validate(bar(close=193.40000000001))
        assert parsed.close == Decimal("193.400000")
        assert parsed.close.as_tuple().exponent == -6

    def test_zero_volume_is_allowed(self):
        # Halted or extremely illiquid sessions genuinely print zero volume.
        assert RawBar.model_validate(bar(volume=0)).volume == 0

    def test_float_input_is_coerced(self):
        assert RawBar.model_validate(bar(open=191.2)).open == Decimal("191.200000")


class TestRawBarRejection:
    def test_missing_field(self):
        payload = bar()
        del payload["close"]
        with pytest.raises(ValidationError):
            RawBar.model_validate(payload)

    def test_nan_close(self):
        with pytest.raises(ValidationError):
            RawBar.model_validate(bar(close=float("nan")))

    def test_zero_price(self):
        with pytest.raises(ValidationError):
            RawBar.model_validate(bar(low=0))

    def test_negative_price(self):
        with pytest.raises(ValidationError):
            RawBar.model_validate(bar(open=-1))

    def test_negative_volume(self):
        with pytest.raises(ValidationError):
            RawBar.model_validate(bar(volume=-5))

    def test_high_below_low(self):
        with pytest.raises(ValidationError, match="below low"):
            RawBar.model_validate(bar(high="180.00", low="190.00"))

    def test_high_below_close(self):
        """A partially-formed intraday bar, which Yahoo occasionally serves."""
        with pytest.raises(ValidationError, match="below open/close max"):
            RawBar.model_validate(bar(high="192.00", close="193.40"))

    def test_low_above_open(self):
        with pytest.raises(ValidationError, match="above open/close min"):
            RawBar.model_validate(bar(low="192.00", open="191.20"))

    def test_unparseable_date(self):
        with pytest.raises(ValidationError):
            RawBar.model_validate(bar(date="not-a-date"))

    def test_ticker_too_long(self):
        with pytest.raises(ValidationError):
            RawBar.model_validate(bar(ticker="A" * 17))
