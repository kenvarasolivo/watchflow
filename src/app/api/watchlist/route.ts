import { NextResponse } from "next/server";

import { addTicker, getWatchlistOverview, isOnWatchlist } from "@/db/queries";
import { authorizeWrite, writesAreGated } from "@/lib/auth";
import { companyName } from "@/lib/companies";
import { normaliseTicker } from "@/lib/ticker";
import { checkSymbol } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/watchlist — tracked tickers with their latest price and sparkline. */
export async function GET() {
  try {
    const rows = await getWatchlistOverview();
    return NextResponse.json({ tickers: rows, gated: writesAreGated() });
  } catch (error) {
    return errorResponse(error, "Failed to load watchlist.");
  }
}

/** POST /api/watchlist — add a ticker after validating the symbol exists. */
export async function POST(request: Request) {
  const auth = authorizeWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const raw = (body as { ticker?: unknown } | null)?.ticker;
  const normalised = normaliseTicker(raw);
  if (!normalised.ok) {
    return NextResponse.json({ error: normalised.error }, { status: 400 });
  }
  const { ticker } = normalised;

  try {
    if (await isOnWatchlist(ticker)) {
      return NextResponse.json(
        { error: `${ticker} is already on the watchlist.` },
        { status: 409 },
      );
    }

    const check = await checkSymbol(ticker);
    if (check.status === "invalid") {
      return NextResponse.json({ error: check.reason }, { status: 422 });
    }

    // Only a confirmed match is persisted. An `unknown` lookup means Yahoo was
    // unreachable or rate-limited, not that the company has no name — storing a
    // guess there would make the column indistinguishable from the local name
    // table it is supposed to outrank. Nulls are covered at render time.
    const resolvedName = check.status === "valid" ? check.name : null;

    const { added } = await addTicker(ticker, resolvedName);
    if (!added) {
      return NextResponse.json(
        { error: `${ticker} is already on the watchlist.` },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ticker,
        name: companyName(ticker, resolvedName),
        exchange: check.status === "valid" ? check.exchange : null,
        // Surfaced so the UI can say "added, but we could not confirm the symbol
        // with Yahoo right now" instead of implying it was fully verified.
        verified: check.status === "valid",
        verificationNote: check.status === "unknown" ? check.reason : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Failed to add ticker.");
  }
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
