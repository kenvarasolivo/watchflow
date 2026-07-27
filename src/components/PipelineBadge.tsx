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
 *
 * The status dot is never the only signal — the word beside it says the same
 * thing, so the badge survives without colour.
 */
export function PipelineBadge({ run }: { run: PipelineStatus | null }) {
  if (!run) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-hairline bg-subtle px-3 py-1.5 text-xs text-ink-secondary">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-muted" />
        <span>
          No pipeline run recorded yet — run{" "}
          <code className="num text-ink">python -m watchflow_pipeline</code>
        </span>
      </div>
    );
  }

  const tone = TONE[run.status];
  const stamp = run.finishedAt ?? run.startedAt;

  return (
    <Link
      href="/pipeline"
      title={`Pipeline run #${run.id} — ${formatDateTime(stamp)}`}
      className="group inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full border border-hairline bg-subtle px-3 py-1.5 text-xs transition-colors hover:border-baseline hover:bg-sunken focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
        <span className={`font-medium ${tone.text}`}>{tone.label}</span>
      </span>

      <span aria-hidden="true" className="text-baseline">
        ·
      </span>

      <span className="text-ink-secondary">
        updated <span className="num text-ink">{formatRelative(stamp)}</span>
      </span>

      <span aria-hidden="true" className="text-baseline">
        ·
      </span>

      <span className="text-ink-secondary">
        <span className="num text-ink">{run.rowsUpserted.toLocaleString()}</span> rows
        {run.rowsRejected > 0 && (
          <>
            {", "}
            <span className="num text-loss">{run.rowsRejected}</span> rejected
          </>
        )}
      </span>

      <span className="text-ink-muted transition-colors group-hover:text-leaf">→</span>
    </Link>
  );
}
