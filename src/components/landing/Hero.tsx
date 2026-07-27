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
      className="absolute -bottom-1 left-0 h-[0.3em] w-full text-leaf"
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
 *
 * Deliberately short: the run has ten columns, and printing all of them turns
 * the one panel in the first viewport into a form. The four that change the
 * reading of the number above them are here; /pipeline has the rest.
 */
function RunReceipt({ run }: { run: PipelineStatus | null }) {
  if (!run) {
    return (
      <div className="rounded-3xl border border-dashed border-baseline bg-subtle p-7 sm:p-8">
        <p className="eyebrow">Last run</p>
        <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
          No run recorded yet. Once the pipeline executes once, its result appears here — and
          on every other page — as the definition of how fresh the numbers are.
        </p>
      </div>
    );
  }

  const rows: [string, string, string?][] = [
    ["status", STATUS_LABEL[run.status], STATUS_TONE[run.status]],
    ["tickers", String(run.tickersProcessed)],
    [
      "rejected",
      run.rowsRejected.toLocaleString(),
      run.rowsRejected > 0 ? "text-loss" : undefined,
    ],
    ["duration", runDuration(run)],
  ];

  return (
    <Link
      href="/pipeline"
      className="group block rounded-3xl border border-hairline bg-canvas p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-all hover:-translate-y-0.5 hover:border-baseline hover:shadow-[0_16px_44px_rgba(10,10,10,0.09)] focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none sm:p-8"
    >
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Last pipeline run</span>
        <span className="num text-xs text-ink-muted">#{run.id}</span>
      </div>

      {/* The headline figure of the whole panel. Everything under it is context
          for this number, so it is the only thing set at display size. */}
      <p className="num-hero mt-6 text-5xl font-medium text-ink sm:text-6xl">
        {run.rowsUpserted.toLocaleString()}
      </p>
      <p className="mt-2 text-sm text-ink-secondary">rows upserted</p>

      <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-grid pt-6">
        {rows.map(([label, value, tone]) => (
          <div key={label}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className={`num mt-1 text-sm ${tone ?? "text-ink"}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 flex items-center justify-between gap-4 border-t border-grid pt-5">
        <span className="num text-xs text-ink-muted">{formatDateTime(run.startedAt)}</span>
        <span className="flex items-center gap-2 text-xs font-medium text-leaf">
          Full run log
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
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
    //
    // The min-height claims the viewport under the 4rem header on large screens
    // so the first screen is the hero and nothing else. It is a floor, not a
    // fixed height — the section still grows if the receipt runs long.
    <section className="relative isolate flex items-center overflow-hidden lg:min-h-[calc(100dvh-4rem)]">
      <div aria-hidden="true" className="grid-veil absolute inset-0 -z-10" />

      <div className="shell grid w-full items-center gap-14 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.72fr)] lg:gap-20 lg:py-24">
        <div>
          <PipelineBadge run={run} />

          <h1 className="display-xl mt-8 text-[clamp(3rem,7.2vw,5.5rem)] text-ink">
            A watchlist that{" "}
            <span className="relative inline-block whitespace-nowrap">
              shows its work.
              <Underline />
            </span>
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-secondary sm:text-xl">
            Daily OHLCV for every ticker you track, loaded by a scheduled ETL job that publishes
            its own run log right next to the numbers it produced.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/watchlist"
              className="rounded-full bg-ink px-7 py-3.5 text-base font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open the dashboard
            </Link>
            <Link
              href="/pipeline"
              className="rounded-full border border-hairline bg-canvas px-7 py-3.5 text-base font-medium text-ink transition-colors hover:border-baseline hover:bg-subtle focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Read the run log
            </Link>
          </div>

          <p className="mt-7 text-sm text-ink-muted">
            No accounts. Prices are end-of-day, never real time.
          </p>
        </div>

        <RunReceipt run={run} />
      </div>
    </section>
  );
}
