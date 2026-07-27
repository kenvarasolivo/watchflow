/**
 * The leaf mark.
 *
 * Two arcs meeting at opposite points — the simplest shape that still reads as
 * a leaf at 20px, which is the size it actually ships at in the header. Veins
 * were tried and dropped: below ~32px they turn into noise on the fill. The
 * midrib is a cut in the canvas colour rather than a lighter green, so the mark
 * keeps its silhouette when it is scaled down or rendered on a tinted surface.
 */
export function LeafMark({
  className = "size-6",
  /**
   * The midrib is a cut in the surface behind the leaf, so it has to match that
   * surface. Override it anywhere the mark does not sit on canvas — a white
   * leaf on the green band would otherwise lose its midrib entirely.
   */
  vein = "var(--color-canvas)",
}: {
  className?: string;
  vein?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      role="presentation"
    >
      <path
        d="M3.8 20.2c0-9.06 7.34-16.4 16.4-16.4 0 9.06-7.34 16.4-16.4 16.4Z"
        fill="currentColor"
      />
      <path
        d="M5.2 18.8C8.4 13.6 13 9.2 18.4 6.4"
        stroke={vein}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. `mono` renders the mark in the inherited colour.
 *
 * `wordmarkClassName` exists so the header can drop the word on narrow screens
 * and keep only the leaf — three nav items plus the full wordmark do not fit
 * across a 375px viewport, and the alternative was a header that pushed the
 * whole page into horizontal scroll.
 */
export function Logo({
  className = "",
  markClassName = "size-[1.35em]",
  wordmarkClassName = "",
  mono = false,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  mono?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LeafMark className={`shrink-0 ${markClassName} ${mono ? "" : "text-leaf"}`} />
      <span className={`display font-bold tracking-[-0.035em] ${wordmarkClassName}`}>
        Watchflow
      </span>
    </span>
  );
}
