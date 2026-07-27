import type { Metadata } from "next";

import { SetupNotice } from "@/components/SetupNotice";
import { StatTile } from "@/components/StatTile";
import { getRecentPipelineRuns, type PipelineStatus } from "@/db/queries";
import { formatDateTime, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pipeline runs",
  description: "Every execution of the extract → transform → load pipeline, succeeded or not.",
};

const TONE: Record<PipelineStatus["status"], { text: string; dot: string; chip: string }> = {
  success: { text: "text-gain", dot: "bg-gain", chip: "bg-gain/10" },
  running: { text: "text-series-ma50", dot: "bg-series-ma50", chip: "bg-series-ma50/10" },
  partial_failure: {
    text: "text-series-ma20",
    dot: "bg-series-ma20",
    chip: "bg-series-ma20/10",
  },
  failed: { text: "text-loss", dot: "bg-loss", chip: "bg-loss/10" },
};

const LABEL: Record<PipelineStatus["status"], string> = {
  success: "Success",
  running: "Running",
  partial_failure: "Partial",
  failed: "Failed",
};

/**
 * The run log — the observability surface for the ETL pipeline.
 *
 * This page is the reason `pipeline_runs` exists. Without it, a cron that
 * silently stopped firing would look exactly like a market that stopped moving.
 */
export default async function PipelinePage() {
  let runs;
  try {
    runs = await getRecentPipelineRuns(50);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const latest = runs.at(0) ?? null;
  const successes = runs.filter((run) => run.status === "success").length;

  return (
    <div className="shell flex flex-col gap-8 py-10 sm:py-14">
      <header>
        <h1 className="display text-4xl text-ink sm:text-5xl">Pipeline runs</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-secondary">
          Every execution of the extract → transform → load pipeline writes a row here, whether
          it succeeded or not. Scheduled runs fire from GitHub Actions after the US close; manual
          runs come from <code className="num text-ink">workflow_dispatch</code> or a local shell.
        </p>
      </header>

      {latest === null ? (
        <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-16 text-center">
          <p className="display text-2xl text-ink">No runs recorded</p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
            Run the pipeline once to populate this log — either{" "}
            <code className="num text-ink">python -m watchflow_pipeline</code> locally, or the{" "}
            <span className="font-medium text-ink">Run pipeline</span> workflow in GitHub Actions.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Last run"
              value={formatRelative(latest.finishedAt ?? latest.startedAt)}
              hint={LABEL[latest.status]}
            />
            <StatTile
              label="Rows upserted"
              value={latest.rowsUpserted.toLocaleString()}
              hint="Most recent run"
            />
            <StatTile
              label="Rows rejected"
              value={latest.rowsRejected.toLocaleString()}
              hint={latest.rowsRejected > 0 ? "Failed schema validation" : "Clean run"}
            />
            <StatTile
              label="Success rate"
              value={`${Math.round((successes / runs.length) * 100)}%`}
              hint={`Last ${runs.length} run${runs.length === 1 ? "" : "s"}`}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-hairline bg-canvas">
            <table className="w-full min-w-[940px] border-collapse text-sm">
              <caption className="sr-only">Recent pipeline runs, newest first.</caption>
              <thead>
                <tr className="border-b border-hairline text-left text-[0.6875rem] tracking-[0.14em] text-ink-muted uppercase">
                  <th scope="col" className="px-5 py-3.5 font-medium">Run</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Started</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Duration</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Tickers</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Upserted</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Rejected</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function RunRow({ run }: { run: PipelineStatus }) {
  const notes = run.errorSummary ?? run.details;
  const tone = TONE[run.status];

  return (
    <>
      <tr className="border-b border-grid transition-colors hover:bg-subtle">
        <th scope="row" className="num px-5 py-3.5 text-left font-normal text-ink-muted">
          #{run.id}
        </th>
        <td className="px-5 py-3.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.chip} ${tone.text}`}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
            {LABEL[run.status]}
          </span>
        </td>
        <td className="num px-5 py-3.5 text-xs text-ink-secondary">
          {formatDateTime(run.startedAt)}
        </td>
        <td className="num px-5 py-3.5 text-right text-ink-secondary">{duration(run)}</td>
        <td className="num px-5 py-3.5 text-right text-ink-secondary">{run.tickersProcessed}</td>
        <td className="num px-5 py-3.5 text-right font-medium text-ink">
          {run.rowsUpserted.toLocaleString()}
        </td>
        <td
          className={`num px-5 py-3.5 text-right ${run.rowsRejected > 0 ? "font-medium text-loss" : "text-ink-muted"}`}
        >
          {run.rowsRejected}
        </td>
        <td className="num px-5 py-3.5 text-xs text-ink-muted">{run.trigger}</td>
      </tr>

      {notes && (
        <tr className="border-b border-grid">
          <td colSpan={8} className="px-5 pt-0 pb-4">
            <pre
              className={`num max-h-40 overflow-auto rounded-xl border border-hairline bg-subtle px-4 py-3 text-xs whitespace-pre-wrap ${
                run.errorSummary ? "text-loss" : "text-ink-secondary"
              }`}
            >
              {notes}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function duration(run: PipelineStatus): string {
  if (!run.finishedAt) return "—";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 90) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}
