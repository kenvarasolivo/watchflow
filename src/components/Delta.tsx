import { direction, formatPercent } from "@/lib/format";

const ARROW: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

/**
 * A signed percentage rendered in the gain/loss tokens.
 *
 * The arrow glyph is not decoration: it is the secondary encoding that keeps
 * the value readable when colour is unavailable (CVD, forced-colors, print).
 * The sign is also always printed, so the number alone is unambiguous.
 */
export function Delta({
  value,
  className = "",
  digits = 2,
  showArrow = true,
}: {
  value: number | null | undefined;
  className?: string;
  digits?: number;
  showArrow?: boolean;
}) {
  const dir = direction(value);
  const tone =
    dir === "up" ? "text-gain" : dir === "down" ? "text-loss" : "text-ink-muted";

  return (
    <span className={`num inline-flex items-center gap-1 ${tone} ${className}`}>
      {showArrow && (
        <span aria-hidden="true" className="text-[0.7em] leading-none">
          {ARROW[dir]}
        </span>
      )}
      {formatPercent(value, { digits })}
    </span>
  );
}
