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
    <div className="rounded border border-hairline bg-surface px-4 py-3">
      <p className="text-[0.7rem] tracking-widest text-ink-muted uppercase">{label}</p>
      <p className={`num-hero mt-1.5 text-2xl ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
