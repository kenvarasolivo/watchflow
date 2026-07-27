"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded border border-hairline bg-surface px-6 py-12">
      <h1 className="display text-3xl text-ink">SOMETHING BROKE</h1>
      <p className="max-w-2xl text-sm text-ink-secondary">
        This page failed to render. If this is a fresh deployment, check that{" "}
        <code className="num text-ink">DATABASE_URL</code> is set and the migration has been
        applied.
      </p>
      <pre className="num max-w-full overflow-x-auto rounded border border-hairline bg-plane px-3 py-2 text-xs text-loss">
        {error.message}
        {error.digest ? `\ndigest: ${error.digest}` : ""}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="rounded border border-hairline px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-elevated hover:text-ink"
      >
        Try again
      </button>
    </div>
  );
}
