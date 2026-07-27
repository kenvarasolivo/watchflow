/**
 * Ticker symbols accepted by Yahoo Finance: letters, digits, and the separators
 * used for classes, exchanges and indices (BRK-B, RY.TO, ^GSPC, BTC-USD).
 */
const TICKER_PATTERN = /^[A-Z0-9]{1,10}([.\-^=][A-Z0-9]{1,10})*$/;

export type TickerNormalisation =
  | { ok: true; ticker: string }
  | { ok: false; error: string };

export function normaliseTicker(raw: unknown): TickerNormalisation {
  if (typeof raw !== "string") {
    return { ok: false, error: "Ticker must be a string." };
  }

  const ticker = raw.trim().toUpperCase();

  if (ticker.length === 0) {
    return { ok: false, error: "Ticker cannot be empty." };
  }
  if (ticker.length > 16) {
    return { ok: false, error: "Ticker cannot be longer than 16 characters." };
  }
  if (!TICKER_PATTERN.test(ticker)) {
    return {
      ok: false,
      error: `"${ticker}" is not a valid symbol format. Use letters, digits, and . - ^ separators (e.g. AAPL, BRK-B, ^GSPC).`,
    };
  }

  return { ok: true, ticker };
}
