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
      className="inline-flex items-center gap-0.5 rounded-full border border-hairline bg-subtle p-1"
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
            className={`num rounded-full px-3.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none ${
              isActive
                ? "bg-canvas text-ink shadow-[0_1px_2px_rgba(10,10,10,0.06)]"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {RANGE_LABELS[range]}
          </Link>
        );
      })}
    </div>
  );
}
