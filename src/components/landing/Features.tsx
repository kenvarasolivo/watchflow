import Link from "next/link";

/**
 * The four screens, one line each.
 *
 * The bodies used to be three-sentence paragraphs, and each one spent two of
 * those sentences defending a design decision — no dual axes, partial windows
 * flagged, rejected rows counted. Good decisions, wrong place: the reader is
 * deciding which link to click, not auditing the chart library.
 */
const FEATURES = [
  {
    href: "/watchlist",
    label: "Watchlist",
    title: "What everything did today",
    body: "Latest close, daily move and a 30-day trend line per ticker.",
  },
  {
    href: "/ticker/AAPL",
    label: "Ticker",
    title: "Tomorrow's expected range",
    body: "Price, moving averages and volume — plus a forecast that keeps score of itself.",
  },
  {
    href: "/performance",
    label: "Performance",
    title: "Best and worst, ranked",
    body: "Returns over 30 days, 90 days or a year, with short histories flagged.",
  },
  {
    href: "/pipeline",
    label: "Run log",
    title: "Where the data came from",
    body: "Every load, including the failures.",
  },
] as const;

export function Features() {
  return (
    <section className="shell py-16 sm:py-24">
      <h2 className="display max-w-2xl text-3xl text-ink sm:text-4xl">Four screens.</h2>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.href}>
            <Link
              href={feature.href}
              className="group flex h-full flex-col rounded-2xl border border-hairline bg-canvas p-7 transition-all hover:-translate-y-0.5 hover:border-baseline hover:shadow-[0_8px_28px_rgba(10,10,10,0.07)] focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span className="eyebrow">{feature.label}</span>
              <h3 className="display mt-4 text-xl text-ink sm:text-2xl">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{feature.body}</p>
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
