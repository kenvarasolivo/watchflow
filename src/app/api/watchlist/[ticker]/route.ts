import { NextResponse } from "next/server";

import { removeTicker } from "@/db/queries";
import { authorizeWrite } from "@/lib/auth";
import { normaliseTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/watchlist/:ticker — stop tracking a ticker.
 *
 * Price and metric history is deliberately left in place. Removing a ticker is
 * a change to what the user watches, not an instruction to destroy ingested
 * data; re-adding it later should not require refetching a year of history.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  const auth = authorizeWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { ticker: rawTicker } = await context.params;
  const normalised = normaliseTicker(decodeURIComponent(rawTicker));
  if (!normalised.ok) {
    return NextResponse.json({ error: normalised.error }, { status: 400 });
  }

  try {
    const { removed } = await removeTicker(normalised.ticker);
    if (!removed) {
      return NextResponse.json(
        { error: `${normalised.ticker} is not on the watchlist.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ticker: normalised.ticker, removed: true });
  } catch (error) {
    console.error("Failed to remove ticker.", error);
    const message = error instanceof Error ? error.message : "Failed to remove ticker.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
