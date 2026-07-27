import Link from "next/link";
import { notFound } from "next/navigation";

import { Delta } from "@/components/Delta";
import { PriceChart } from "@/components/PriceChart";
import { RangeTabs } from "@/components/RangeTabs";
import { SetupNotice } from "@/components/SetupNotice";
import { StatTile } from "@/components/StatTile";
import { getTickerSeries } from "@/db/queries";
import { formatPercent, formatPrice } from "@/lib/format";
import { RANGE_LABELS, parseRange } from "@/lib/range";
import { normaliseTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";

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
  try {
    series = await getTickerSeries(ticker, range);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="w-fit text-xs text-ink-muted transition-colors hover:text-ink-secondary"
        >
          ← Watchlist
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="display text-4xl tracking-wider text-ink">{ticker}</h1>
            {latest && (
              <>
                <span className="num-hero text-2xl text-ink">{formatPrice(latest.close)}</span>
                <Delta value={latest.dailyReturn} className="text-base" />
                <span className="num text-xs text-ink-muted">as of {latest.date}</span>
              </>
            )}
          </div>

          <RangeTabs active={range} basePath={`/ticker/${encodeURIComponent(ticker)}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
