import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Delta } from "@/components/Delta";
import { ForecastCard } from "@/components/ForecastCard";
import { PriceChart } from "@/components/PriceChart";
import { RangeTabs } from "@/components/RangeTabs";
import { SessionExplainer } from "@/components/SessionExplainer";
import { SetupNotice } from "@/components/SetupNotice";
import { StatTile } from "@/components/StatTile";
import {
  getForecastRecord,
  getRecentSeries,
  getScoredForecasts,
  getStandingForecast,
  getTickerName,
  getTickerNews,
  getTickerSeries,
} from "@/db/queries";
import { explainLatestSession, headlinesAround } from "@/lib/attribution";
import { companyName } from "@/lib/companies";
import { formatPercent, formatPrice } from "@/lib/format";
import { RANGE_LABELS, parseRange } from "@/lib/range";
import { normaliseTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";

/**
 * The tab title is the one place the name is worth spelling out in full even
 * when it is long — a row of browser tabs reading AAPL / MSFT / NVDA is exactly
 * the situation the name was added to fix.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const normalised = normaliseTicker(decodeURIComponent((await params).symbol));
  if (!normalised.ok) return { title: "Unknown symbol" };

  // The stored name is a nice-to-have here; a failed lookup must not take the
  // page down with it, so metadata falls back to the local table.
  const stored = await getTickerName(normalised.ticker).catch(() => null);
  const name = companyName(normalised.ticker, stored);

  return {
    title: name ? `${normalised.ticker} — ${name}` : normalised.ticker,
    description: `Daily close, moving averages, volume and derived metrics for ${name ?? normalised.ticker}.`,
  };
}

export default async function TickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ symbol }, query] = await Promise.all([params, searchParams]);

  const normalised = normaliseTicker(decodeURIComponent(symbol));
  if (!normalised.ok) notFound();

  const ticker = normalised.ticker;
  const range = parseRange(query.range);

  let series;
  let storedName;
  let recent;
  let headlines;
  let forecast;
  let forecastRecord;
  let gradedForecasts;
  try {
    // One round trip's worth of latency for the whole page: every read below is
    // independent, and the page is `force-dynamic`, so serialising them would
    // add up to seven sequential hops to Neon on every request.
    [
      series,
      storedName,
      recent,
      headlines,
      forecast,
      forecastRecord,
      gradedForecasts,
    ] = await Promise.all([
      getTickerSeries(ticker, range),
      getTickerName(ticker),
      getRecentSeries(ticker),
      getTickerNews(ticker),
      getStandingForecast(ticker),
      getForecastRecord(ticker),
      getScoredForecasts(ticker, 8),
    ]);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const name = companyName(ticker, storedName);

  // Both derived from the fixed recent window rather than the selected range,
  // so switching the chart between 1m and 1y does not silently restate what
  // happened in the latest session.
  //
  // The forecast's sigma is handed to the explainer so the "typical session"
  // it quotes is the same number the band below is built from, rather than a
  // second estimate that differs in the last decimal.
  const explanation = explainLatestSession(recent, forecast?.sigmaPct ?? null);
  const sessionHeadlines =
    explanation === null
      ? []
      : headlinesAround(headlines, explanation.date, { ticker, company: name });
  const latest = series.at(-1) ?? null;
  const first = series.at(0) ?? null;

  const windowReturn =
    latest && first && first.close !== 0
      ? ((latest.close - first.close) / first.close) * 100
      : null;

  const averageVolume =
    series.length > 0
      ? series.reduce((sum, point) => sum + point.volume, 0) / series.length
      : null;

  return (
    <div className="shell flex flex-col gap-8 py-10 sm:py-14">
      <header className="flex flex-col gap-6">
        <Link
          href="/watchlist"
          className="w-fit rounded text-sm text-ink-muted transition-colors hover:text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          ← Watchlist
        </Link>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="display text-4xl text-ink sm:text-5xl">
              <span className="num font-medium tracking-tight">{ticker}</span>
              {name && (
                <span className="ml-3 align-middle text-xl font-medium text-ink-secondary sm:text-2xl">
                  {name}
                </span>
              )}
            </h1>

            {latest && (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <span className="num-hero text-3xl font-medium text-ink">
                  {formatPrice(latest.close)}
                </span>
                <Delta value={latest.dailyReturn} variant="pill" className="text-sm" />
                <span className="num text-xs text-ink-muted">as of {latest.date}</span>
              </div>
            )}
          </div>

          <RangeTabs active={range} basePath={`/ticker/${encodeURIComponent(ticker)}`} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={`${RANGE_LABELS[range]} return`}
          value={formatPercent(windowReturn)}
          tone="delta"
          signedValue={windowReturn}
          hint={first && latest ? `${first.date} → ${latest.date}` : undefined}
        />
        <StatTile
          label="Volatility 30d"
          value={formatPercent(latest?.volatility30d, { signed: false })}
          hint="Annualised stddev of daily returns"
        />
        <StatTile
          label="MA 20 / MA 50"
          value={`${formatPrice(latest?.ma20)} / ${formatPrice(latest?.ma50)}`}
          hint={maCrossHint(latest?.ma20, latest?.ma50)}
        />
        <StatTile
          label="Avg volume"
          value={averageVolume === null ? "—" : Math.round(averageVolume).toLocaleString()}
          hint={`Over ${series.length} session${series.length === 1 ? "" : "s"}`}
        />
      </div>

      <PriceChart series={series} ticker={ticker} />

      <SessionExplainer
        explanation={explanation}
        headlines={sessionHeadlines}
        ticker={ticker}
      />

      <ForecastCard
        forecast={forecast}
        record={forecastRecord}
        history={gradedForecasts}
        ticker={ticker}
      />
    </div>
  );
}

/**
 * The 20/50 relationship is the one thing people actually read off a pair of
 * moving averages, so state it in words rather than making the reader compare
 * two numbers.
 */
function maCrossHint(ma20: number | null | undefined, ma50: number | null | undefined): string {
  if (ma20 === null || ma20 === undefined || ma50 === null || ma50 === undefined) {
    return "Needs 50 sessions of history";
  }
  if (ma20 > ma50) return "Short-term average above long-term";
  if (ma20 < ma50) return "Short-term average below long-term";
  return "Averages level";
}
