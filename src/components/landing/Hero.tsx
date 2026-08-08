import Link from "next/link";

import { PipelineBadge } from "@/components/PipelineBadge";
import type { PipelineStatus } from "@/db/queries";

/**
 * Hand-drawn-ish underline for the closing phrase of the headline.
 *
 * Purely decorative. `vector-effect` keeps the stroke a constant weight while
 * the path stretches to whatever width the text ends up at.
 */
function Underline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 12"
      preserveAspectRatio="none"
      className="absolute -bottom-1 left-0 h-[0.28em] w-full text-leaf"
    >
      <path
        d="M2 8.5c58-5 108-6.5 148-5.5s78 3.5 148 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The hero: the promise, then what the reader gets for it.
 *
 * "Shows its work" is the promise, and the subheading is what redeems it —
 * prices, a forecast, and the forecast's own scorecard. The subheading used to
 * describe the machinery instead (a scheduled ETL job publishing its run log),
 * which left the headline making a claim that nothing under it cashed in.
 *
 * The badge stays. One line of text, and the only claim on this screen the
 * reader can check immediately: how stale the numbers are.
 */
export function Hero({ run }: { run: PipelineStatus | null }) {
  return (
    // `isolate` creates the stacking context the -z-10 backdrop is measured
    // against; without it the whole aurora paints behind the body background.
    // The min-height claims the viewport under the 4rem header — svh rather
    // than vh so a mobile URL bar can't push the buttons off-screen.
    <section className="relative isolate flex items-center overflow-hidden sm:min-h-[calc(100svh-4rem)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="aurora aurora-1" />
        <div className="aurora aurora-2" />
        <div className="aurora aurora-3" />
        <div className="aurora aurora-4" />
        {/* Grid above the fields, grain above everything: the hairlines have to
            draw on top of the tint to be visible at all, and the grain has to
            cover the tint and the lines equally or it looks like two textures. */}
        <div className="grid-veil absolute inset-0" />
        <div className="grain absolute inset-0" />
      </div>

      <div className="shell w-full py-20 sm:py-28">
        <PipelineBadge run={run} />

        <h1 className="display-xl mt-9 max-w-5xl text-[clamp(3.25rem,8.6vw,6.75rem)] text-ink">
          Watchflow is a watchlist that{" "}
          <span className="relative inline-block whitespace-nowrap">
            shows its work.
            <Underline />
          </span>
        </h1>

        <p className="mt-9 max-w-xl text-lg leading-relaxed text-ink-secondary sm:text-xl">
          Daily prices, a forecast for the next session, and the scorecard showing how often
          that forecast was right.
        </p>

        <div className="mt-11 flex flex-wrap items-center gap-3">
          <Link
            href="/watchlist"
            className="rounded-full bg-ink px-7 py-3.5 text-base font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Open the watchlist
          </Link>
          <Link
            href="/ticker/AAPL"
            className="rounded-full border border-baseline bg-canvas/70 px-7 py-3.5 text-base font-medium text-ink backdrop-blur-sm transition-colors hover:border-ink-muted hover:bg-canvas focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            See a forecast
          </Link>
        </div>

        <p className="mt-8 text-sm text-ink-muted">
          Free, no signup. End-of-day prices — not investment advice.
        </p>
      </div>
    </section>
  );
}
