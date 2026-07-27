import Link from "next/link";

import { ClosingCta } from "@/components/landing/ClosingCta";
import { Features } from "@/components/landing/Features";
import { FingerprintNote } from "@/components/landing/FingerprintNote";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveBoard } from "@/components/landing/LiveBoard";
import { TickerMarquee } from "@/components/landing/TickerMarquee";
import { getLatestPipelineRun, getWatchlistOverview } from "@/db/queries";
import type { PipelineStatus, WatchlistRow } from "@/db/queries";

// The hero badge, the marquee and the stat row are all live values from the
// last pipeline run. Caching them would put a stale number under a badge that
// claims to say how fresh it is.
export const dynamic = "force-dynamic";

/**
 * The landing page.
 *
 * It reads the database, but it does *not* fail with it. A missing
 * DATABASE_URL takes down the live sections only — the explanation of what the
 * project is stays readable, and the reader is told plainly that the numbers
 * are missing rather than being shown a stack trace or a page of zeroes. The
 * app pages behind it still render the full SetupNotice with the fix.
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
          <TickerMarquee rows={rows} />
          <LiveBoard rows={rows} run={run} tickerCount={rows.length} />
        </>
      ) : (
        <DataUnavailableNote />
      )}

      <HowItWorks />
      <FingerprintNote />
      <Features />
      <ClosingCta />
    </>
  );
}

function DataUnavailableNote() {
  return (
    <section className="shell py-14">
      <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-10 sm:px-10">
        <p className="eyebrow">Live data unavailable</p>
        <h2 className="display mt-3 text-2xl text-ink">
          This page usually shows real prices here.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          The database could not be reached, so the ticker strip and the last-run figures are
          missing. Everything below still describes the project accurately.{" "}
          <Link
            href="/watchlist"
            className="font-medium text-leaf underline underline-offset-4"
          >
            Open the watchlist
          </Link>{" "}
          for the exact error and the steps to fix it.
        </p>
      </div>
    </section>
  );
}
