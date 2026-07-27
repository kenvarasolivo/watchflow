import {
  bigint,
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
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type WatchlistTicker = typeof watchlistTickers.$inferSelect;
