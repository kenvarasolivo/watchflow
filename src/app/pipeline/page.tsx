import { SetupNotice } from "@/components/SetupNotice";
import { StatTile } from "@/components/StatTile";
import { getRecentPipelineRuns, type PipelineStatus } from "@/db/queries";
import { formatDateTime, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

const TONE: Record<PipelineStatus["status"], string> = {
  success: "text-gain",
  running: "text-series-ma50",
  partial_failure: "text-series-ma20",
  failed: "text-loss",
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display text-3xl text-ink">PIPELINE RUNS</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Every execution of the extract → transform → load pipeline writes a row here, whether
          it succeeded or not. Scheduled runs fire from GitHub Actions after the US close;
          manual runs come from <code className="num">workflow_dispatch</code> or a local shell.
        </p>
      </div>

      {latest === null ? (
        <div className="rounded border border-dashed border-hairline bg-surface px-6 py-12 text-center">
          <p className="display text-2xl text-ink-secondary">NO RUNS RECORDED</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
            Run the pipeline once to populate this log — either{" "}
            <code className="num text-ink-secondary">python -m watchflow_pipeline</code> locally,
            or the <span className="text-ink-secondary">Run pipeline</span> workflow in GitHub
            Actions.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

          <div className="overflow-x-auto rounded border border-hairline bg-surface">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <caption className="sr-only">Recent pipeline runs, newest first.</caption>
              <thead>
                <tr className="border-b border-hairline text-left text-xs tracking-widest text-ink-muted uppercase">
                  <th scope="col" className="px-4 py-3 font-normal">Run</th>
                  <th scope="col" className="px-4 py-3 font-normal">Status</th>
                  <th scope="col" className="px-4 py-3 font-normal">Started</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Duration</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Tickers</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Upserted</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Rejected</th>
                  <th scope="col" className="px-4 py-3 font-normal">Trigger</th>
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

  return (
    <>
      <tr className="border-b border-hairline/60 hover:bg-elevated/40">
        <th scope="row" className="num px-4 py-3 text-left font-normal text-ink-muted">
          #{run.id}
        </th>
        <td className={`px-4 py-3 ${TONE[run.status]}`}>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ backgroundColor: "currentColor" }}
            />
            {LABEL[run.status]}
          </span>
        </td>
        <td className="num px-4 py-3 text-xs text-ink-secondary">
          {formatDateTime(run.startedAt)}
        </td>
        <td className="num px-4 py-3 text-right text-ink-secondary">{duration(run)}</td>
        <td className="num px-4 py-3 text-right text-ink-secondary">{run.tickersProcessed}</td>
        <td className="num px-4 py-3 text-right text-ink">
          {run.rowsUpserted.toLocaleString()}
        </td>
        <td
          className={`num px-4 py-3 text-right ${run.rowsRejected > 0 ? "text-loss" : "text-ink-muted"}`}
        >
          {run.rowsRejected}
        </td>
        <td className="num px-4 py-3 text-xs text-ink-muted">{run.trigger}</td>
      </tr>

      {notes && (
        <tr className="border-b border-hairline/60">
          <td colSpan={8} className="px-4 pt-0 pb-3">
            <pre
              className={`num max-h-40 overflow-auto rounded border border-hairline bg-plane px-3 py-2 text-xs whitespace-pre-wrap ${
                run.errorSummary ? "text-loss" : "text-ink-muted"
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
