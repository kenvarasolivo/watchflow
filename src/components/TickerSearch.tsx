"use client";

/**
 * The search field above a ticker table, plus its match count.
 *
 * Shared so the watchlist and performance tables present one affordance in one
 * place: same pill, same placeholder, same "3 of 24" line. The count is a live
 * region because filtering happens as you type — without it the only feedback
 * that a query matched nothing is a table that silently emptied.
 */
export function TickerSearch({
  id,
  value,
  onChange,
  total,
  matched,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  total: number;
  /** Rows surviving the filter; omit while the query is empty. */
  matched: number;
}) {
  const filtering = value.trim().length > 0;
  const noun = `ticker${total === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          Search tickers
        </label>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search ticker or company"
          autoComplete="off"
          spellCheck={false}
          className="w-72 max-w-full rounded-full border border-hairline bg-canvas py-2.5 pr-10 pl-4 text-sm text-ink transition-colors placeholder:text-ink-muted hover:border-baseline focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf/25 focus-visible:outline-none"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-1.5 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-leaf focus-visible:outline-none"
          >
            ×
          </button>
        )}
      </div>

      <p role="status" className="text-xs text-ink-muted">
        {filtering ? `${matched} of ${total} ${noun}` : `${total} ${noun}`}
      </p>
    </div>
  );
}

/** Shown in place of the table when a query matches nothing. */
export function NoSearchMatch({ query, children }: { query: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-16 text-center">
      <p className="display text-2xl text-ink">No match</p>
      <p className="mt-3 text-sm text-ink-secondary">
        {children} <span className="num text-ink">{query.trim()}</span>.
      </p>
    </div>
  );
}
