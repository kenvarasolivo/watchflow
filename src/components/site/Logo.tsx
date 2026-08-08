/**
 * The owl mark.
 *
 * An owl for a project called Watchflow: it is the bird that keeps watch, and
 * this pipeline literally runs the night shift — 22:00 UTC on weekdays, after
 * the US close.
 *
 * Getting it to read as an *owl* rather than a cat took the three details
 * below, all of which are load-bearing at 24px (the size it actually ships at
 * in the header and footer):
 *
 *  1. **No corner ear tufts.** Points at the top corners of a round head read
 *     as a cat every time, at every size. This is a barn owl, which has none.
 *  2. **The facial disc.** The heart-shaped cut-out is the single strongest
 *     owl signal, and because it is negative space it survives being scaled
 *     down long after the pupils have merged into it.
 *  3. **The beak.** A small downward wedge between and below the eyes — the
 *     detail that stops two dots on a circle from reading as a generic face.
 *
 * It is one path with `fill-rule="evenodd"`, so the disc is a genuine hole and
 * the pupils and beak are solid again inside it. That means the mark needs no
 * background-colour prop: whatever surface it sits on shows through the disc,
 * so it inverts correctly on the green band and the ink band for free.
 *
 * The same path is copied into src/app/icon.svg for the favicon, which has to
 * be a static file Next can find by name and so cannot import it. Redraw one,
 * redraw the other.
 */
export function OwlMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      role="presentation"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={
          // head
          "M12 2.2C6.9 2.2 2.7 6.4 2.7 11.5v1.6C2.7 18.2 6.9 22 12 22s9.3-3.8 9.3-8.9v-1.6c0-5.1-4.2-9.3-9.3-9.3Z" +
          // facial disc (hole)
          " M12 7.6c2.4-2.8 7-1.4 7 2.5 0 4.1-3.2 7.9-7 7.9S5 14.2 5 10.1c0-3.9 4.6-5.3 7-2.5Z" +
          // pupils (solid again inside the disc)
          " M9.3 8.8a2 2 0 1 1 0 4 2 2 0 1 1 0-4Z" +
          " M14.7 8.8a2 2 0 1 1 0 4 2 2 0 1 1 0-4Z" +
          // beak
          " M10.7 13.5h2.6L12 16.5Z"
        }
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. `mono` renders the mark in the inherited colour.
 *
 * `wordmarkClassName` exists so the header can drop the word on narrow screens
 * and keep only the owl — three nav items plus the full wordmark do not fit
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
      <OwlMark className={`shrink-0 ${markClassName} ${mono ? "" : "text-leaf"}`} />
      <span className={`display font-bold tracking-[-0.035em] ${wordmarkClassName}`}>
        Watchflow
      </span>
    </span>
  );
}
