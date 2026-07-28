import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Seeds the default watchlist with a starter set of tickers.
 *
 * Safe to re-run: the watchlist insert conflicts on its unique name and every
 * ticker insert conflicts on the composite primary key, so a second run is a
 * no-op rather than a duplicate.
 *
 * The list is "what people actually watch": the mega-cap names, the retail
 * favourites that move on news, the index and asset-class ETFs people hold as a
 * baseline to compare the single names against, and Bitcoin. Thirty-six is a
 * deliberate ceiling rather than a round number — it is exactly three
 * `batch_size`-12 requests to Yahoo per run and roughly 14k price rows on the
 * first 400-day backfill, both of which stay well inside what the free Neon tier
 * and Yahoo's tolerance for a datacenter IP allow. Everything here also has a
 * name in `lib/companies.ts`, so the watchlist and the landing-page marquee
 * render real names from the first run rather than bare symbols.
 *
 * Two entries are here because they exercise paths a US-equity-only list never
 * would, and both are handled rather than merely tolerated:
 *
 *  - BTC-USD trades weekends, so batching it alongside stocks pads their weekend
 *    rows with NaN. `extract._rows_from_frame` drops those as batch padding
 *    instead of counting them as rejections, which is what keeps a crypto pair
 *    from painting every run `partial_failure`.
 *  - The UCITS lines (`.DE`, `.AS`) settle on the Frankfurt and Amsterdam
 *    calendars while `transform.detect_gaps` checks against NYSE, so they report
 *    false gaps on local-only holidays. Gaps are informational — they land in
 *    the run's notes, never in `errors` or `rows_rejected` — so the run still
 *    resolves `success`. Expect the occasional note; it is not a data problem.
 */
const STARTER_TICKERS = [
  // Mega caps
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "BRK-B",
  "LLY",
  // Tech & semis with a retail following
  "AMD",
  "INTC",
  "MU",
  "ORCL",
  "CRM",
  "NFLX",
  "PLTR",
  "UBER",
  "COIN",
  "BABA",
  // Financials, consumer, industrials, energy
  "JPM",
  "V",
  "WMT",
  "KO",
  "DIS",
  "BA",
  "XOM",
  // Index & asset-class ETFs
  "SPY",
  "QQQ",
  "VTI",
  "GLD",
  "TLT",
  // UCITS ETFs — the European wrappers a EUR-denominated broker actually sells
  "VWCE.DE",
  "SXR8.DE",
  "IWDA.AS",
  // Crypto
  "BTC-USD",
];

async function main() {
  // Imported lazily so dotenv has populated DATABASE_URL first.
  const { getDb } = await import("../src/db/index");
  const { DEFAULT_WATCHLIST_NAME, watchlistTickers, watchlists } = await import(
    "../src/db/schema"
  );
  const { eq } = await import("drizzle-orm");

  const db = getDb();

  await db
    .insert(watchlists)
    .values({ name: DEFAULT_WATCHLIST_NAME })
    .onConflictDoNothing({ target: watchlists.name });

  const [watchlist] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.name, DEFAULT_WATCHLIST_NAME))
    .limit(1);

  if (!watchlist) throw new Error("Could not create or find the default watchlist.");

  const inserted = await db
    .insert(watchlistTickers)
    .values(STARTER_TICKERS.map((ticker) => ({ watchlistId: watchlist.id, ticker })))
    .onConflictDoNothing()
    .returning({ ticker: watchlistTickers.ticker });

  console.log(
    `Watchlist #${watchlist.id} "${DEFAULT_WATCHLIST_NAME}" ready.\n` +
      `Added ${inserted.length} of ${STARTER_TICKERS.length} starter tickers ` +
      `(${inserted.length === 0 ? "all already present" : inserted.map((r) => r.ticker).join(", ")}).\n\n` +
      "Next: run the pipeline to load prices —\n" +
      "  cd pipeline && python -m watchflow_pipeline",
  );
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
