import Link from "next/link";

import type { PipelineStatus } from "@/db/queries";
import { formatDateTime } from "@/lib/format";

const STATUS_TONE: Record<PipelineStatus["status"], string> = {
  success: "bg-gain",
  running: "bg-series-ma50",
  partial_failure: "bg-series-ma20",
  failed: "bg-loss",
};

/**
 * Freshness, in one line.
 *
 * This used to be a full band of pipeline statistics — a 6xl row count, a
 * five-column definition list, a timestamp footer. All of it true, none of it
 * something a reader wants before they have seen a price. The figures still
 * exist in full on `/pipeline`; what belongs on the landing page is the one
 * fact that changes how the numbers below should be read, which is when they
 * were last touched.
 */
export function LastRunBand({ run }: { run: PipelineStatus | null }) {
  return (
    <section className="border-y border-hairline bg-subtle">
      <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
        {run ? (
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-secondary">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${STATUS_TONE[run.status]}`}
            />
            <span>Updated {formatDateTime(run.startedAt)}</span>
            <Separator />
            <span className="num">{run.tickersProcessed} tickers</span>
            <Separator />
            <span className="num">{run.rowsUpserted.toLocaleString()} rows</span>
            {run.rowsRejected > 0 && (
              <>
                <Separator />
                <span className="num text-loss">
                  {run.rowsRejected.toLocaleString()} rejected
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-ink-secondary">
            No data loaded yet. The first run fills this in.
          </p>
        )}

        <Link
          href="/pipeline"
          className="group inline-flex items-center gap-2 rounded text-sm font-medium text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Run log
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="text-baseline">
      ·
    </span>
  );
}
