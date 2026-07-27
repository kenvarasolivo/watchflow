import type { Metadata } from "next";
import { Bebas_Neue, DM_Mono, Inter } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Watchflow — watchlist analytics",
  description:
    "Daily OHLCV ingestion, derived metrics and watchlist performance analytics, fed by a scheduled ETL pipeline.",
};

const NAV = [
  { href: "/", label: "Watchlist" },
  { href: "/performance", label: "Performance" },
  { href: "/pipeline", label: "Pipeline" },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${dmMono.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-plane text-ink">
        <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-5 sm:px-8">
          <header className="flex flex-col gap-4 border-b border-hairline py-5 sm:flex-row sm:items-end sm:justify-between">
            <Link href="/" className="group flex items-baseline gap-3">
              <span className="display text-4xl text-ink sm:text-5xl">WATCHFLOW</span>
              <span className="hidden text-xs tracking-widest text-ink-muted uppercase sm:inline">
                watchlist analytics
              </span>
            </Link>

            <nav className="flex items-center gap-1" aria-label="Primary">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-3 py-1.5 text-sm text-ink-secondary transition-colors hover:bg-elevated hover:text-ink focus-visible:ring-2 focus-visible:ring-gain focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="flex-1 py-7">{children}</main>

          <footer className="border-t border-hairline py-5 text-xs text-ink-muted">
            <p>
              Daily OHLCV from Yahoo Finance via a scheduled GitHub Actions pipeline. Prices are
              end-of-day, not real time. Nothing here is investment advice.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
