import Link from "next/link";

import { Delta } from "@/components/Delta";
import { Sparkline } from "@/components/Sparkline";
import type { WatchlistRow } from "@/db/queries";
import { companyName } from "@/lib/companies";
import { formatPrice } from "@/lib/format";

/**
 * Live proof, placed before any marketing claim gets made.
 *
 * The cards are the four largest absolute moves in the last session, which is
 * the only ranking that is interesting without knowing the reader's positions.
 * When no ticker has a return yet — a fresh database, or a watchlist added
 * between runs — it falls back to the first four rows rather than rendering an
 * empty grid, because "nothing moved" and "nothing loaded" must not look alike.
 *
 * The run statistics that used to close this section moved to `LastRunBand`,
 * higher on the page. They were the same four figures, and printing them twice
 * invited the reader to check whether the two copies agreed.
 */
export function LiveBoard({
  rows,
  tickerCount,
}: {
  rows: WatchlistRow[];
  tickerCount: number;
}) {
  const withReturns = rows.filter((row) => row.dailyReturn !== null && row.close !== null);

  const movers = (
    withReturns.length > 0
      ? [...withReturns].sort(
          (a, b) => Math.abs(b.dailyReturn ?? 0) - Math.abs(a.dailyReturn ?? 0),
        )
      : rows
  ).slice(0, 4);

  if (movers.length === 0) return null;

  return (
    <section className="shell py-16 sm:py-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="display max-w-xl text-3xl text-ink sm:text-4xl">
          {withReturns.length > 0 ? "Biggest moves last session." : "Waiting on the next run."}
        </h2>
        <Link
          href="/watchlist"
          className="w-fit rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-baseline hover:bg-subtle focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          See all {tickerCount} tickers
        </Link>
      </div>

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {movers.map((row) => {
          const name = companyName(row.ticker, row.name);

          return (
            <li key={row.ticker}>
              <Link
                href={`/ticker/${encodeURIComponent(row.ticker)}`}
                className="group flex h-full flex-col rounded-2xl border border-hairline bg-canvas p-5 transition-all hover:-translate-y-0.5 hover:border-baseline hover:shadow-[0_8px_28px_rgba(10,10,10,0.07)] focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num font-medium tracking-wide text-ink">{row.ticker}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {name ?? "Company name unavailable"}
                    </p>
                  </div>
                  <Delta value={row.dailyReturn} variant="pill" className="shrink-0 text-xs" />
                </div>

                <p className="num-hero mt-5 text-2xl font-medium text-ink">
                  {row.close === null ? "—" : formatPrice(row.close)}
                </p>

                <div className="mt-4">
                  <Sparkline
                    values={row.sparkline}
                    label={row.ticker}
                    width={240}
                    height={52}
                    className="h-auto w-full overflow-visible"
                  />
                </div>

                <p className="num mt-4 text-[0.6875rem] text-ink-muted">
                  as of {row.lastDate ?? "—"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
