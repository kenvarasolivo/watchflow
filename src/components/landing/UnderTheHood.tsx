import Link from "next/link";

/**
 * The engineering, compressed into one band.
 *
 * This replaces two sections — a three-step ETL walkthrough and a three-card
 * capability grid — that between them ran to about six hundred words of
 * implementation detail. Everything in them was true and almost none of it was
 * read: a visitor wants prices, and a reviewer wants to know the shape of the
 * system in ten seconds and then look at the code.
 *
 * So the claims are one line each and every one of them is checkable against
 * `pipeline/` or `src/db/schema.ts`. The detail lives in the README and in the
 * run log, both linked below, where someone who actually wants it will go.
 */
const FACTS = [
  ["Scheduled Python ETL", "Extract, validate, load — once per weekday after the close."],
  ["Idempotent by design", "Upserts keyed on (ticker, date). Re-running never duplicates."],
  ["Validated before storage", "Pydantic checks every bar; an NYSE calendar tells a holiday from a hole."],
  ["Postgres + Drizzle", "Raw prices and derived metrics in separate tables."],
  ["Next.js 15, TypeScript", "Server-rendered, no client data fetching on first paint."],
  ["Failures are published", "Every run lands in the log, successful or not."],
] as const;

export function UnderTheHood() {
  return (
    <section className="bg-ink text-canvas">
      <div className="shell py-16 sm:py-24">
        {/* Not `.eyebrow`: that class hard-codes the muted ink colour, which is
            unreadable on this surface. */}
        <p className="num text-[0.6875rem] tracking-[0.18em] text-canvas/50 uppercase">
          Under the hood
        </p>
        <h2 className="display mt-4 max-w-2xl text-3xl text-canvas sm:text-4xl">
          A data platform, not a chart page.
        </h2>

        <ul className="mt-12 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map(([title, detail]) => (
            <li key={title}>
              <h3 className="text-base font-medium text-canvas">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-canvas/60">{detail}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3">
          <Link
            href="/pipeline"
            className="group inline-flex items-center gap-2 rounded text-sm font-medium text-gain-inverse focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-ink focus-visible:outline-none"
          >
            See it run
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
          <a
            href="https://github.com/kenvarasolivo/watchflow"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded text-sm font-medium text-canvas/70 transition-colors hover:text-canvas focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-ink focus-visible:outline-none"
          >
            Read the source
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
