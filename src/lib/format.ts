const priceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return priceFormatter.format(value);
}

export function formatPercent(
  value: number | null | undefined,
  { signed = true, digits = 2 }: { signed?: boolean; digits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return compactFormatter.format(value);
}

/** `2026-07-24` → `24 Jul` (or `24 Jul 25` when the year differs from now). */
export function formatDayMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const label = `${String(d).padStart(2, "0")} ${months[m - 1]}`;
  return y === new Date().getUTCFullYear() ? label : `${label} ${String(y).slice(2)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** Coarse "3 hours ago" style label for the data-freshness badge. */
export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "never";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "unknown";

  // Negative values (clock skew between the pipeline runner and the web host)
  // fall into this branch too, which is the right answer for a freshness badge.
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 90) return "just now";

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = seconds / 60;
  if (minutes < 60) return formatter.format(-Math.round(minutes), "minute");

  const hours = minutes / 60;
  if (hours < 24) return formatter.format(-Math.round(hours), "hour");

  const days = hours / 24;
  if (days < 30) return formatter.format(-Math.round(days), "day");
  if (days < 365) return formatter.format(-Math.round(days / 30), "month");

  return formatter.format(-Math.round(days / 365), "year");
}

/** Positive / negative / flat, used to pick the gain or loss token. */
export type Direction = "up" | "down" | "flat";

export function direction(value: number | null | undefined): Direction {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}
