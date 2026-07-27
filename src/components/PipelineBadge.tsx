import Link from "next/link";

import type { PipelineStatus } from "@/db/queries";
import { formatDateTime, formatRelative } from "@/lib/format";

const TONE: Record<PipelineStatus["status"], { dot: string; text: string; label: string }> = {
  success: { dot: "bg-gain", text: "text-gain", label: "Success" },
  running: { dot: "bg-series-ma50", text: "text-series-ma50", label: "Running" },
  partial_failure: { dot: "bg-series-ma20", text: "text-series-ma20", label: "Partial failure" },
  failed: { dot: "bg-loss", text: "text-loss", label: "Failed" },
};

/**
 * The data-freshness indicator.
 *
 * This exists so the app is honest about staleness: every number on the site is
 * only as current as the last pipeline run, and hiding that would make a failed
 * cron look identical to a flat market. It doubles as visible proof the
 * scheduled pipeline is actually running.
 */
export function PipelineBadge({ run }: { run: PipelineStatus | null }) {
  if (!run) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-muted" />
        <span>
          No pipeline run recorded yet — run <code className="num text-ink-secondary">python -m watchflow_pipeline</code> to load data.
        </span>
      </div>
    );
  }

  const tone = TONE[run.status];
  const stamp = run.finishedAt ?? run.startedAt;

  return (
    <Link
      href="/pipeline"
      className="group flex flex-wrap items-center gap-x-3 gap-y-1 text-xs transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gain focus-visible:outline-none"
      title={`Pipeline run #${run.id} — ${formatDateTime(stamp)}`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
        <span className={tone.text}>{tone.label}</span>
      </span>

      <span className="text-ink-muted">
        Data last updated{" "}
        <span className="num text-ink-secondary">{formatRelative(stamp)}</span>
      </span>

      <span className="text-ink-muted">
        <span className="num text-ink-secondary">{run.rowsUpserted.toLocaleString()}</span> rows ·{" "}
        <span className="num text-ink-secondary">{run.tickersProcessed}</span> tickers
        {run.rowsRejected > 0 && (
          <>
            {" · "}
            <span className="num text-loss">{run.rowsRejected}</span> rejected
          </>
        )}
      </span>

      <span className="text-ink-muted underline decoration-dotted underline-offset-2 group-hover:text-ink">
        run log
      </span>
    </Link>
  );
}
