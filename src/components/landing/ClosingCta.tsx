import Link from "next/link";

import { LeafMark } from "@/components/site/Logo";

/**
 * The one place the accent green gets a full-bleed surface.
 *
 * Everything on it is either canvas white or a white tint, so nothing here
 * needs the gain/loss tokens — which keeps green meaning "brand" in this band
 * and "up" everywhere else.
 */
export function ClosingCta() {
  return (
    <section className="bg-leaf-deep text-canvas">
      <div className="shell flex flex-col items-start gap-8 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <LeafMark className="size-9 text-canvas" vein="var(--color-leaf-deep)" />
          <h2 className="display mt-5 text-3xl text-canvas sm:text-4xl">
            Add a ticker. The next run picks it up.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-canvas/75">
            The scheduled job backfills 400 days of history the first time it sees a symbol, then
            goes incremental. Removing a ticker keeps its price history, so putting it back is
            instant.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/watchlist"
            className="rounded-full bg-canvas px-6 py-3 text-base font-medium text-leaf-deep transition-colors hover:bg-canvas/90 focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-leaf-deep focus-visible:outline-none"
          >
            Open the dashboard
          </Link>
          <Link
            href="/performance"
            className="rounded-full border border-canvas/30 px-6 py-3 text-base font-medium text-canvas transition-colors hover:bg-canvas/10 focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-leaf-deep focus-visible:outline-none"
          >
            Compare returns
          </Link>
        </div>
      </div>
    </section>
  );
}
