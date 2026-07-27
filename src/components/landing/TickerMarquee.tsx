import Link from "next/link";

import type { WatchlistRow } from "@/db/queries";
import { companyName } from "@/lib/companies";
import { direction, formatPercent, formatPrice } from "@/lib/format";

const ARROW: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

/**
 * The live ticker strip under the hero.
 *
 * Real rows from the last pipeline run, not a mock. That is the whole point of
 * putting it on the landing page: the first thing a visitor sees is the actual
 * output of the thing being described.
 *
 * Implementation notes:
 *  - The list is rendered twice and the track translates by exactly -50%, which
 *    is what makes the loop seamless without measuring anything in JS.
 *  - Duration scales with the number of tickers so the strip moves at a constant
 *    speed whether the watchlist holds 6 symbols or 60.
 *  - The duplicate is `aria-hidden`; a screen reader should hear each ticker
 *    once. The whole strip is also skippable — it is decoration, and the same
 *    numbers sit in a real table one click away.
 *  - It pauses on hover, and does not animate at all under
 *    `prefers-reduced-motion` (see globals.css).
 */
export function TickerMarquee({ rows }: { rows: WatchlistRow[] }) {
  const usable = rows.filter((row) => row.close !== null);
  if (usable.length === 0) return null;

  const seconds = Math.max(28, usable.length * 7);

  return (
    <section
      aria-label="Live prices from the last pipeline run"
      className="marquee overflow-hidden border-y border-hairline bg-subtle py-3.5"
    >
      <div
        className="marquee-track flex w-max"
        style={{ "--marquee-duration": `${seconds}s` } as React.CSSProperties}
      >
        <TickerList rows={usable} />
        <TickerList rows={usable} duplicate />
      </div>
    </section>
  );
}

function TickerList({ rows, duplicate = false }: { rows: WatchlistRow[]; duplicate?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center" aria-hidden={duplicate || undefined}>
      {rows.map((row) => {
        const name = companyName(row.ticker, row.name);
        const dir = direction(row.dailyReturn);
        const tone = dir === "up" ? "text-gain" : dir === "down" ? "text-loss" : "text-ink-muted";

        return (
          <li key={row.ticker} className="flex items-center">
            <Link
              href={`/ticker/${encodeURIComponent(row.ticker)}`}
              tabIndex={duplicate ? -1 : undefined}
              className="flex items-baseline gap-2.5 rounded-lg px-5 py-1 transition-colors hover:bg-sunken focus-visible:ring-2 focus-visible:ring-leaf focus-visible:outline-none"
            >
              <span className="num text-sm font-medium text-ink">{row.ticker}</span>
              {name && (
                <span className="hidden max-w-[13rem] truncate text-xs text-ink-muted sm:inline">
                  {name}
                </span>
              )}
              <span className="num text-sm text-ink-secondary">{formatPrice(row.close)}</span>
              <span className={`num text-xs font-medium ${tone}`}>
                <span aria-hidden="true">{ARROW[dir]} </span>
                {formatPercent(row.dailyReturn)}
              </span>
            </Link>
            <span aria-hidden="true" className="text-baseline">
              |
            </span>
          </li>
        );
      })}
    </ul>
  );
}
