import Link from "next/link";

import { ClosingCta } from "@/components/landing/ClosingCta";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { LastRunBand } from "@/components/landing/LastRunBand";
import { LiveBoard } from "@/components/landing/LiveBoard";
import { TickerMarquee } from "@/components/landing/TickerMarquee";
import { UnderTheHood } from "@/components/landing/UnderTheHood";
import { getLatestPipelineRun, getWatchlistOverview } from "@/db/queries";
import type { PipelineStatus, WatchlistRow } from "@/db/queries";

// The hero badge, the marquee and the freshness line are all live values from
// the last pipeline run. Caching them would put a stale number under a badge
// that claims to say how fresh it is.
export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * Ordered by what the reader is owed first: the offer, real prices, then the
 * engineering. The engineering used to occupy two full sections ahead of the
 * feature list; it is now one band near the bottom, because a page that spends
 * six hundred words on its own ETL job before saying what the visitor gets is
 * a portfolio piece rather than a product.
 *
 * It reads the database, but it does *not* fail with it. A missing
 * DATABASE_URL takes down the live sections only — the rest of the page stays
 * readable, and the reader is told plainly that the numbers are missing rather
 * than being shown a stack trace or a page of zeroes. The app pages behind it
 * still render the full SetupNotice with the fix.
 */
export default async function LandingPage() {
  let rows: WatchlistRow[] = [];
  let run: PipelineStatus | null = null;
  let dataAvailable = true;

  try {
    [rows, run] = await Promise.all([getWatchlistOverview(), getLatestPipelineRun()]);
  } catch {
    dataAvailable = false;
  }

  return (
    <>
      <Hero run={run} />

      {dataAvailable ? (
        <>
          {/* Directly under the hero on purpose: the hero promises current
              numbers, and this is when they were last current. */}
          <LastRunBand run={run} />
          <TickerMarquee rows={rows} />
          <LiveBoard rows={rows} tickerCount={rows.length} />
        </>
      ) : (
        <DataUnavailableNote />
      )}

      <Features />
      <UnderTheHood />
      <ClosingCta />
    </>
  );
}

function DataUnavailableNote() {
  return (
    <section className="shell py-14">
      <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-10 sm:px-10">
        <p className="eyebrow">Live data unavailable</p>
        <h2 className="display mt-3 text-2xl text-ink">Real prices usually sit here.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          The database could not be reached.{" "}
          <Link href="/watchlist" className="font-medium text-leaf underline underline-offset-4">
            Open the watchlist
          </Link>{" "}
          for the error and how to fix it.
        </p>
      </div>
    </section>
  );
}
