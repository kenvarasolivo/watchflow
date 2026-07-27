export const RANGES = ["30d", "90d", "1y"] as const;

export type Range = (typeof RANGES)[number];

export const DEFAULT_RANGE: Range = "90d";

const RANGE_DAYS: Record<Range, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

export const RANGE_LABELS: Record<Range, string> = {
  "30d": "30D",
  "90d": "90D",
  "1y": "1Y",
};

export function isRange(value: unknown): value is Range {
  return typeof value === "string" && (RANGES as readonly string[]).includes(value);
}

export function parseRange(value: string | null | undefined): Range {
  return isRange(value) ? value : DEFAULT_RANGE;
}

export function rangeDays(range: Range): number {
  return RANGE_DAYS[range];
}

/**
 * Calendar-day cutoff for a range, as an ISO `YYYY-MM-DD` string.
 *
 * Ranges are deliberately calendar-based rather than trading-day based: "30d"
 * means "the last 30 calendar days", which is what a user reading a dashboard
 * means by it. The resulting row count will be smaller (weekends/holidays have
 * no rows) and that is correct, not a gap.
 */
export function rangeStartDate(range: Range, now: Date = new Date()): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - rangeDays(range));
  return start.toISOString().slice(0, 10);
}
