import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Schema notes
 * ------------
 * This file is the single source of truth for DDL. The Python pipeline performs
 * DML only (SELECT / INSERT ... ON CONFLICT) against these tables via SQLAlchemy
 * Core and never issues DDL of its own. Run `npm run db:migrate` before the
 * first pipeline execution.
 *
 * Raw ingestion (`prices`) is kept in a separate table from the analytics layer
 * (`metrics`). Rationale: the load step must be able to re-run and repair raw
 * OHLCV independently of how metrics are defined. Metric definitions change
 * (add RSI, change the volatility window); when they do we recompute `metrics`
 * from `prices` without re-hitting Yahoo Finance. Merging them into one row
 * would couple a stable, expensive-to-fetch fact table to a cheap, volatile
 * derived one.
 *
 * Money columns use `numeric` rather than `double precision` so repeated
 * upserts are byte-stable and comparisons in SQL are exact.
 */

export const pipelineStatus = pgEnum("pipeline_status", [
  "running",
  "success",
  "partial_failure",
  "failed",
]);

export const watchlists = pgTable(
  "watchlists",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Guarantees exactly one row can ever hold the default watchlist name, so the
  // v1 "single implicit user" model cannot drift into several stray watchlists
  // if the seed script is run twice.
  (t) => [uniqueIndex("watchlists_name_key").on(t.name)],
);

export const watchlistTickers = pgTable(
  "watchlist_tickers",
  {
    watchlistId: integer("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    ticker: varchar("ticker", { length: 16 }).notNull(),
    /**
     * Company name as resolved from Yahoo's search endpoint when the ticker was
     * added. Nullable on purpose: that lookup is best-effort (see `lib/yahoo.ts`)
     * and rows seeded before this column existed have nothing to backfill from.
     * `lib/companies.ts` covers the gap at render time, so a null here degrades
     * to a local name rather than to a bare symbol.
     */
    name: varchar("name", { length: 128 }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.watchlistId, t.ticker] }),
    index("watchlist_tickers_ticker_idx").on(t.ticker),
  ],
);

export const prices = pgTable(
  "prices",
  {
    ticker: varchar("ticker", { length: 16 }).notNull(),
    date: date("date").notNull(),
    open: numeric("open", { precision: 18, scale: 6 }).notNull(),
    high: numeric("high", { precision: 18, scale: 6 }).notNull(),
    low: numeric("low", { precision: 18, scale: 6 }).notNull(),
    close: numeric("close", { precision: 18, scale: 6 }).notNull(),
    volume: bigint("volume", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ticker, t.date] }),
    // Serves the "latest N days for one ticker" read path used by every chart.
    index("prices_ticker_date_desc_idx").on(t.ticker, t.date.desc()),
  ],
);

export const metrics = pgTable(
  "metrics",
  {
    ticker: varchar("ticker", { length: 16 }).notNull(),
    date: date("date").notNull(),
    /** Simple close-to-close return, expressed in percent (1.25 === +1.25%). */
    dailyReturn: numeric("daily_return", { precision: 12, scale: 6 }),
    ma20: numeric("ma_20", { precision: 18, scale: 6 }),
    ma50: numeric("ma_50", { precision: 18, scale: 6 }),
    /** Annualised stddev of the trailing 30 daily returns, in percent. */
    volatility30d: numeric("volatility_30d", { precision: 12, scale: 6 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ticker, t.date] }),
    index("metrics_ticker_date_desc_idx").on(t.ticker, t.date.desc()),
  ],
);

/**
 * Headlines scraped alongside the price fetch, used to give a session's move
 * some context the OHLCV cannot carry on its own.
 *
 * Stored per ticker rather than globally: the same article routinely mentions
 * several symbols, and the thing every read path wants is "headlines for TICKER
 * around DATE". A shared article table plus a join table would normalise the
 * title at the cost of making that one query a three-way join, for a corpus
 * measured in hundreds of rows.
 *
 * `article_id` is a hash of the canonical URL rather than the publisher's own
 * id, because Yahoo has changed the shape of that field between yfinance
 * releases and a URL is the one identifier that has stayed stable. That makes
 * re-fetching the same headline an idempotent upsert instead of a duplicate.
 */
