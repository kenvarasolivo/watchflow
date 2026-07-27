import Link from "next/link";

const FEATURES = [
  {
    href: "/watchlist",
    label: "Watchlist",
    title: "The list, and what it did today",
    body: "Latest close, daily return and a 30-session sparkline for every ticker you track. Symbols added between runs say “awaiting data” rather than showing a convincing blank.",
  },
  {
    href: "/ticker/AAPL",
    label: "Ticker detail",
    title: "Close, averages, volume — on separate axes",
    body: "Daily OHLCV with MA-20 and MA-50, and volume in its own plot beneath. No dual-axis chart anywhere: aligning two y-scales invents a relationship the data doesn't contain.",
  },
  {
    href: "/performance",
    label: "Performance",
    title: "Ranked, with the short histories flagged",
    body: "Window return per ticker, best to worst. A symbol added four days into a 90-day window is marked partial instead of being presented as a 90-day move.",
  },
  {
    href: "/pipeline",
    label: "Run log",
    title: "Including the runs that failed",
    body: "Duration, tickers processed, rows upserted, rows rejected, and the reason. Rejected rows count as a partial failure, because data fetched and then discarded is a real loss.",
  },
] as const;

export function Features() {
  return (
    <section className="shell py-16 sm:py-24">
      <p className="eyebrow">What&rsquo;s in it</p>
      <h2 className="display mt-3 max-w-2xl text-3xl text-ink sm:text-4xl">
        Four screens, and none of them lie to you about freshness.
      </h2>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.href}>
            <Link
              href={feature.href}
              className="group flex h-full flex-col rounded-2xl border border-hairline bg-canvas p-7 transition-all hover:-translate-y-0.5 hover:border-baseline hover:shadow-[0_8px_28px_rgba(10,10,10,0.07)] focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span className="eyebrow">{feature.label}</span>
              <h3 className="display mt-4 text-xl text-ink sm:text-2xl">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{feature.body}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-leaf">
                Open
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
