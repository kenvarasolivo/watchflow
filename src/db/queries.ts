import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "./index";
import {
  DEFAULT_WATCHLIST_NAME,
  pipelineRuns,
  watchlistTickers,
  watchlists,
} from "./schema";
import { type Range, rangeStartDate } from "@/lib/range";

/**
 * All read paths below cast `numeric` to `float8` in SQL. Postgres returns
 * `numeric` to the driver as a string to preserve precision; for charting we
 * want JS numbers, and doing the cast in the database is cheaper and less
 * error-prone than mapping every column by hand on the way out.
 *
 * `date` and `timestamptz` arrive as raw strings — the Drizzle neon-http driver
 * installs identity type parsers for them — so no timezone shifting happens
 * between Postgres and the browser.
 */

export type WatchlistRow = {
  ticker: string;
  addedAt: string;
  lastDate: string | null;
  close: number | null;
  dailyReturn: number | null;
  volatility30d: number | null;
  sparkline: number[];
};

export type SeriesPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dailyReturn: number | null;
  ma20: number | null;
  ma50: number | null;
  volatility30d: number | null;
};

export type PerformanceRow = {
  ticker: string;
  firstDate: string | null;
  lastDate: string | null;
  firstClose: number | null;
  lastClose: number | null;
  returnPct: number | null;
  volatility30d: number | null;
  observations: number;
};

export type PipelineStatus = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  tickersProcessed: number;
  rowsUpserted: number;
  rowsRejected: number;
  status: "running" | "success" | "partial_failure" | "failed";
  errorSummary: string | null;
  details: string | null;
  trigger: string;
};

/**
 * Resolves the v1 single implicit watchlist, creating it on first use. The
 * insert is `on conflict do nothing` against the unique name index, so
 * concurrent cold starts cannot race into two watchlists.
 */
export async function getDefaultWatchlistId(): Promise<number> {
  const db = getDb();

  const existing = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.name, DEFAULT_WATCHLIST_NAME))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  await db
    .insert(watchlists)
    .values({ name: DEFAULT_WATCHLIST_NAME })
    .onConflictDoNothing({ target: watchlists.name });

  const created = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(eq(watchlists.name, DEFAULT_WATCHLIST_NAME))
    .limit(1);

  if (created.length === 0) {
    throw new Error("Failed to create the default watchlist.");
  }
  return created[0].id;
}

export async function listTickers(): Promise<{ ticker: string; addedAt: string }[]> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const rows = await db
    .select({ ticker: watchlistTickers.ticker, addedAt: watchlistTickers.addedAt })
    .from(watchlistTickers)
    .where(eq(watchlistTickers.watchlistId, watchlistId))
    .orderBy(asc(watchlistTickers.ticker));

  return rows.map((r) => ({ ticker: r.ticker, addedAt: String(r.addedAt) }));
}

export async function addTicker(ticker: string): Promise<{ added: boolean }> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const inserted = await db
    .insert(watchlistTickers)
    .values({ watchlistId, ticker })
    .onConflictDoNothing()
    .returning({ ticker: watchlistTickers.ticker });

  return { added: inserted.length > 0 };
}

export async function removeTicker(ticker: string): Promise<{ removed: boolean }> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const deleted = await db
    .delete(watchlistTickers)
    .where(
      and(eq(watchlistTickers.watchlistId, watchlistId), eq(watchlistTickers.ticker, ticker)),
    )
    .returning({ ticker: watchlistTickers.ticker });

  return { removed: deleted.length > 0 };
}

export async function isOnWatchlist(ticker: string): Promise<boolean> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const rows = await db
    .select({ ticker: watchlistTickers.ticker })
    .from(watchlistTickers)
    .where(
      and(eq(watchlistTickers.watchlistId, watchlistId), eq(watchlistTickers.ticker, ticker)),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Watchlist overview: latest close plus a 30-point sparkline for every tracked
 * ticker, in a single round trip.
 *
 * `distinct on (ticker) ... order by ticker, date desc` is the Postgres idiom
 * for "latest row per group" and uses the `(ticker, date desc)` index directly.
 * The sparkline is built with `json_agg` rather than `array_agg` because a JSON
 * array of numbers survives the driver as a real `number[]`, whereas a Postgres
 * numeric array would arrive as a string needing manual parsing.
 */
export async function getWatchlistOverview(): Promise<WatchlistRow[]> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const result = await db.execute<{
    ticker: string;
    added_at: string;
    last_date: string | null;
    close: number | null;
    daily_return: number | null;
    volatility_30d: number | null;
    sparkline: number[] | null;
  }>(sql`
    with wl as (
      select ticker, added_at
      from watchlist_tickers
      where watchlist_id = ${watchlistId}
    ),
    latest as (
      select distinct on (p.ticker) p.ticker, p.date, p.close
      from prices p
      join wl on wl.ticker = p.ticker
      order by p.ticker, p.date desc
    ),
    recent as (
      select p.ticker, p.date, p.close,
             row_number() over (partition by p.ticker order by p.date desc) as rn
      from prices p
      join wl on wl.ticker = p.ticker
    ),
    spark as (
      select ticker, json_agg(close::float8 order by date asc) as sparkline
      from recent
      where rn <= 30
      group by ticker
    )
    select
      wl.ticker                       as ticker,
      wl.added_at                     as added_at,
      latest.date                     as last_date,
      latest.close::float8            as close,
      m.daily_return::float8          as daily_return,
      m.volatility_30d::float8        as volatility_30d,
      spark.sparkline                 as sparkline
    from wl
    left join latest on latest.ticker = wl.ticker
    left join spark  on spark.ticker  = wl.ticker
    left join metrics m on m.ticker = latest.ticker and m.date = latest.date
    order by wl.ticker asc
  `);

  return result.rows.map((r) => ({
    ticker: r.ticker,
    addedAt: String(r.added_at),
    lastDate: r.last_date,
    close: r.close,
    dailyReturn: r.daily_return,
    volatility30d: r.volatility_30d,
    sparkline: r.sparkline ?? [],
  }));
}

