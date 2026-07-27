import { NextResponse } from "next/server";

import { getLatestPipelineRun } from "@/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/pipeline/status — most recent pipeline run, for the freshness badge. */
export async function GET() {
  try {
    const run = await getLatestPipelineRun();
    return NextResponse.json({ run });
  } catch (error) {
    console.error("Failed to load pipeline status.", error);
    const message = error instanceof Error ? error.message : "Failed to load pipeline status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
