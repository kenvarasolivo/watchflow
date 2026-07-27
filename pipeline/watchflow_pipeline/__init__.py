"""Watchflow ETL pipeline.

Extracts daily OHLCV from Yahoo Finance, validates and enriches it, and loads it
idempotently into the same Neon Postgres the Next.js dashboard reads from.
"""

__version__ = "1.0.0"
