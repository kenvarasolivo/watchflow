const STEPS = [
  {
    step: "01",
    title: "Extract",
    lead: "yfinance over a Chrome TLS fingerprint, once per weekday after the US close.",
    points: [
      "Incremental from each ticker's own watermark, with a five-day overlap so revised bars get repaired for free.",
      "Tickers sharing a start date are batched; tickers with different windows never are.",
      "Transport failures retry with full jitter. Data failures don't retry at all.",
    ],
  },
  {
    step: "02",
    title: "Transform",
    lead: "Every bar is parsed by a Pydantic model before it is allowed anywhere near the database.",
    points: [
      "Prices positive and finite, volume non-negative, and the candle internally coherent.",
      "An NYSE calendar tells a holiday from a hole — weekends are not missing data.",
      "Returns, MA-20/50 and 30-day volatility, all null until the window is genuinely full.",
    ],
  },
  {
    step: "03",
    title: "Load",
    lead: "INSERT … ON CONFLICT DO UPDATE, one transaction per ticker.",
    points: [
      "Re-running over a loaded range rewrites byte-identical rows. It cannot duplicate.",
      "A failure on ticker 15 does not roll back tickers 1 through 14.",
      "The run log row is opened before the work starts, so a run that dies hard still leaves evidence.",
    ],
  },
] as const;

/**
 * How the data gets here.
 *
 * Written as three specific claims rather than three verbs, because the
 * interesting part of this project is the decisions, not the fact that an ETL
 * job has an extract step.
 */
export function HowItWorks() {
  return (
    <section className="border-t border-hairline bg-subtle">
      <div className="shell py-16 sm:py-24">
        <p className="eyebrow">How the numbers get here</p>
        <h2 className="display mt-3 max-w-2xl text-3xl text-ink sm:text-4xl">
          One scheduled job. Three steps. A row in the log either way.
        </h2>

        <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {STEPS.map((step) => (
            <li key={step.step} className="relative">
              {/* The rule sits above the number and stops at the column edge,
                  so the three steps read as a sequence on wide screens without
                  drawing a connector that lies about being clickable. */}
              <div className="flex items-center gap-3">
                <span className="num text-sm font-medium text-leaf">{step.step}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-baseline" />
              </div>

              <h3 className="display mt-5 text-2xl text-ink">{step.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-ink-secondary">{step.lead}</p>

              <ul className="mt-5 flex flex-col gap-3">
                {step.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-ink-secondary">
                    <span
                      aria-hidden="true"
                      className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-leaf"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
