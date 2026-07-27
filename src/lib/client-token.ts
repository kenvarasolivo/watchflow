"use client";

import { WRITE_TOKEN_HEADER } from "./auth-shared";

export const TOKEN_STORAGE_KEY = "watchflow.writeToken";

/**
 * The write token lives in localStorage rather than a cookie because it is a
 * shared secret typed by the operator, not a session credential issued by the
 * server. v1 has no accounts (explicit non-goal); this is the minimum needed to
 * stop a public demo's watchlist from being editable by anyone who finds it.
 */
export function readWriteToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function saveWriteToken(token: string): void {
  if (typeof window === "undefined") return;
  const trimmed = token.trim();
  if (trimmed) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function writeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = readWriteToken();
  if (token) headers[WRITE_TOKEN_HEADER] = token;
  return headers;
}
