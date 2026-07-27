import { direction } from "@/lib/format";

/**
 * A 30-point close-price sparkline.
 *
 * Deliberately hand-rolled SVG rather than Recharts: a sparkline has no axes,
 * no legend and no tooltip, so a charting library would ship a responsive
 * container and event layer per table row for no benefit. This renders on the
 * server with zero client JS.
 *
 * The area under the line is a flat fill at 8% rather than a gradient, so the
 * component needs no `<defs>` and therefore no unique id — the same ticker can
 * appear twice on a page (marquee and card) without two gradients colliding.
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
  area = true,
  strokeWidth = 1.5,
  className = "overflow-visible",
}: {
  values: number[];
  width?: number;
  height?: number;
  label: string;
  area?: boolean;
  strokeWidth?: number;
  /**
   * `width`/`height` stay the intrinsic size. Pass `h-auto w-full` here to let
   * the SVG scale to its container instead — the viewBox keeps the aspect ratio,
   * so the line is never squashed.
   */
  className?: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));

  if (clean.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}: not enough data for a sparkline`}
        className={className}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-baseline)"
          strokeWidth={1}
          strokeDasharray="3 3"
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

  const coords = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = padding + (1 - (value - min) / span) * usableHeight;
    return [x, y] as const;
  });

  const points = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);

  const trend = direction(clean[clean.length - 1] - clean[0]);
  const stroke =
    trend === "up"
      ? "var(--color-gain)"
      : trend === "down"
        ? "var(--color-loss)"
        : "var(--color-ink-muted)";

  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${clean.length}-day close price trend, ${trend === "up" ? "up" : trend === "down" ? "down" : "flat"} over the window`}
      className={className}
    >
      {area && (
        <polygon
          points={`0,${height} ${points.join(" ")} ${width},${height}`}
          fill={stroke}
          fillOpacity={0.08}
        />
      )}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot with a 2px canvas ring, so it stays legible where the
          line doubles back over itself. */}
      <circle
        cx={lastX}
        cy={lastY}
        r={2.5}
        fill={stroke}
        stroke="var(--color-canvas)"
        strokeWidth={2}
      />
    </svg>
  );
}
