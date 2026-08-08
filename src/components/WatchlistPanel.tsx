"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Delta } from "@/components/Delta";
import { Sparkline } from "@/components/Sparkline";
import { NoSearchMatch, TickerSearch } from "@/components/TickerSearch";
import type { WatchlistRow } from "@/db/queries";
import { readWriteToken, saveWriteToken, writeHeaders } from "@/lib/client-token";
import { companyName } from "@/lib/companies";
import { formatPercent, formatPrice } from "@/lib/format";
import { matchesTerms, searchTerms, tickerSearchText } from "@/lib/search";

type Notice = { tone: "ok" | "warn" | "error"; message: string };

const NOTICE_STYLE: Record<Notice["tone"], string> = {
  ok: "border-gain/25 bg-gain/8 text-gain",
  warn: "border-series-ma20/25 bg-series-ma20/8 text-series-ma20",
  error: "border-loss/25 bg-loss/8 text-loss",
};

export function WatchlistPanel({ rows, gated }: { rows: WatchlistRow[]; gated: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyTicker, setBusyTicker] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function addTicker(event: React.FormEvent) {
    event.preventDefault();
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;

    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: writeHeaders(),
        body: JSON.stringify({ ticker }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice({ tone: "error", message: payload.error ?? `Failed to add ${ticker}.` });
        return;
      }

      setInput("");
      // An active filter would hide the row that was just added unless the
      // symbol happens to match it, which reads as the add having failed.
      setQuery("");
      // A ticker added between pipeline runs has no price rows yet. Saying so up
      // front is better than showing an empty row and letting the user wonder
      // whether something is broken.
      setNotice(
        payload.verified
          ? {
              tone: "ok",
              message: `Added ${payload.ticker}${payload.name ? ` — ${payload.name}` : ""}. Prices appear after the next pipeline run.`,
            }
          : {
              tone: "warn",
              message: `Added ${payload.ticker}, but the symbol could not be confirmed with Yahoo right now (${payload.verificationNote ?? "lookup unavailable"}). The next pipeline run will confirm it.`,
            },
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Network error.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function removeTicker(ticker: string) {
    setBusyTicker(ticker);
    setNotice(null);
    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, {
        method: "DELETE",
        headers: writeHeaders(),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setNotice({ tone: "error", message: payload.error ?? `Failed to remove ${ticker}.` });
        return;
      }

      setNotice({
        tone: "ok",
        message: `Removed ${ticker}. Its price history is kept, so re-adding it is instant.`,
      });
      startTransition(() => router.refresh());
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Network error.",
      });
    } finally {
      setBusyTicker(null);
    }
  }

  // Filtering the rendered rows only — the header count on the page above still
  // reports how many tickers are tracked, which is what it claims to mean.
  const terms = searchTerms(query);
  const visible = rows.filter((row) =>
    matchesTerms(tickerSearchText(row.ticker, companyName(row.ticker, row.name)), terms),
  );

  return (
    // `min-w-0` is load-bearing: this section is a flex item, and a flex item's
    // automatic minimum size is its min-content width — which here is the 820px
    // table below. Without it the section refuses to shrink under ~820px, the
    // table's own `overflow-x-auto` never gets to do its job, and the whole
    // document scrolls sideways on a phone instead of just the table.
    <section className="flex min-w-0 flex-col gap-5">
      <form onSubmit={addTicker} className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="ticker-input" className="sr-only">
          Ticker symbol
        </label>
        <input
          id="ticker-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Add a ticker — e.g. AAPL"
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          className="num w-64 rounded-full border border-hairline bg-canvas px-4 py-2.5 text-sm tracking-wide text-ink uppercase transition-colors placeholder:text-ink-muted placeholder:normal-case hover:border-baseline focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf/25 focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || input.trim().length === 0}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-baseline"
        >
          {submitting ? "Checking…" : "Add ticker"}
        </button>

        {gated && <WriteTokenField />}
      </form>

      {notice && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${NOTICE_STYLE[notice.tone]}`}
        >
          {notice.message}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <TickerSearch
            id="watchlist-search"
            value={query}
            onChange={setQuery}
            total={rows.length}
            matched={visible.length}
          />

          {visible.length === 0 ? (
            <NoSearchMatch query={query}>Nothing tracked matches</NoSearchMatch>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-hairline bg-canvas">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <caption className="sr-only">
                  Tracked tickers with latest close, daily return, 30-day trend and volatility.
                </caption>
                <thead>
                  <tr className="border-b border-hairline text-left text-[0.6875rem] tracking-[0.14em] text-ink-muted uppercase">
                    <th scope="col" className="px-5 py-3.5 font-medium">Ticker</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-medium">Close</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-medium">Daily</th>
                    <th scope="col" className="px-5 py-3.5 text-center font-medium">30d trend</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-medium">Vol 30d</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-medium">As of</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
                  {visible.map((row) => {
                    const name = companyName(row.ticker, row.name);

                    return (
                      <tr
                        key={row.ticker}
                        className="border-b border-grid transition-colors last:border-b-0 hover:bg-subtle"
                      >
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

                        <td className="num px-5 py-3.5 text-right font-medium text-ink">
                          {row.close === null ? (
                            <span className="text-xs font-normal text-ink-muted">awaiting data</span>
                          ) : (
                            formatPrice(row.close)
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <Delta value={row.dailyReturn} />
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex justify-center">
                            <Sparkline values={row.sparkline} label={row.ticker} />
                          </div>
                        </td>

                        <td className="num px-5 py-3.5 text-right text-ink-secondary">
                          {formatPercent(row.volatility30d, { signed: false })}
                        </td>

                        <td className="num px-5 py-3.5 text-right text-xs text-ink-muted">
                          {row.lastDate ?? "—"}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeTicker(row.ticker)}
                            disabled={busyTicker === row.ticker}
                            aria-label={`Remove ${row.ticker} from the watchlist`}
                            className="rounded-full px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-loss/10 hover:text-loss focus-visible:ring-2 focus-visible:ring-loss focus-visible:outline-none disabled:opacity-40"
                          >
                            {busyTicker === row.ticker ? "…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-16 text-center">
      <p className="display text-2xl text-ink">Nothing tracked yet</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-secondary">
        Add a ticker above to start tracking it. The scheduled pipeline backfills its price
        history on the next run, or you can trigger a run manually from GitHub Actions.
      </p>
      <p className="num mt-5 text-xs tracking-wider text-ink-muted">
        Try AAPL · MSFT · NVDA · SPY
      </p>
    </div>
  );
}

/**
 * Shown only when the deployment sets WATCHFLOW_WRITE_TOKEN. Keeping it inline
 * with the add form means a gated deployment is still usable from the browser
 * without inventing a login screen this version explicitly does not want.
 */
function WriteTokenField() {
  const [value, setValue] = useState(() => readWriteToken() ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <span className="flex items-center gap-2">
      <label htmlFor="write-token" className="eyebrow">
        Write token
      </label>
      <input
        id="write-token"
        type="password"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          saveWriteToken(event.target.value);
          setSaved(true);
        }}
        placeholder="required to edit"
        className="num w-44 rounded-full border border-hairline bg-canvas px-4 py-2 text-xs text-ink placeholder:text-ink-muted focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf/25 focus-visible:outline-none"
      />
      {saved && (
        <span className="text-xs text-ink-muted" role="status">
          stored locally
        </span>
      )}
    </span>
  );
}