/** Full OHLCV + derived metrics for one ticker over a range, oldest first. */
export async function getTickerSeries(ticker: string, range: Range): Promise<SeriesPoint[]> {
  const db = getDb();
  const start = rangeStartDate(range);

  const result = await db.execute<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    daily_return: number | null;
    ma_20: number | null;
    ma_50: number | null;
    volatility_30d: number | null;
  }>(sql`
    select
      p.date                    as date,
      p.open::float8            as open,
      p.high::float8            as high,
      p.low::float8             as low,
      p.close::float8           as close,
      p.volume::float8          as volume,
      m.daily_return::float8    as daily_return,
      m.ma_20::float8           as ma_20,
      m.ma_50::float8           as ma_50,
      m.volatility_30d::float8  as volatility_30d
    from prices p
    left join metrics m on m.ticker = p.ticker and m.date = p.date
    where p.ticker = ${ticker} and p.date >= ${start}
    order by p.date asc
  `);

  return result.rows.map((r) => ({
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    dailyReturn: r.daily_return,
    ma20: r.ma_20,
    ma50: r.ma_50,
    volatility30d: r.volatility_30d,
  }));
}

/**
 * Window return per ticker, best to worst.
 *
 * The return is measured between the first and last close that actually exist
 * inside the window, and `firstDate` is returned alongside so the UI can be
 * honest when a ticker was added recently and its window is short — reporting a
 * 5-day move as a "90d return" would be a lie the table shouldn't tell.
 */
export async function getWatchlistPerformance(range: Range): Promise<PerformanceRow[]> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();
  const start = rangeStartDate(range);

  const result = await db.execute<{
    ticker: string;
    first_date: string | null;
    last_date: string | null;
    first_close: number | null;
    last_close: number | null;
    return_pct: number | null;
    volatility_30d: number | null;
    observations: number;
  }>(sql`
    with wl as (
      select ticker from watchlist_tickers where watchlist_id = ${watchlistId}
    ),
    win as (
      select p.ticker, p.date, p.close
      from prices p
      join wl on wl.ticker = p.ticker
      where p.date >= ${start}
    ),
    firsts as (
      select distinct on (ticker) ticker, date, close from win order by ticker, date asc
    ),
    lasts as (
      select distinct on (ticker) ticker, date, close from win order by ticker, date desc
    ),
    counts as (
      select ticker, count(*)::int as observations from win group by ticker
    )
    select
      wl.ticker                                   as ticker,
      f.date                                      as first_date,
      l.date                                      as last_date,
      f.close::float8                             as first_close,
      l.close::float8                             as last_close,
      case
        when f.close is null or l.close is null or f.close = 0 then null
        else ((l.close - f.close) / f.close * 100)::float8
      end                                         as return_pct,
      m.volatility_30d::float8                    as volatility_30d,
      coalesce(c.observations, 0)                 as observations
    from wl
    left join firsts f on f.ticker = wl.ticker
    left join lasts  l on l.ticker = wl.ticker
    left join counts c on c.ticker = wl.ticker
    left join metrics m on m.ticker = l.ticker and m.date = l.date
    order by return_pct desc nulls last, wl.ticker asc
  `);

  return result.rows.map((r) => ({
    ticker: r.ticker,
    firstDate: r.first_date,
    lastDate: r.last_date,
    firstClose: r.first_close,
    lastClose: r.last_close,
    returnPct: r.return_pct,
    volatility30d: r.volatility_30d,
    observations: Number(r.observations ?? 0),
  }));
}

export async function getRecentPipelineRuns(limit = 25): Promise<PipelineStatus[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(pipelineRuns)
    .orderBy(sql`${pipelineRuns.startedAt} desc`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    startedAt: String(r.startedAt),
    finishedAt: r.finishedAt ? String(r.finishedAt) : null,
    tickersProcessed: r.tickersProcessed,
    rowsUpserted: r.rowsUpserted,
    rowsRejected: r.rowsRejected,
    status: r.status,
    errorSummary: r.errorSummary,
    details: r.details,
    trigger: r.trigger,
  }));
}

export async function getLatestPipelineRun(): Promise<PipelineStatus | null> {
  const [run] = await getRecentPipelineRuns(1);
  return run ?? null;
}
