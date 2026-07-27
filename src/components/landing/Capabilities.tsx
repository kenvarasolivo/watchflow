/**
 * The engineering surface of the project, stated as capabilities.
 *
 * This is the one inverted band on the landing page — see the gain-inverse /
 * loss-inverse tokens in globals.css, which exist because the normal gain/loss
 * pair measures under 2:1 on ink and is unreadable here.
 *
 * Each card names a discipline and then spends its lines on the specific
 * decisions that back it up. The claim is the heading; the bullets are the
 * evidence, and every one of them is checkable against `pipeline/` or
 * `src/db/schema.ts`.
 */

type Capability = {
  index: string;
  title: string;
  lead: string;
  points: string[];
  /** Mono strip at the foot of the card: the artefact the discipline produced. */
  artifact: React.ReactNode;
};

const CAPABILITIES: Capability[] = [
  {
    index: "01",
    title: "ETL Pipelines",
    lead: "A scheduled Python job in three stages, with a row in the run log whether it succeeds or not.",
    points: [
      "Incremental from each ticker's own watermark, with a five-day overlap so revised bars repair themselves for free.",
      "Idempotent load — INSERT … ON CONFLICT DO UPDATE, one transaction per ticker, so a failure on ticker 15 keeps 1 through 14.",
      "Transport failures retry with full jitter over a browser-grade TLS session. Data failures don't retry at all.",
    ],
    artifact: (
      <>
        extract <span className="text-canvas/35">→</span> transform{" "}
        <span className="text-canvas/35">→</span> load{" "}
        <span className="text-canvas/35">→</span> pipeline_runs
      </>
    ),
  },
  {
    index: "02",
    title: "Data Quality",
    lead: "Every bar is parsed by a Pydantic model before it is allowed anywhere near the database.",
    points: [
      "Prices positive and finite, volume non-negative, and the candle internally coherent — low ≤ open and close ≤ high.",
      "An NYSE trading calendar tells a holiday from a hole, so a closed market is never counted as missing data.",
      "Derived metrics stay null until the window is genuinely full. There is no twelve-day MA-20 anywhere in the table.",
    ],
    artifact: (
      <>
        <span className="text-gain-inverse">✓ accepted</span>{" "}
        <span className="text-canvas/35">·</span>{" "}
        <span className="text-loss-inverse">✕ rejected</span>, counted with a reason
      </>
    ),
  },
  {
    index: "03",
    title: "Relational Data Modeling",
    lead: "Raw facts and derived analytics live in separate tables, joined on a composite key.",
    points: [
      "prices holds immutable OHLCV; metrics holds returns, MA-20/50 and volatility, recomputable without re-fetching a thing.",
      "Composite (ticker, date) primary keys make the upsert its own constraint, with descending indexes cut for the read path.",
      "numeric rather than double precision, so repeated upserts are byte-stable and SQL comparisons stay exact.",
    ],
    artifact: (
      <>
        watchlists <span className="text-canvas/35">→</span> watchlist_tickers{" "}
        <span className="text-canvas/35">·</span> prices{" "}
        <span className="text-canvas/35">·</span> metrics
      </>
    ),
  },
];

export function Capabilities() {
  return (
    <section className="bg-ink text-canvas">
      <div className="shell py-20 sm:py-28">
        {/* Not `.eyebrow`: that class hard-codes the muted ink colour, which is
            unreadable on this surface. */}
        <p className="num text-[0.6875rem] tracking-[0.18em] text-canvas/50 uppercase">
          Under the hood
        </p>
        <h2 className="display mt-4 max-w-3xl text-3xl text-canvas sm:text-5xl">
          Built as a data platform, not a chart page.
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-canvas/65">
          The charts are the last five percent. Everything that makes them trustworthy happens
          before the browser is involved.
        </p>

        <ul className="mt-14 grid gap-5 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <li
              key={capability.title}
              className="flex flex-col rounded-3xl border border-canvas/10 bg-canvas/5 p-7 sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="num text-sm font-medium text-gain-inverse">
                  {capability.index}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-canvas/15" />
              </div>

              <h3 className="display mt-5 text-2xl text-canvas">{capability.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-canvas/70">{capability.lead}</p>

              <ul className="mt-6 flex flex-col gap-3.5">
                {capability.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-3 text-sm leading-relaxed text-canvas/60"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-canvas/30"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              {/* `mt-auto` so the three artefact strips sit on one line across the
                  row even when the bullet copy runs to different depths. */}
              <p className="num mt-auto overflow-x-auto pt-8 text-[0.6875rem] leading-relaxed whitespace-nowrap text-canvas/55">
                {capability.artifact}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
