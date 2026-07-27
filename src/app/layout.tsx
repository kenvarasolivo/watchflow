import type { Metadata } from "next";
import { DM_Mono, Inter, Inter_Tight } from "next/font/google";
import Link from "next/link";

import { Logo } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Watchflow — watchlist analytics with a visible pipeline",
    template: "%s · Watchflow",
  },
  description:
    "Daily OHLCV ingestion, derived metrics and watchlist performance analytics, fed by a scheduled ETL pipeline that logs every run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable} ${dmMono.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-canvas text-ink">
        {/* Keyboard users land here first; the header nav is three links deep on
            every page, and the landing page puts a lot of prose above the app. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-canvas"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-md">
          <div className="shell flex h-16 items-center gap-3">
            <Link
              href="/"
              className="shrink-0 rounded-lg text-lg text-ink focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label="Watchflow — home"
            >
              <Logo wordmarkClassName="hidden sm:inline" />
            </Link>

            {/* min-w-0 + overflow-x-auto so an unexpectedly wide nav scrolls
                itself rather than widening the document. */}
            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
              <div className="min-w-0 overflow-x-auto">
                <SiteNav />
              </div>
              <Link
                href="/watchlist"
                className="hidden shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink-secondary focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none md:inline-flex"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        </header>

        {/* min-w-0 so a single wide table on one page can never widen the
            document for the header and footer as well. */}
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
