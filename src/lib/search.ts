/**
 * Ticker filtering, shared by the watchlist and performance tables.
 *
 * Both pages hold every row already, so the filter is a substring test in the
 * browser rather than a query parameter — see `PerformanceExplorer` for why
 * this one does not belong in the URL the way the range does. It lives here so
 * the two tables cannot drift into matching on different things.
 */

/** Lower-cased haystack for one row: the symbol plus its company name. */
export function tickerSearchText(ticker: string, name?: string | null): string {
  return `${ticker} ${name ?? ""}`.toLowerCase();
}

/**
 * Terms are split on whitespace and commas and matched as *alternatives*, so
 * "aapl msft" pulls up both rather than looking for one row containing both.
 * That is the opposite of how a web search reads, but it is what someone
 * comparing two holdings means when they type two symbols.
 */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** True when `terms` is empty — an empty query filters nothing out. */
export function matchesTerms(searchText: string, terms: string[]): boolean {
  return terms.length === 0 || terms.some((term) => searchText.includes(term));
}
