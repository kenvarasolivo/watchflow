import { NextResponse } from "next/server";

import { getWatchlistPerformance } from "@/db/queries";
import { parseRange } from "@/lib/range";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/watchlist/performance?range=30d|90d|1y
 *
 * Note this route file shadows `/api/watchlist/[ticker]` for the literal path
 * segment "performance" — Next.js resolves static segments before dynamic ones,
 * which is exactly what we want here. "PERFORMANCE" is not a real symbol, so
 * nothing is lost.
 */
export async function GET(request: Request) {
  const range = parseRange(new URL(request.url).searchParams.get("range"));

  try {
    const rows = await getWatchlistPerformance(range);
    return NextResponse.json({ range, rows });
  } catch (error) {
    console.error("Failed to load watchlist performance.", error);
    const message =
      error instanceof Error ? error.message : "Failed to load watchlist performance.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
