import type { Metadata } from "next";

import { WatchlistPanel } from "@/components/WatchlistPanel";
import { PipelineBadge } from "@/components/PipelineBadge";
import { SetupNotice } from "@/components/SetupNotice";
import { getLatestPipelineRun, getWatchlistOverview } from "@/db/queries";
import { writesAreGated } from "@/lib/auth";

// Every number on this page comes from the last pipeline run; a cached render
// would quietly show stale data behind a "last updated" badge that says
// otherwise.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watchlist",
  description: "Tracked tickers with their latest close, daily return and 30-day trend.",
};

export default async function WatchlistPage() {
  let rows;
  let run;

  try {
    [rows, run] = await Promise.all([getWatchlistOverview(), getLatestPipelineRun()]);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <div className="shell flex flex-col gap-8 py-10 sm:py-14">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-4xl text-ink sm:text-5xl">Watchlist</h1>
          <p className="mt-2 text-base text-ink-secondary">
            {rows.length === 0
              ? "No tickers tracked yet."
              : `${rows.length} ticker${rows.length === 1 ? "" : "s"} tracked · end-of-day prices`}
          </p>
        </div>
        <PipelineBadge run={run} />
      </header>

      <WatchlistPanel rows={rows} gated={writesAreGated()} />
    </div>
  );
}
