import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Seeds the default watchlist with a starter set of tickers.
 *
 * Safe to re-run: the watchlist insert conflicts on its unique name and every
 * ticker insert conflicts on the composite primary key, so a second run is a
 * no-op rather than a duplicate.
 */
const STARTER_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "SPY"];

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
