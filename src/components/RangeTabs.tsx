import Link from "next/link";

import { RANGES, RANGE_LABELS, type Range } from "@/lib/range";

/**
 * Range filter, rendered as links rather than client-side state.
 *
 * The range is part of the URL, so a chosen window is shareable and the server
 * component re-queries with the right cutoff. This also keeps a single filter
 * row above everything it scopes — charts and tables on the page all re-render
 * against the same slice rather than each holding its own control.
 */
export function RangeTabs({
  active,
  basePath,
  label = "Time range",
}: {
  active: Range;
  basePath: string;
  label?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded border border-hairline bg-surface p-0.5"
      role="group"
      aria-label={label}
    >
      {RANGES.map((range) => {
        const isActive = range === active;
        return (
          <Link
            key={range}
            href={`${basePath}?range=${range}`}
            aria-current={isActive ? "true" : undefined}
            scroll={false}
            className={`num rounded px-3 py-1 text-xs tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-gain focus-visible:outline-none ${
              isActive
                ? "bg-elevated text-ink"
                : "text-ink-muted hover:bg-elevated/60 hover:text-ink-secondary"
            }`}
          >
            {RANGE_LABELS[range]}
          </Link>
        );
      })}
    </div>
  );
}
