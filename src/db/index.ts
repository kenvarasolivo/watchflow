import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string.",
    );
  }
  return url;
}

/**
 * A single HTTP-backed Drizzle client. `neon-http` issues one fetch per query,
 * which is the right shape for Vercel's serverless functions — there is no
 * connection pool to exhaust and no socket to leak between invocations.
 *
 * Constructed lazily so that importing this module during `next build` (which
 * happens for every route file) does not require DATABASE_URL to be present at
 * build time.
 */
let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!cached) {
    cached = drizzle(neon(connectionString()), { schema });
  }
  return cached;
}

export { schema };
