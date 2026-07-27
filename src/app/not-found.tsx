import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell py-20">
      <div className="max-w-2xl">
        <p className="num text-sm text-ink-muted">404</p>
        <h1 className="display-xl mt-3 text-5xl text-ink sm:text-6xl">Not found.</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-secondary">
          That page — or that symbol — does not exist here. Symbols must match Yahoo Finance
          exactly, so <code className="num text-ink">BRK-B</code> works where{" "}
          <code className="num text-ink">BRK.B</code> does not.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/watchlist"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Back to watchlist
          </Link>
          <Link
            href="/"
            className="rounded-full border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
