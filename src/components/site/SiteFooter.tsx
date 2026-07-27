import Link from "next/link";

import { Logo } from "@/components/site/Logo";

const COLUMNS = [
  {
    heading: "Dashboard",
    links: [
      { href: "/watchlist", label: "Watchlist" },
      { href: "/performance", label: "Performance" },
      { href: "/pipeline", label: "Run log" },
    ],
  },
  {
    heading: "API",
    links: [
      { href: "/api/watchlist", label: "GET /api/watchlist" },
      { href: "/api/watchlist/performance", label: "GET /api/watchlist/performance" },
      { href: "/api/pipeline/status", label: "GET /api/pipeline/status" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline bg-subtle">
      <div className="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo className="text-xl text-ink" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-secondary">
            End-of-day watchlist analytics, fed by a scheduled ETL pipeline that logs every run
            it makes — including the ones that went wrong.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h2 className="eyebrow">{column.heading}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-secondary transition-colors hover:text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:outline-none"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-hairline">
        <div className="shell flex flex-col gap-2 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Daily OHLCV from Yahoo Finance via a scheduled GitHub Actions pipeline. Prices are
            end-of-day, not real time.
          </p>
          <p className="num">Nothing here is investment advice.</p>
        </div>
      </div>
    </footer>
  );
}
