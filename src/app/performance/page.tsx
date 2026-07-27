import Link from "next/link";

import { Delta } from "@/components/Delta";
import { PerformanceBars } from "@/components/PerformanceBars";
import { PipelineBadge } from "@/components/PipelineBadge";
import { RangeTabs } from "@/components/RangeTabs";
import { SetupNotice } from "@/components/SetupNotice";
import { StatTile } from "@/components/StatTile";
import { getLatestPipelineRun, getWatchlistPerformance } from "@/db/queries";
import { formatPercent, formatPrice } from "@/lib/format";
import { RANGE_LABELS, parseRange, rangeDays } from "@/lib/range";

export const dynamic = "force-dynamic";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);

  let rows;
  let run;
  try {
    [rows, run] = await Promise.all([getWatchlistPerformance(range), getLatestPipelineRun()]);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const withReturns = rows.filter((row) => row.returnPct !== null);
  const best = withReturns.at(0) ?? null;
  const worst = withReturns.at(-1) ?? null;
  const median = medianReturn(withReturns.map((row) => row.returnPct as number));

  // A ticker added mid-window has fewer sessions than the range implies. The
  // table flags those rather than presenting a 4-day move as a 90-day return.
  const expectedSessions = Math.floor(rangeDays(range) * (5 / 7)) - 2;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl text-ink">PERFORMANCE</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Return per ticker over the {RANGE_LABELS[range]} window, best to worst.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <RangeTabs active={range} basePath="/performance" />
          <PipelineBadge run={run} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-hairline bg-surface px-6 py-12 text-center">
          <p className="display text-2xl text-ink-secondary">NOTHING TO COMPARE</p>
          <p className="mt-2 text-sm text-ink-muted">
            Add tickers on the{" "}
            <Link href="/" className="text-gain underline underline-offset-2">
              watchlist
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="Best performer"
              value={best ? `${best.ticker} ${formatPercent(best.returnPct)}` : "—"}
              tone="delta"
              signedValue={best?.returnPct ?? null}
            />
            <StatTile
              label="Median return"
              value={formatPercent(median)}
              tone="delta"
              signedValue={median}
              hint={`Across ${withReturns.length} ticker${withReturns.length === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Worst performer"
              value={worst ? `${worst.ticker} ${formatPercent(worst.returnPct)}` : "—"}
              tone="delta"
              signedValue={worst?.returnPct ?? null}
            />
          </div>

          <PerformanceBars rows={rows} range={range} />

          <div className="overflow-x-auto rounded border border-hairline bg-surface">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">
                Ranked watchlist performance over the {RANGE_LABELS[range]} window.
              </caption>
              <thead>
                <tr className="border-b border-hairline text-left text-xs tracking-widest text-ink-muted uppercase">
                  <th scope="col" className="px-4 py-3 font-normal">#</th>
                  <th scope="col" className="px-4 py-3 font-normal">Ticker</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Return</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Start</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Latest</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Vol 30d</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.ticker}
                    className="border-b border-hairline/60 last:border-b-0 hover:bg-elevated/50"
                  >
                    <td className="num px-4 py-3 text-ink-muted">{index + 1}</td>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <Link
                        href={`/ticker/${encodeURIComponent(row.ticker)}`}
                        className="num tracking-wider text-ink hover:text-gain focus-visible:ring-2 focus-visible:ring-gain focus-visible:outline-none"
                      >
                        {row.ticker}
                      </Link>
                    </th>
                    <td className="px-4 py-3 text-right">
                      {row.returnPct === null ? (
                        <span className="text-xs text-ink-muted">no data</span>
                      ) : (
                        <Delta value={row.returnPct} />
                      )}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink-secondary">
                      {formatPrice(row.firstClose)}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">
                      {formatPrice(row.lastClose)}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink-secondary">
                      {formatPercent(row.volatility30d, { signed: false })}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink-secondary">
                      {row.observations}
                      {row.observations > 0 && row.observations < expectedSessions && (
                        <span
                          className="ml-1.5 text-xs text-series-ma20"
                          title={`Only ${row.observations} sessions in a ${RANGE_LABELS[range]} window — this ticker has a shorter history than the range.`}
                        >
                          partial
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function medianReturn(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
