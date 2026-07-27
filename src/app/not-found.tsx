import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 rounded border border-hairline bg-surface px-6 py-12">
      <h1 className="display text-4xl text-ink">NOT FOUND</h1>
      <p className="text-sm text-ink-muted">
        That page — or that symbol — does not exist here.
      </p>
      <Link
        href="/"
        className="rounded border border-gain/40 bg-gain/10 px-4 py-2 text-sm text-gain transition-colors hover:bg-gain/20"
      >
        Back to watchlist
      </Link>
    </div>
  );
}
