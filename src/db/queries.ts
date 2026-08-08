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
  /** Exchange-resolved company name, or null when the add-time lookup failed. */
  name: string | null;
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
  name: string | null;
  firstDate: string | null;
  lastDate: string | null;
  firstClose: number | null;
  lastClose: number | null;
  returnPct: number | null;
  volatility30d: number | null;
  observations: number;
};

export type NewsHeadline = {
  articleId: string;
  title: string;
  publisher: string | null;
  link: string;
  publishedAt: string;
};

/** A forecast as made, plus its verdict once the target session settled. */
export type ForecastRow = {
  targetDate: string;
  basisDate: string;
  basisClose: number;
  central: number;
  low: number;
  high: number;
  /** Half-width of the band in percent — `high / central - 1`. */
  sigmaPct: number;
  driftPct: number;
  sampleSize: number;
  actualClose: number | null;
  actualReturnPct: number | null;
  withinBand: boolean | null;
  errorPct: number | null;
};

/** Realised calibration of every scored forecast for one ticker. */
export type ForecastRecord = {
  scored: number;
  hits: number;
  /** Share of scored forecasts whose close landed inside the band, 0–100. */
  hitRatePct: number | null;
  /** Mean |miss| of the central estimate, in percent. */
  meanAbsErrorPct: number | null;
  /** Same, for the naive "tomorrow closes where today closed" baseline. */
  baselineAbsErrorPct: number | null;
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

export async function listTickers(): Promise<
  { ticker: string; name: string | null; addedAt: string }[]
> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const rows = await db
    .select({
      ticker: watchlistTickers.ticker,
      name: watchlistTickers.name,
      addedAt: watchlistTickers.addedAt,
    })
    .from(watchlistTickers)
    .where(eq(watchlistTickers.watchlistId, watchlistId))
    .orderBy(asc(watchlistTickers.ticker));

  return rows.map((r) => ({ ticker: r.ticker, name: r.name, addedAt: String(r.addedAt) }));
}

export async function addTicker(
  ticker: string,
  name: string | null = null,
): Promise<{ added: boolean }> {
  const db = getDb();
  const watchlistId = await getDefaultWatchlistId();

  const inserted = await db
    .insert(watchlistTickers)
    .values({ watchlistId, ticker, name })
    .onConflictDoNothing()
    .returning({ ticker: watchlistTickers.ticker });

  return { added: inserted.length > 0 };
}

/**
 * The stored name for one ticker, independent of the watchlist overview.
 *
 * `/ticker/[symbol]` renders for symbols that were never added — a link that
 * was bookmarked, or a ticker removed since — so this returns null rather than
 * throwing, and the caller falls back to the local name table.
 */
