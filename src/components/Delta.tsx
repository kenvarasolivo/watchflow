import { direction, formatPercent } from "@/lib/format";

const ARROW: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

/**
 * A signed percentage rendered in the gain/loss tokens.
 *
 * The arrow glyph is not decoration: gain and loss separate by ΔE 26.6 for
 * normal vision but only 7.8 under deuteranopia, so the arrow is the secondary
 * encoding that keeps the value readable when colour is unavailable (CVD,
 * forced-colors, print). The sign is also always printed, so the number alone
 * is unambiguous.
 *
 * `variant="pill"` puts the same value on a tinted chip for use in cards and
 * headers, where a bare coloured number floats without an anchor.
 */
export function Delta({
  value,
  className = "",
  digits = 2,
  showArrow = true,
  variant = "text",
}: {
  value: number | null | undefined;
  className?: string;
  digits?: number;
  showArrow?: boolean;
  variant?: "text" | "pill";
}) {
  const dir = direction(value);

  const tone =
    dir === "up" ? "text-gain" : dir === "down" ? "text-loss" : "text-ink-muted";

  const chrome =
    variant === "pill"
      ? `rounded-full px-2 py-0.5 ${
          dir === "up" ? "bg-gain/10" : dir === "down" ? "bg-loss/10" : "bg-sunken"
        }`
      : "";

  return (
    <span
      className={`num inline-flex items-center gap-1 font-medium ${tone} ${chrome} ${className}`}
    >
      {showArrow && (
        <span aria-hidden="true" className="text-[0.7em] leading-none">
          {ARROW[dir]}
        </span>
      )}
      {formatPercent(value, { digits })}
    </span>
  );
}
