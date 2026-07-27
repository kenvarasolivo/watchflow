import { WatchlistPanel } from "@/components/WatchlistPanel";
import { PipelineBadge } from "@/components/PipelineBadge";
import { SetupNotice } from "@/components/SetupNotice";
import { getLatestPipelineRun, getWatchlistOverview } from "@/db/queries";
import { writesAreGated } from "@/lib/auth";

// Every number on this page comes from the last pipeline run; a cached render
// would quietly show stale data behind a "last updated" badge that says
// otherwise.
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  let rows;
  let run;

  try {
    [rows, run] = await Promise.all([getWatchlistOverview(), getLatestPipelineRun()]);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display text-3xl text-ink">WATCHLIST</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {rows.length === 0
              ? "No tickers tracked yet."
              : `${rows.length} ticker${rows.length === 1 ? "" : "s"} tracked · end-of-day prices`}
          </p>
        </div>
        <PipelineBadge run={run} />
      </div>

      <WatchlistPanel rows={rows} gated={writesAreGated()} />
    </div>
  );
}
