/**
 * Split out from `auth.ts` so the header name can be imported by client code
 * without dragging `node:crypto` into the browser bundle.
 */
export const WRITE_TOKEN_HEADER = "x-watchflow-token";
