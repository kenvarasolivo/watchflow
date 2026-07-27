import type { Metadata } from "next";
import Link from "next/link";

import { Delta } from "@/components/Delta";
import { PerformanceBars } from "@/components/PerformanceBars";
import { PipelineBadge } from "@/components/PipelineBadge";
import { RangeTabs } from "@/components/RangeTabs";
import { SetupNotice } from "@/components/SetupNotice";
import { StatTile } from "@/components/StatTile";
import { getLatestPipelineRun, getWatchlistPerformance } from "@/db/queries";
import { companyName } from "@/lib/companies";
import { formatPercent, formatPrice } from "@/lib/format";
import { RANGE_LABELS, parseRange, rangeDays } from "@/lib/range";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Performance",
  description: "Window return per tracked ticker, ranked best to worst.",
};

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
    <div className="shell flex flex-col gap-8 py-10 sm:py-14">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-4xl text-ink sm:text-5xl">Performance</h1>
          <p className="mt-2 max-w-xl text-base text-ink-secondary">
            Return per ticker over the {RANGE_LABELS[range]} window, best to worst.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <RangeTabs active={range} basePath="/performance" />
          <PipelineBadge run={run} />
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-16 text-center">
          <p className="display text-2xl text-ink">Nothing to compare</p>
          <p className="mt-3 text-sm text-ink-secondary">
            Add tickers on the{" "}
            <Link
              href="/watchlist"
              className="font-medium text-leaf underline underline-offset-4"
            >
              watchlist
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Best performer"
              value={best ? `${best.ticker} ${formatPercent(best.returnPct)}` : "—"}
              tone="delta"
              signedValue={best?.returnPct ?? null}
              hint={best ? (companyName(best.ticker, best.name) ?? undefined) : undefined}
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
              hint={worst ? (companyName(worst.ticker, worst.name) ?? undefined) : undefined}
            />
          </div>

          <PerformanceBars rows={rows} range={range} />

          <div className="overflow-x-auto rounded-2xl border border-hairline bg-canvas">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="sr-only">
                Ranked watchlist performance over the {RANGE_LABELS[range]} window.
              </caption>
              <thead>
                <tr className="border-b border-hairline text-left text-[0.6875rem] tracking-[0.14em] text-ink-muted uppercase">
                  <th scope="col" className="px-5 py-3.5 font-medium">#</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Ticker</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Return</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Start</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Latest</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Vol 30d</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const name = companyName(row.ticker, row.name);

                  return (
                    <tr
                      key={row.ticker}
                      className="border-b border-grid transition-colors last:border-b-0 hover:bg-subtle"
                    >
                      <td className="num px-5 py-3.5 text-ink-muted">{index + 1}</td>
                      <th scope="row" className="px-5 py-3.5 text-left font-normal">
                        <Link
                          href={`/ticker/${encodeURIComponent(row.ticker)}`}
                          className="group inline-flex flex-col rounded focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                          <span className="num font-medium tracking-wide text-ink transition-colors group-hover:text-leaf">
                            {row.ticker}
                          </span>
                          {name && (
                            <span
                              title={name}
                              className="mt-0.5 max-w-[16rem] truncate text-xs text-ink-muted"
                            >
                              {name}
                            </span>
                          )}
                        </Link>
                      </th>
                      <td className="px-5 py-3.5 text-right">
                        {row.returnPct === null ? (
                          <span className="text-xs text-ink-muted">no data</span>
                        ) : (
                          <Delta value={row.returnPct} />
                        )}
                      </td>
                      <td className="num px-5 py-3.5 text-right text-ink-secondary">
                        {formatPrice(row.firstClose)}
                      </td>
                      <td className="num px-5 py-3.5 text-right font-medium text-ink">
                        {formatPrice(row.lastClose)}
                      </td>
                      <td className="num px-5 py-3.5 text-right text-ink-secondary">
                        {formatPercent(row.volatility30d, { signed: false })}
                      </td>
                      <td className="num px-5 py-3.5 text-right text-ink-secondary">
                        {row.observations}
                        {row.observations > 0 && row.observations < expectedSessions && (
                          <span
                            className="ml-2 rounded-full bg-series-ma20/10 px-2 py-0.5 text-[0.6875rem] text-series-ma20"
                            title={`Only ${row.observations} sessions in a ${RANGE_LABELS[range]} window — this ticker has a shorter history than the range.`}
                          >
                            partial
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
