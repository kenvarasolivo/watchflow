"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Delta } from "@/components/Delta";
import { PerformanceBars } from "@/components/PerformanceBars";
import { NoSearchMatch, TickerSearch } from "@/components/TickerSearch";
import type { PerformanceRow } from "@/db/queries";
import { companyName } from "@/lib/companies";
import { formatPercent, formatPrice } from "@/lib/format";
import { RANGE_LABELS, type Range } from "@/lib/range";
import { matchesTerms, searchTerms, tickerSearchText } from "@/lib/search";

/** A row plus the rank it holds in the *unfiltered* ranking. */
type RankedRow = PerformanceRow & { rank: number; searchText: string };

/**
 * The searchable half of the performance page: bar chart and ranked table,
 * both scoped by one query field.
 *
 * The search is client-side rather than a URL parameter, unlike `RangeTabs`.
 * The range changes what the server has to query; a name filter does not — the
 * page already holds every row, and round-tripping each keystroke to Neon would
 * make a filter that exists purely to save scrolling slower than scrolling.
 *
 * Rank is assigned before filtering, so a searched ticker keeps the position it
 * holds in the full list. Renumbering matches 1..n would turn "#1" into a fact
 * about the query rather than about performance.
 */
export function PerformanceExplorer({
  rows,
  range,
  expectedSessions,
}: {
  rows: PerformanceRow[];
  range: Range;
  expectedSessions: number;
}) {
  const [query, setQuery] = useState("");

  const ranked = useMemo<RankedRow[]>(
    () =>
      rows.map((row, index) => ({
        ...row,
        rank: index + 1,
        searchText: tickerSearchText(row.ticker, companyName(row.ticker, row.name)),
      })),
    [rows],
  );

  const terms = searchTerms(query);
  const filtered = ranked.filter((row) => matchesTerms(row.searchText, terms));

  return (
    <>
      <TickerSearch
        id="performance-search"
        value={query}
        onChange={setQuery}
        total={ranked.length}
        matched={filtered.length}
      />

      {filtered.length === 0 ? (
        <NoSearchMatch query={query}>Nothing on the watchlist matches</NoSearchMatch>
      ) : (
        <>
          <PerformanceBars rows={filtered} range={range} />

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
                {filtered.map((row) => {
                  const name = companyName(row.ticker, row.name);

                  return (
                    <tr
                      key={row.ticker}
                      className="border-b border-grid transition-colors last:border-b-0 hover:bg-subtle"
                    >
                      <td className="num px-5 py-3.5 text-ink-muted">{row.rank}</td>
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
    </>
  );
}
