import { direction } from "@/lib/format";

const ARROW: Record<string, string> = { up: "▲", down: "▼", flat: "—" };

/**
 * A single number with its label. Used where the story is one value and a chart
 * would be ceremony around it.
 *
 * `tone="delta"` colours the value with the gain/loss tokens; every other tile
 * keeps its value in primary ink, because colour there would imply a polarity
 * the number does not have (a volatility of 22% is neither good nor bad).
 *
 * `tinted` additionally fills the whole card with the gain or loss tint, for the
 * one figure on a page that should be findable without reading anything. It is
 * opt-in rather than the default for `tone="delta"` because tinting a row of
 * three spends the same signal three times and then none of them is the one
 * that stands out. A tinted tile also gains an arrow, on the rule that the
 * larger the colour field the less it may be the only thing saying "up" — the
 * label and hint step up out of ink-muted automatically, in `.tint-*`.
 *
 * A tile with nothing to show ("—") or a flat value never tints: there is no
 * direction to announce, and a grey-bordered card is the honest rendering.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  signedValue,
  tinted = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "delta";
  signedValue?: number | null;
  tinted?: boolean;
}) {
  const dir = direction(signedValue);
  const isDelta = tone === "delta";
  const onTint = isDelta && tinted && dir !== "flat";

  const valueTone = isDelta
    ? dir === "up"
      ? "text-gain"
      : dir === "down"
        ? "text-loss"
        : "text-ink-muted"
    : "text-ink";

  const surface = onTint
    ? dir === "up"
      ? "tint-gain"
      : "tint-loss"
    : "border-hairline bg-canvas";

  return (
    <div className={`rounded-xl border px-5 py-4 ${surface}`}>
      <p className="eyebrow">{label}</p>
      <p className={`num-hero mt-2 text-2xl font-medium ${valueTone}`}>
        {onTint && (
          <span aria-hidden="true" className="mr-1.5 text-[0.72em]">
            {ARROW[dir]}
          </span>
        )}
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
