"""Logging configured for a CI runner: plain, timestamped, unbuffered."""

from __future__ import annotations

import logging
import sys


def configure_logging(verbose: bool = False) -> logging.Logger:
    root = logging.getLogger()
    root.setLevel(logging.DEBUG if verbose else logging.INFO)

    # Re-running configure_logging (tests, repeated invocations) must not stack
    # duplicate handlers onto the root logger.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)-7s %(name)-28s %(message)s",
            datefmt="%H:%M:%S",
        )
    )
    root.addHandler(handler)

    # yfinance is chatty at INFO and its progress output is meaningless in CI.
    logging.getLogger("yfinance").setLevel(logging.WARNING)
    logging.getLogger("peewee").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    return logging.getLogger("watchflow")
