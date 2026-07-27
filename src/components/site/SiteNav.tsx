"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/watchlist", label: "Watchlist" },
  { href: "/performance", label: "Performance" },
  { href: "/pipeline", label: "Pipeline" },
] as const;

/**
 * Primary navigation.
 *
 * A client component only because the active item needs the current path.
 * `/ticker/AAPL` marks "Watchlist" as current: the detail page is reached from
 * the watchlist and belongs to it, and a nav with nothing highlighted reads as
 * a broken state rather than as a neutral one.
 */
export function SiteNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav aria-label="Primary">
      <ul className="flex items-center gap-1">
        {NAV.map((item) => {
          const current =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/watchlist" && pathname.startsWith("/ticker"));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none ${
                  current
                    ? "bg-sunken text-ink"
                    : "text-ink-secondary hover:bg-subtle hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
