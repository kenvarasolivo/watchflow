"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Delta } from "@/components/Delta";
import { Sparkline } from "@/components/Sparkline";
import type { WatchlistRow } from "@/db/queries";
import { readWriteToken, saveWriteToken, writeHeaders } from "@/lib/client-token";
import { formatPercent, formatPrice } from "@/lib/format";

type Notice = { tone: "ok" | "warn" | "error"; message: string };

export function WatchlistPanel({ rows, gated }: { rows: WatchlistRow[]; gated: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
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

  return (
    <section className="flex flex-col gap-4">
      <form onSubmit={addTicker} className="flex flex-wrap items-center gap-2">
        <label htmlFor="ticker-input" className="sr-only">
          Ticker symbol
        </label>
        <input
          id="ticker-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Add ticker — e.g. AAPL"
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          className="num w-56 rounded border border-hairline bg-surface px-3 py-2 text-sm tracking-wide text-ink uppercase placeholder:text-ink-muted placeholder:normal-case focus-visible:border-gain focus-visible:ring-1 focus-visible:ring-gain focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || input.trim().length === 0}
          className="rounded border border-gain/40 bg-gain/10 px-4 py-2 text-sm text-gain transition-colors hover:bg-gain/20 focus-visible:ring-2 focus-visible:ring-gain focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Checking…" : "Add"}
        </button>

        {gated && <WriteTokenField />}
      </form>

      {notice && (
        <p
          role="status"
          className={`text-sm ${
            notice.tone === "ok"
              ? "text-gain"
              : notice.tone === "warn"
                ? "text-series-ma20"
                : "text-loss"
          }`}
        >
          {notice.message}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded border border-hairline bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">
              Tracked tickers with latest close, daily return, 30-day trend and volatility.
            </caption>
            <thead>
              <tr className="border-b border-hairline text-left text-xs tracking-widest text-ink-muted uppercase">
                <th scope="col" className="px-4 py-3 font-normal">Ticker</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Close</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Daily</th>
                <th scope="col" className="px-4 py-3 text-center font-normal">30d trend</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Vol 30d</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">As of</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {rows.map((row) => (
                <tr
                  key={row.ticker}
                  className="border-b border-hairline/60 last:border-b-0 hover:bg-elevated/50"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link
                      href={`/ticker/${encodeURIComponent(row.ticker)}`}
                      className="num tracking-wider text-ink hover:text-gain focus-visible:ring-2 focus-visible:ring-gain focus-visible:outline-none"
                    >
                      {row.ticker}
                    </Link>
                  </th>

                  <td className="num px-4 py-3 text-right text-ink">
                    {row.close === null ? (
                      <span className="text-ink-muted">awaiting data</span>
                    ) : (
                      formatPrice(row.close)
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Delta value={row.dailyReturn} />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <Sparkline values={row.sparkline} label={row.ticker} />
                    </div>
                  </td>

                  <td className="num px-4 py-3 text-right text-ink-secondary">
                    {formatPercent(row.volatility30d, { signed: false })}
                  </td>

                  <td className="num px-4 py-3 text-right text-xs text-ink-muted">
                    {row.lastDate ?? "—"}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeTicker(row.ticker)}
                      disabled={busyTicker === row.ticker}
                      aria-label={`Remove ${row.ticker} from the watchlist`}
                      className="rounded px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-loss/15 hover:text-loss focus-visible:ring-2 focus-visible:ring-loss focus-visible:outline-none disabled:opacity-40"
                    >
                      {busyTicker === row.ticker ? "…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded border border-dashed border-hairline bg-surface px-6 py-12 text-center">
      <p className="display text-2xl text-ink-secondary">NOTHING TRACKED YET</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Add a ticker above to start tracking it. The scheduled pipeline backfills its price
        history on the next run, or you can trigger a run manually from GitHub Actions.
      </p>
      <p className="num mt-4 text-xs tracking-wider text-ink-muted">
        TRY: AAPL · MSFT · NVDA · SPY
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
      <label htmlFor="write-token" className="text-xs tracking-wide text-ink-muted uppercase">
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
        className="num w-44 rounded border border-hairline bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus-visible:border-gain focus-visible:outline-none"
      />
      {saved && (
        <span className="text-xs text-ink-muted" role="status">
          stored locally
        </span>
      )}
    </span>
  );
}
