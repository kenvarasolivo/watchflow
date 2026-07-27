import { direction } from "@/lib/format";

/**
 * A 30-point close-price sparkline.
 *
 * Deliberately hand-rolled SVG rather than Recharts: a sparkline has no axes,
 * no legend and no tooltip, so a charting library would ship a responsive
 * container and event layer per table row for no benefit. This renders on the
 * server with zero client JS.
 *
 * Colour follows the sign of the window (first → last close), reusing the
 * reserved gain/loss status tokens. It is decorative reinforcement only — the
 * same information is in the adjacent return column as text, so the sparkline
 * never carries meaning by colour alone.
 */
export function Sparkline({
  values,
  width = 104,
  height = 28,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));

  if (clean.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: not enough data for a sparkline`}
        className="overflow-visible"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-baseline)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  // A flat series would divide by zero; render it as a centred horizontal line.
  const span = max - min || 1;
  const padding = 2;
  const usableHeight = height - padding * 2;

  const points = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = padding + (1 - (value - min) / span) * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const trend = direction(clean[clean.length - 1] - clean[0]);
  const stroke =
    trend === "up"
      ? "var(--color-gain)"
      : trend === "down"
        ? "var(--color-loss)"
        : "var(--color-ink-muted)";

  const [lastX, lastY] = points[points.length - 1].split(",").map(Number);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${clean.length}-day close price trend, ${trend === "up" ? "up" : trend === "down" ? "down" : "flat"} over the window`}
      className="overflow-visible"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot with a 2px surface ring, so it stays legible where the
          line doubles back over itself. */}
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} stroke="var(--color-surface)" strokeWidth={2} />
    </svg>
  );
}
