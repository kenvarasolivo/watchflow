import { NextResponse } from "next/server";

import { getTickerSeries } from "@/db/queries";
import { parseRange } from "@/lib/range";
import { normaliseTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/prices/:ticker?range=30d|90d|1y — OHLCV plus derived metrics. */
export async function GET(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  const { ticker: rawTicker } = await context.params;
  const normalised = normaliseTicker(decodeURIComponent(rawTicker));
  if (!normalised.ok) {
    return NextResponse.json({ error: normalised.error }, { status: 400 });
  }

  const range = parseRange(new URL(request.url).searchParams.get("range"));

  try {
    const series = await getTickerSeries(normalised.ticker, range);
    return NextResponse.json({ ticker: normalised.ticker, range, series });
  } catch (error) {
    console.error("Failed to load price series.", error);
    const message = error instanceof Error ? error.message : "Failed to load price series.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
