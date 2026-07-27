/**
 * Lightweight symbol-existence check used by `POST /api/watchlist`.
 *
 * Why this is deliberately best-effort
 * ------------------------------------
 * This runs on Vercel — a datacenter IP — and hits the same Yahoo Finance edge
 * that blocks the pipeline (see README, "The TLS fingerprint problem"). From a
 * Node runtime we cannot impersonate a browser's TLS ClientHello the way
 * `curl_cffi` does in the Python pipeline, so this lookup *will* sometimes come
 * back 401/429/403 even for symbols that are perfectly real.
 *
 * Treating that as "invalid ticker" would be wrong: it would reject AAPL
 * because Yahoo rate-limited us. So the contract here is three-valued —
 * `valid` / `invalid` / `unknown` — and only a definitive negative from Yahoo
 * blocks the add. On `unknown` we accept the ticker and let the next pipeline
 * run be the real arbiter; if the symbol genuinely does not exist it simply
 * never receives price rows, and the UI shows it as awaiting data.
 */

export type SymbolCheck =
  | { status: "valid"; ticker: string; name: string | null; exchange: string | null }
  | { status: "invalid"; ticker: string; reason: string }
  | { status: "unknown"; ticker: string; reason: string };

const LOOKUP_TIMEOUT_MS = 4_000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function checkSymbol(ticker: string): Promise<SymbolCheck> {
  const url = new URL("https://query2.finance.yahoo.com/v1/finance/search");
  url.searchParams.set("q", ticker);
  url.searchParams.set("quotesCount", "10");
  url.searchParams.set("newsCount", "0");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    return { status: "unknown", ticker, reason: `Yahoo lookup failed: ${reason}` };
  }

  if (!response.ok) {
    return {
      status: "unknown",
      ticker,
      reason: `Yahoo lookup returned HTTP ${response.status}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "unknown", ticker, reason: "Yahoo returned a non-JSON response" };
  }

  const quotes = extractQuotes(payload);
  if (quotes === null) {
    return { status: "unknown", ticker, reason: "Unexpected Yahoo response shape" };
  }

  const match = quotes.find((q) => q.symbol?.toUpperCase() === ticker);
  if (match) {
    return {
      status: "valid",
      ticker,
      name: match.shortname ?? match.longname ?? null,
      exchange: match.exchDisp ?? match.exchange ?? null,
    };
  }

  // A well-formed response that lists other symbols but not this one is the
  // only case we treat as a definitive negative.
  return {
    status: "invalid",
    ticker,
    reason: `Yahoo Finance has no symbol "${ticker}".`,
  };
}

type YahooQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
};

function extractQuotes(payload: unknown): YahooQuote[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const quotes = (payload as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return null;
  return quotes.filter((q): q is YahooQuote => typeof q === "object" && q !== null);
}
