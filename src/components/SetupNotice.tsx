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
    <div className="shell py-12">
      <div className="max-w-3xl rounded-2xl border border-hairline bg-canvas px-6 py-10 sm:px-10">
        <p className="eyebrow">Setup required</p>
        <h1 className="display mt-3 text-3xl text-ink sm:text-4xl">
          {looksUnconfigured ? "Database not configured" : "Database unavailable"}
        </h1>

        <p className="mt-4 text-base leading-relaxed text-ink-secondary">
          {looksUnconfigured
            ? "Watchflow reads directly from Neon. Point it at a database to continue:"
            : "The app could not read from Postgres. If this is a fresh database, the migration may not have been applied yet:"}
        </p>

        <ol className="mt-6 flex flex-col gap-3 text-sm leading-relaxed text-ink-secondary">
          {[
            <>
              Copy <Code>.env.example</Code> to <Code>.env.local</Code> and set{" "}
              <Code>DATABASE_URL</Code> to your Neon connection string.
            </>,
            <>
              Apply the schema: <Code>npm run db:migrate</Code>
            </>,
            <>
              Seed the default watchlist: <Code>npm run db:seed</Code>
            </>,
            <>
              Load prices: <Code>python -m watchflow_pipeline</Code> from <Code>pipeline/</Code>,
              or run the GitHub Actions workflow.
            </>,
          ].map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-xs font-medium text-leaf-deep">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <p className="eyebrow mt-8">Underlying error</p>
        <pre className="num mt-2 max-w-full overflow-x-auto rounded-xl border border-hairline bg-subtle px-4 py-3 text-xs text-loss">
          {message}
        </pre>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="num rounded-md bg-sunken px-1.5 py-0.5 text-[0.9em] text-ink">
      {children}
    </code>
  );
}
