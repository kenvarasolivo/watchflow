"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="shell py-16">
      <div className="max-w-2xl">
        <p className="eyebrow">Error</p>
        <h1 className="display mt-3 text-4xl text-ink">Something broke.</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-secondary">
          This page failed to render. If this is a fresh deployment, check that{" "}
          <code className="num rounded-md bg-sunken px-1.5 py-0.5 text-[0.9em] text-ink">
            DATABASE_URL
          </code>{" "}
          is set and the migration has been applied.
        </p>
        <pre className="num mt-6 max-w-full overflow-x-auto rounded-xl border border-hairline bg-subtle px-4 py-3 text-xs text-loss">
          {error.message}
          {error.digest ? `\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