export const news = pgTable(
  "news",
  {
    ticker: varchar("ticker", { length: 16 }).notNull(),
    articleId: varchar("article_id", { length: 64 }).notNull(),
    title: text("title").notNull(),
    publisher: varchar("publisher", { length: 128 }),
    link: text("link").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ticker, t.articleId] }),
    // Serves "headlines for this ticker in this window", the only read path.
    index("news_ticker_published_desc_idx").on(t.ticker, t.publishedAt.desc()),
  ],
);

/**
 * One forecast per ticker per future session, written *before* the outcome is
 * known and scored afterwards.
 *
 * The scoring columns are the reason this is a table rather than a derived
 * value computed at render time. A forecast recomputed on page load from
 * today's data is unfalsifiable — it would always look reasonable, because it
 * would always have been fitted to what already happened. Persisting the
 * prediction at the moment it was made, then filling in `actual_close` when the
 * real bar lands, is what lets the UI show a hit rate that means something.
 *
 * `(ticker, target_date)` as the primary key makes re-running the pipeline on
 * the same day idempotent: it revises the standing forecast for the next
 * session rather than accumulating one row per run.
 */
export const predictions = pgTable(
  "predictions",
  {
    ticker: varchar("ticker", { length: 16 }).notNull(),
    /** The future session this forecast is for — the next NYSE trading day. */
    targetDate: date("target_date").notNull(),
    /** Last settled session the forecast was computed from. */
    basisDate: date("basis_date").notNull(),
    basisClose: numeric("basis_close", { precision: 18, scale: 6 }).notNull(),
    central: numeric("central", { precision: 18, scale: 6 }).notNull(),
    /** Lower/upper bound of the one-sigma (~68%) band. */
    low: numeric("low", { precision: 18, scale: 6 }).notNull(),
    high: numeric("high", { precision: 18, scale: 6 }).notNull(),
    /** One-session stddev of log returns, in percent. */
    sigmaPct: numeric("sigma_pct", { precision: 12, scale: 6 }).notNull(),
    /** Damped drift applied to the central estimate, in percent. */
    driftPct: numeric("drift_pct", { precision: 12, scale: 6 }).notNull(),
    /** Trailing sessions the sigma was estimated from. */
    sampleSize: integer("sample_size").notNull(),

    // --- Filled in by a later run, once the target session has settled. ---
    actualClose: numeric("actual_close", { precision: 18, scale: 6 }),
    /** Realised move from `basis_close` to `actual_close`, in percent. */
    actualReturnPct: numeric("actual_return_pct", { precision: 12, scale: 6 }),
    /** Whether the realised close fell inside [low, high]. */
    withinBand: boolean("within_band"),
    /** Signed miss of the central estimate, in percent of `central`. */
    errorPct: numeric("error_pct", { precision: 12, scale: 6 }),
    scoredAt: timestamp("scored_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ticker, t.targetDate] }),
    index("predictions_ticker_target_desc_idx").on(t.ticker, t.targetDate.desc()),
  ],
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: serial("id").primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    tickersProcessed: integer("tickers_processed").notNull().default(0),
    rowsUpserted: integer("rows_upserted").notNull().default(0),
    rowsRejected: integer("rows_rejected").notNull().default(0),
    status: pipelineStatus("status").notNull().default("running"),
    errorSummary: text("error_summary"),
    /** Free-form per-ticker detail: gaps flagged, retries, rejection reasons. */
    details: text("details"),
    trigger: varchar("trigger", { length: 32 }).notNull().default("manual"),
  },
  (t) => [index("pipeline_runs_started_at_idx").on(t.startedAt.desc())],
);

export const watchlistsRelations = relations(watchlists, ({ many }) => ({
  tickers: many(watchlistTickers),
}));

export const watchlistTickersRelations = relations(watchlistTickers, ({ one }) => ({
  watchlist: one(watchlists, {
    fields: [watchlistTickers.watchlistId],
    references: [watchlists.id],
  }),
}));

export const DEFAULT_WATCHLIST_NAME = "My Watchlist";

export type Price = typeof prices.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type NewsItem = typeof news.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type WatchlistTicker = typeof watchlistTickers.$inferSelect;
