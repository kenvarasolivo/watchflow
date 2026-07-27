import Link from "next/link";

import { PipelineBadge } from "@/components/PipelineBadge";
import type { PipelineStatus } from "@/db/queries";
import { formatDateTime } from "@/lib/format";

/**
 * Hand-drawn-ish underline for the closing phrase of the headline.
 *
 * Purely decorative, and it sits in the one place the accent green earns a
 * large surface. `vector-effect` keeps the stroke a constant weight while the
 * path stretches to whatever width the text ends up at.
 */
function Underline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 300 12"
      preserveAspectRatio="none"
      className="absolute -bottom-1 left-0 h-[0.32em] w-full text-leaf"
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

/**
 * The last run, rendered as a receipt.
 *
 * The headline claims the app shows its work; this is the work, in the first
 * viewport, before any of it has been described. It is also the honest version
 * of a hero screenshot — a real row from `pipeline_runs` rather than a mockup
 * that will never be wrong because it was never true.
 */
function RunReceipt({ run }: { run: PipelineStatus | null }) {
  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-baseline bg-subtle p-6">
        <p className="eyebrow">Last run</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
          No run recorded yet. Once the pipeline executes once, its result appears here — and
          on every other page — as the definition of how fresh the numbers are.
        </p>
      </div>
    );
  }

  const rows: [string, string, string?][] = [
    ["status", STATUS_LABEL[run.status], STATUS_TONE[run.status]],
    ["started", formatDateTime(run.startedAt)],
    ["duration", runDuration(run)],
    ["tickers", String(run.tickersProcessed)],
    ["rows upserted", run.rowsUpserted.toLocaleString()],
    ["rows rejected", run.rowsRejected.toLocaleString(), run.rowsRejected > 0 ? "text-loss" : undefined],
    ["trigger", run.trigger],
  ];

  return (
    <Link
      href="/pipeline"
      className="group block rounded-2xl border border-hairline bg-canvas p-6 shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-all hover:-translate-y-0.5 hover:border-baseline hover:shadow-[0_12px_32px_rgba(10,10,10,0.08)] focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Last pipeline run</span>
        <span className="num text-xs text-ink-muted">#{run.id}</span>
      </div>

      <dl className="mt-5 flex flex-col gap-0">
        {rows.map(([label, value, tone]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-b border-grid py-2.5 last:border-b-0"
          >
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className={`num text-right text-xs ${tone ?? "text-ink"}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 flex items-center gap-2 text-xs font-medium text-leaf">
        Every run, including the failures
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </p>
    </Link>
  );
}

function runDuration(run: PipelineStatus): string {
  if (!run.finishedAt) return "still running";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 90) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function Hero({ run }: { run: PipelineStatus | null }) {
  return (
    // `isolate` matters: without a stacking context here, the -z-10 backdrop
    // below paints behind the body background and is invisible.
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="grid-veil absolute inset-0 -z-10" />

      <div className="shell grid items-center gap-12 pt-14 pb-14 sm:pt-20 sm:pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.75fr)] lg:gap-16">
        <div>
          <PipelineBadge run={run} />

          <h1 className="display-xl mt-7 text-[clamp(2.6rem,6.2vw,4.75rem)] text-ink">
            A watchlist that{" "}
            <span className="relative inline-block whitespace-nowrap">
              shows its work.
              <Underline />
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-secondary">
            Watchflow tracks end-of-day prices for the tickers you care about — and puts the ETL
            job that fetches them on screen, right next to the numbers it produced. Every close,
            every moving average, and every run that went wrong.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/watchlist"
              className="rounded-full bg-ink px-6 py-3 text-base font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open the dashboard
            </Link>
            <Link
              href="/pipeline"
              className="rounded-full border border-hairline bg-canvas px-6 py-3 text-base font-medium text-ink transition-colors hover:border-baseline hover:bg-subtle focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Read the run log
            </Link>
          </div>

          <p className="mt-6 text-sm text-ink-muted">
            No accounts. Reads are public. Prices are end-of-day, never real time.
          </p>
        </div>

        <RunReceipt run={run} />
      </div>
    </section>
  );
}
