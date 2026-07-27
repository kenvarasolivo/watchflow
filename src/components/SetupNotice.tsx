/**
 * Rendered when a page's database read throws.
 *
 * The overwhelmingly common cause on a fresh clone is an unset DATABASE_URL or
 * unrun migrations, so the notice leads with the fix rather than a stack trace.
 * The underlying message is still shown — swallowing it would make a genuine
 * connection failure indistinguishable from a missing env var.
 */
export function SetupNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const looksUnconfigured = message.includes("DATABASE_URL");

  return (
    <div className="rounded border border-hairline bg-surface px-6 py-10">
      <h1 className="display text-3xl text-ink">
        {looksUnconfigured ? "DATABASE NOT CONFIGURED" : "DATABASE UNAVAILABLE"}
      </h1>

      <p className="mt-3 max-w-2xl text-sm text-ink-secondary">
        {looksUnconfigured
          ? "Watchflow reads directly from Neon. Point it at a database to continue:"
          : "The app could not read from Postgres. If this is a fresh database, the migration may not have been applied yet:"}
      </p>

      <ol className="mt-4 flex max-w-2xl list-decimal flex-col gap-2 pl-5 text-sm text-ink-secondary">
        <li>
          Copy <code className="num text-ink">.env.example</code> to{" "}
          <code className="num text-ink">.env.local</code> and set{" "}
          <code className="num text-ink">DATABASE_URL</code> to your Neon connection string.
        </li>
        <li>
          Apply the schema: <code className="num text-ink">npm run db:migrate</code>
        </li>
        <li>
          Seed the default watchlist: <code className="num text-ink">npm run db:seed</code>
        </li>
        <li>
          Load prices: <code className="num text-ink">python -m watchflow_pipeline</code> from{" "}
          <code className="num text-ink">pipeline/</code>, or run the GitHub Actions workflow.
        </li>
      </ol>

      <p className="mt-5 text-xs tracking-wide text-ink-muted uppercase">Underlying error</p>
      <pre className="num mt-1 max-w-full overflow-x-auto rounded border border-hairline bg-plane px-3 py-2 text-xs text-loss">
        {message}
      </pre>
    </div>
  );
}
