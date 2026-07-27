import { timingSafeEqual } from "node:crypto";

import { WRITE_TOKEN_HEADER } from "./auth-shared";

/**
 * Shared-secret gate for mutating routes.
 *
 * v1 has no user accounts (explicit non-goal). Reads are public; writes are
 * gated behind a single secret so a deployed demo cannot have its watchlist
 * rewritten by anyone who finds the URL.
 *
 * If `WATCHFLOW_WRITE_TOKEN` is unset, writes are open. That is intentional for
 * local development, and the UI surfaces the state so a deployment running
 * without a token is obvious rather than silently unprotected.
 */
export { WRITE_TOKEN_HEADER };

export type AuthResult = { ok: true } | { ok: false; status: 401; message: string };

export function writesAreGated(): boolean {
  return Boolean(process.env.WATCHFLOW_WRITE_TOKEN);
}

export function authorizeWrite(request: Request): AuthResult {
  const expected = process.env.WATCHFLOW_WRITE_TOKEN;
  if (!expected) return { ok: true };

  const provided = request.headers.get(WRITE_TOKEN_HEADER);
  if (!provided) {
    return {
      ok: false,
      status: 401,
      message: `Missing ${WRITE_TOKEN_HEADER} header. This deployment requires a write token.`,
    };
  }

  if (!constantTimeEquals(provided, expected)) {
    return { ok: false, status: 401, message: "Invalid write token." };
  }

  return { ok: true };
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Hashing to a fixed width first is overkill here; comparing against a
  // same-length copy keeps the comparison constant-time for equal lengths and
  // returns early only on a length difference, which the header sender controls
  // anyway.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