export async function getTickerName(ticker: string): Promise<string | null> {
  const db = getDb();

  const rows = await db
    .select({ name: watchlistTickers.name })
    .from(watchlistTickers)
    .where(eq(watchlistTickers.ticker, ticker))
    .limit(1);

  return rows[0]?.name ?? null;
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
    name: string | null;
    added_at: string;
    last_date: string | null;
    close: number | null;
    daily_return: number | null;
    volatility_30d: number | null;
    sparkline: number[] | null;
  }>(sql`
    with wl as (
      select ticker, name, added_at
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
      wl.name                         as name,
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
    name: r.name,
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
 * The last `sessions` bars for one ticker, oldest first.
 *
 * Deliberately separate from `getTickerSeries`, which is bounded by the range
 * the reader picked. The session explainer needs a *fixed* lookback — its
 * "volume against the 30-session average" has to mean the same thing whether
 * the chart above it is showing a month or a year, and a range-bounded query
 * would silently change the baseline under it.
 */
export async function getRecentSeries(ticker: string, sessions = 70): Promise<SeriesPoint[]> {
  const db = getDb();

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
    select * from (
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
      where p.ticker = ${ticker}
      order by p.date desc
      limit ${sessions}
    ) recent
    order by date asc
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
 * Headlines for one ticker, newest first.
 *
 * No date filter here on purpose. The caller knows which session it is
 * annotating and how wide a window around it counts as "around" — see
 * `lib/attribution.ts` — and pushing that judgement into SQL would spread one
 * decision across two layers.
 */
export async function getTickerNews(ticker: string, limit = 24): Promise<NewsHeadline[]> {
  const db = getDb();

  const result = await db.execute<{
    article_id: string;
    title: string;
    publisher: string | null;
    link: string;
    published_at: string;
  }>(sql`
    select article_id, title, publisher, link, published_at
    from news
    where ticker = ${ticker}
    order by published_at desc
    limit ${limit}
  `);

  return result.rows.map((r) => ({
    articleId: r.article_id,
    title: r.title,
    publisher: r.publisher,
    link: r.link,
    publishedAt: String(r.published_at),
  }));
}

/**
 * The standing forecast: the most recent one whose session has not settled.
 *
 * Keyed on `actual_close is null` rather than on comparing `target_date` to the
 * clock. The pipeline decides what "the next session" is using a market
 * calendar; the web host only knows wall-clock time, and on a holiday the two
 * disagree. Whether the outcome has been graded is the same question stated in
 * terms this layer can actually answer.
 */
export async function getStandingForecast(ticker: string): Promise<ForecastRow | null> {
  const rows = await selectForecasts(sql`
    where ticker = ${ticker} and actual_close is null
    order by target_date desc
    limit 1
  `);
  return rows[0] ?? null;
}

/** The most recently graded forecasts, newest first — the visible track record. */
export async function getScoredForecasts(ticker: string, limit = 10): Promise<ForecastRow[]> {
  return selectForecasts(sql`
    where ticker = ${ticker} and actual_close is not null
    order by target_date desc
    limit ${limit}
  `);
}

/**
 * Calibration over every graded forecast for one ticker.
 *
 * `baselineAbsErrorPct` is the point of this query. On its own, "the central
 * estimate missed by 1.2%" is a number with nothing to be compared against, and
 * a reader has no way to tell a useful model from a useless one. The random
 * walk — "tomorrow closes exactly where today closed" — is the benchmark any
 * next-day forecast has to beat to have earned its place, and it is computed
 * from the same rows over the same sessions. When the model is not beating it,
 * the UI says so.
 */
export async function getForecastRecord(ticker: string): Promise<ForecastRecord> {
  const db = getDb();

  const result = await db.execute<{
    scored: number;
    hits: number;
    hit_rate_pct: number | null;
    mean_abs_error_pct: number | null;
    baseline_abs_error_pct: number | null;
  }>(sql`
    select
      count(*)::int                                              as scored,
      count(*) filter (where within_band)::int                   as hits,
      (avg(case when within_band then 100.0 else 0.0 end))::float8 as hit_rate_pct,
      avg(abs(error_pct))::float8                                as mean_abs_error_pct,
      avg(abs(actual_return_pct))::float8                        as baseline_abs_error_pct
    from predictions
    where ticker = ${ticker} and actual_close is not null
  `);

  const row = result.rows[0];
  return {
    scored: Number(row?.scored ?? 0),
    hits: Number(row?.hits ?? 0),
    hitRatePct: row?.hit_rate_pct ?? null,
    meanAbsErrorPct: row?.mean_abs_error_pct ?? null,
    baselineAbsErrorPct: row?.baseline_abs_error_pct ?? null,
  };
}

/** Shared projection for the three forecast reads above. */
async function selectForecasts(tail: ReturnType<typeof sql>): Promise<ForecastRow[]> {
  const db = getDb();

  const result = await db.execute<{
    target_date: string;
    basis_date: string;
    basis_close: number;
    central: number;
    low: number;
    high: number;
    sigma_pct: number;
    drift_pct: number;
    sample_size: number;
    actual_close: number | null;
    actual_return_pct: number | null;
    within_band: boolean | null;
    error_pct: number | null;
  }>(sql`
    select
      target_date              as target_date,
      basis_date               as basis_date,
      basis_close::float8      as basis_close,
      central::float8          as central,
      low::float8              as low,
      high::float8             as high,
      sigma_pct::float8        as sigma_pct,
      drift_pct::float8        as drift_pct,
      sample_size              as sample_size,
      actual_close::float8     as actual_close,
      actual_return_pct::float8 as actual_return_pct,
      within_band              as within_band,
      error_pct::float8        as error_pct
    from predictions
    ${tail}
  `);

  return result.rows.map((r) => ({
    targetDate: r.target_date,
    basisDate: r.basis_date,
    basisClose: r.basis_close,
    central: r.central,
    low: r.low,
    high: r.high,
    sigmaPct: r.sigma_pct,
    driftPct: r.drift_pct,
    sampleSize: Number(r.sample_size),
    actualClose: r.actual_close,
    actualReturnPct: r.actual_return_pct,
    withinBand: r.within_band,
    errorPct: r.error_pct,
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
    name: string | null;
    first_date: string | null;
    last_date: string | null;
    first_close: number | null;
    last_close: number | null;
    return_pct: number | null;
    volatility_30d: number | null;
    observations: number;
  }>(sql`
    with wl as (
      select ticker, name from watchlist_tickers where watchlist_id = ${watchlistId}
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
      wl.name                                     as name,
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
    name: r.name,
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
