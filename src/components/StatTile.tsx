import { direction } from "@/lib/format";

/**
 * A single number with its label. Used where the story is one value and a chart
 * would be ceremony around it.
 *
 * `tone="delta"` colours the value with the gain/loss tokens; every other tile
 * keeps its value in primary ink, because colour there would imply a polarity
 * the number does not have (a volatility of 22% is neither good nor bad).
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  signedValue,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "delta";
  signedValue?: number | null;
}) {
  const dir = direction(signedValue);
  const valueTone =
    tone === "delta"
      ? dir === "up"
        ? "text-gain"
        : dir === "down"
          ? "text-loss"
          : "text-ink-muted"
      : "text-ink";

  return (
    <div className="rounded-xl border border-hairline bg-canvas px-5 py-4">
      <p className="eyebrow">{label}</p>
      <p className={`num-hero mt-2 text-2xl font-medium ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
