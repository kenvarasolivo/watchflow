import Link from "next/link";

import type { PipelineStatus } from "@/db/queries";
import { formatDateTime } from "@/lib/format";

const STATUS_TONE: Record<PipelineStatus["status"], string> = {
  success: "text-gain",
  running: "text-series-ma50",
  partial_failure: "text-series-ma20",
  failed: "text-loss",
};

const STATUS_LABEL: Record<PipelineStatus["status"], string> = {
  success: "success",
  running: "running",
  partial_failure: "partial failure",
  failed: "failed",
};

function runDuration(run: PipelineStatus): string {
  if (!run.finishedAt) return "still running";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 90) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * The last run, as the first thing under the hero.
 *
 * This is the honest version of a product screenshot: a real row from
 * `pipeline_runs` rather than a mockup that can never be wrong because it was
 * never true. It reads as a band rather than a card so the figures get a full
 * measure of horizontal room — the shape the hero column could never give them.
 *
 * It carries the numbers that used to be repeated in `LiveBoard`'s stat row,
 * which is why that row is gone: the same four values twice on one page make
 * the second set look like a different run.
 */
export function LastRunBand({ run }: { run: PipelineStatus | null }) {
  if (!run) {
    return (
      <section className="border-y border-hairline bg-subtle">
        <div className="shell py-10">
          <p className="eyebrow">Last pipeline run</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
            No run recorded yet. Once the pipeline executes once, its result appears here — and
            on every other page — as the definition of how fresh the numbers are.
          </p>
        </div>
      </section>
    );
  }

  const facts: [string, string, string?][] = [
    ["status", STATUS_LABEL[run.status], STATUS_TONE[run.status]],
    ["tickers", String(run.tickersProcessed)],
    [
      "rows rejected",
      run.rowsRejected.toLocaleString(),
      run.rowsRejected > 0 ? "text-loss" : undefined,
    ],
    ["duration", runDuration(run)],
    ["trigger", run.trigger],
  ];

  return (
    <section className="border-y border-hairline bg-subtle">
      <div className="shell py-12 sm:py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="eyebrow">
            Last pipeline run <span className="text-baseline">·</span> #{run.id}
          </p>
          <Link
            href="/pipeline"
            className="group inline-flex items-center gap-2 rounded text-sm font-medium text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Every run, including the failures
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>

        {/* The upserted count is the headline figure and everything to its right
            is context for it, so it gets its own column rather than a slot in
            the same grid — a five-across row would size it like a footnote. */}
        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-14">
          <div className="shrink-0">
            <p className="num-hero text-5xl font-medium text-ink sm:text-6xl">
              {run.rowsUpserted.toLocaleString()}
            </p>
            <p className="mt-2 text-sm text-ink-secondary">rows upserted</p>
          </div>

          <span aria-hidden="true" className="hidden w-px self-stretch bg-hairline lg:block" />

          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {facts.map(([label, value, tone]) => (
              <div key={label}>
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className={`num mt-1.5 text-sm ${tone ?? "text-ink"}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="num mt-8 border-t border-hairline pt-5 text-xs text-ink-muted">
          started {formatDateTime(run.startedAt)}
        </p>
      </div>
    </section>
  );
}
