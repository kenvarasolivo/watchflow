import type { ForecastRecord, ForecastRow } from "@/db/queries";
import { Delta } from "@/components/Delta";
import { direction, formatDayMonth, formatPercent, formatPrice } from "@/lib/format";

/**
 * The next session's expected range, shown with the record it has earned.
 *
 * Two rules govern everything here.
 *
 * **The band is the product, not the centre.** Next-day direction in a liquid
 * equity is close to a coin flip; the *scale* of the next move is genuinely
 * forecastable, because volatility clusters. So the headline is the interval
 * and the central estimate is rendered as a tick inside it rather than as a
 * number in display type. Leading with the centre would sell the one part of
 * this that carries almost no information.
 *
 * The band panel is tinted gain or loss by that centre, which is in tension
 * with the rule above and is worth being explicit about: the tint is a *find
 * me* affordance, not a confidence claim. It answers "which way does the model
 * lean" at a glance on a page where the reader has already scrolled past four
 * stat tiles and two charts. What keeps it honest is that nothing else grew to
 * match — the drift is still capped at a quarter sigma upstream, the centre is
 * still a tick rather than display type, and the signed delta beside the
 * midpoint states how small the lean actually is. A reader who takes the colour
 * as a forecast of direction is contradicted by the two lines under it.
 *
 * **The track record is not optional chrome.** A forecast shown without its
 * realised accuracy is asking to be trusted; shown with it, the reader can
 * decide. The scoring panel therefore renders even when the numbers are
 * unflattering, states the miss rate in the same type size as the hit rate, and
 * compares the model against the random walk it has to beat to be worth
 * anything. If it is losing to "tomorrow closes where today closed", the card
 * says that in words.
 *
 * Gain/loss green and red stay out of the calibration chips. In this panel the
 * axis is hit versus miss, not up versus down, and reusing the direction
 * tokens for a second meaning would make both ambiguous — a green "in band" on
 * a row whose realised return is negative reads as a contradiction. The chips
 * borrow the neutral and attention tones the pipeline page already uses.
 */

/** A one-sigma band should contain about this share of outcomes. */
const EXPECTED_HIT_RATE = 68;

/**
 * Scored forecasts before calibration is worth a verdict. With ten samples the
 * 95% interval around a 68% rate still spans roughly 35–90 points, so any
 * confident statement below this is noise wearing a percentage sign.
 */
const MIN_SCORED_FOR_VERDICT = 20;

export function ForecastCard({
  forecast,
  record,
  history,
  ticker,
}: {
  forecast: ForecastRow | null;
  record: ForecastRecord;
  history: ForecastRow[];
  ticker: string;
}) {
  if (forecast === null && record.scored === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-10 text-center">
        <p className="eyebrow">Next session</p>
        <p className="display mt-2 text-xl text-ink">No forecast yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-secondary">
          {ticker} needs about 30 sessions of history before a range can be estimated from its
          own volatility. The next pipeline run will produce one once it has them.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="forecast-heading"
      className="rounded-2xl border border-hairline bg-canvas"
    >
      <header className="border-b border-hairline px-6 py-5">
        <p className="eyebrow">Next session</p>
        <h2 id="forecast-heading" className="display mt-1.5 text-xl text-ink">
          {forecast
            ? `Expected range for ${formatDayMonth(forecast.targetDate)}`
            : "Awaiting the next forecast"}
        </h2>
      </header>

      {forecast && <ForecastBand forecast={forecast} />}

      <Calibration record={record} />

      {history.length > 0 && <TrackRecord history={history} />}
    </section>
  );
}

/**
 * The band itself, as a rail with the close and the central estimate on it.
 *
 * The panel's tint follows the midpoint against the last settled close — the
 * same quantity the "Drift applied" figure reports — so "rising" here means the
 * model leans up from where the stock actually closed, not that the whole
 * interval sits above it. A band that straddles the close, which is the usual
 * case, still tints; a drift of exactly zero does not.
 */
function ForecastBand({ forecast }: { forecast: ForecastRow }) {
  // The rail is padded past the band so the endpoints are not flush with the
  // edge, which would read as "the range is cut off here".
  const span = forecast.high - forecast.low;
  const pad = span * 0.45;
  const railLow = Math.min(forecast.low, forecast.basisClose) - pad;
  const railHigh = Math.max(forecast.high, forecast.basisClose) + pad;
  const width = railHigh - railLow;

  const position = (value: number) =>
    width > 0 ? ((value - railLow) / width) * 100 : 50;

  const centralReturn =
    forecast.basisClose > 0
      ? ((forecast.central - forecast.basisClose) / forecast.basisClose) * 100
      : null;

  const lean = direction(centralReturn);
  const tint = lean === "up" ? "tint-gain" : lean === "down" ? "tint-loss" : "";

  return (
    // No rounding and no border: the panel is a middle slice of the card, and
    // the header above and the track record below already sit on hairlines.
    <div className={`px-6 py-6 ${tint}`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <p className="num-hero text-2xl font-medium text-ink">
            {formatPrice(forecast.low)} – {formatPrice(forecast.high)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Roughly a 68% chance the close lands in here, if the last{" "}
            {forecast.sampleSize} sessions describe the next one.
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="eyebrow">Midpoint</p>
          {/*
            The tint's non-colour twin. It was a muted parenthetical before the
            panel carried a colour; now that the surface says "up", the arrow
            and sign have to say it too for anyone the colour does not reach.
          */}
          <p className="num mt-1 flex items-baseline justify-end gap-2 text-sm font-medium text-ink">
            <span>{formatPrice(forecast.central)}</span>
            {centralReturn !== null && <Delta value={centralReturn} className="text-xs" />}
          </p>
        </div>
      </div>

      {/*
       * The rail is decorative — every value on it is printed in text above and
       * below — so it is hidden from assistive tech rather than given an
       * elaborate description that would restate the same three numbers.
       */}
      <div aria-hidden="true" className="mt-7 mb-2">
        <div className="relative h-2 rounded-full bg-sunken">
          <div
            className="absolute inset-y-0 rounded-full bg-baseline"
            style={{
              left: `${position(forecast.low)}%`,
              width: `${position(forecast.high) - position(forecast.low)}%`,
            }}
          />
          {/* Central estimate: a full-height tick, the darkest mark on the rail. */}
          <div
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink"
            style={{ left: `${position(forecast.central)}%` }}
          />
          {/* Last settled close, so the band is read as movement from somewhere. */}
          <div
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-leaf"
            style={{ left: `${position(forecast.basisClose)}%` }}
          />
        </div>

        <div className="num relative mt-2 h-4 text-[0.6875rem] text-ink-muted">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${position(forecast.low)}%` }}
          >
            {formatPrice(forecast.low)}
          </span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${position(forecast.high)}%` }}
          >
            {formatPrice(forecast.high)}
          </span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-grid pt-4 sm:grid-cols-4">
        <Figure
          label="From"
          value={formatPrice(forecast.basisClose)}
          hint={`Close of ${formatDayMonth(forecast.basisDate)}`}
        />
        <Figure
          label="Typical session"
          value={`±${forecast.sigmaPct.toFixed(2)}%`}
          hint="One standard deviation"
        />
        <Figure
          label="Drift applied"
          value={formatPercent(forecast.driftPct)}
          hint="Capped at ¼ sigma"
        />
        <Figure
          label="Estimated from"
          value={`${forecast.sampleSize} sessions`}
          hint="Trailing log returns"
        />
      </dl>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-1 text-sm font-medium text-ink">{value}</dd>
      <dd className="mt-0.5 text-xs leading-relaxed text-ink-muted">{hint}</dd>
    </div>
  );
}

/** The scoreboard: how the band and its midpoint have actually done. */
function Calibration({ record }: { record: ForecastRecord }) {
  if (record.scored === 0) {
    return (
      <div className="border-t border-hairline px-6 py-5">
        <h3 className="eyebrow">Track record</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          No forecast has been graded yet. Each one is stored before its session happens and
          compared against the real close afterwards, so this fills in on its own.
        </p>
      </div>
    );
  }

  const hitRate = record.hitRatePct;
  const beatsBaseline =
    record.meanAbsErrorPct !== null &&
    record.baselineAbsErrorPct !== null &&
    record.meanAbsErrorPct < record.baselineAbsErrorPct;

  return (
    <div className="border-t border-hairline px-6 py-5">
      <h3 className="eyebrow">Track record</h3>

      <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <p className="num-hero text-2xl font-medium text-ink">
            {hitRate === null ? "—" : `${hitRate.toFixed(0)}%`}
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            {record.hits} of {record.scored} closes landed inside the band.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {calibrationVerdict(hitRate, record.scored)}
          </p>
        </div>

        <div>
          <p className="num-hero text-2xl font-medium text-ink">
            {record.meanAbsErrorPct === null ? "—" : `${record.meanAbsErrorPct.toFixed(2)}%`}
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            Average miss of the midpoint
            {record.baselineAbsErrorPct !== null &&
              `, against ${record.baselineAbsErrorPct.toFixed(2)}% for holding the previous close`}
            .
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {record.baselineAbsErrorPct === null
              ? "Nothing to compare against yet."
              : beatsBaseline
                ? "The midpoint is beating a random walk, narrowly. Do not read much into that: on daily data the gap between the two is mostly noise."
                : "A random walk is doing at least as well, which is the expected outcome for next-day forecasting. The band width is where the information is."}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Say what the hit rate means, without overclaiming from a short sample.
 *
 * A rate far from 68% is only informative once there are enough graded
 * forecasts for it to be distinguishable from chance, so below that threshold
 * this reports the count and declines to draw a conclusion.
 */
function calibrationVerdict(hitRate: number | null, scored: number): string {
  if (hitRate === null) return "";
  if (scored < MIN_SCORED_FOR_VERDICT) {
    return `Too few graded forecasts to judge calibration — ${MIN_SCORED_FOR_VERDICT} is the point where this number starts to mean something.`;
  }
  const drift = hitRate - EXPECTED_HIT_RATE;
  if (Math.abs(drift) <= 8) {
    return `Close to the ${EXPECTED_HIT_RATE}% a one-sigma band should hit — the range is about the right width.`;
  }
  return drift < 0
    ? `Below the ${EXPECTED_HIT_RATE}% a one-sigma band should hit, so the range has been running too narrow for this stock.`
    : `Above the ${EXPECTED_HIT_RATE}% a one-sigma band should hit, so the range has been wider than it needed to be.`;
}

/** The last few graded forecasts, one row each. */
function TrackRecord({ history }: { history: ForecastRow[] }) {
  return (
    <div className="border-t border-hairline px-6 py-5">
      <h3 className="eyebrow">Recently graded</h3>
      <div className="mt-3 -mx-2 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-grid text-left">
              <Th>Session</Th>
              <Th align="right">Forecast range</Th>
              <Th align="right">Closed</Th>
              <Th align="right">Move</Th>
              <Th align="right">Result</Th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.targetDate} className="border-b border-grid last:border-0">
                <td className="num px-2 py-2.5 text-ink-secondary">
                  {formatDayMonth(row.targetDate)}
                </td>
                <td className="num px-2 py-2.5 text-right text-ink-muted">
                  {formatPrice(row.low)} – {formatPrice(row.high)}
                </td>
                <td className="num px-2 py-2.5 text-right font-medium text-ink">
                  {formatPrice(row.actualClose)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <Delta value={row.actualReturnPct} className="text-xs" />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <ResultChip withinBand={row.withinBand} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: string; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`eyebrow px-2 pb-2 font-normal ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function ResultChip({ withinBand }: { withinBand: boolean | null }) {
  if (withinBand === null) {
    return <span className="text-xs text-ink-muted">—</span>;
  }
  // Glyph as well as tone, for the same reason `Delta` ships an arrow: the
  // distinction must survive with colour unavailable.
  return withinBand ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-ink-secondary">
      <span aria-hidden="true">✓</span> In band
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-series-ma20/10 px-2 py-0.5 text-xs font-medium text-series-ma20">
      <span aria-hidden="true">✕</span> Outside
    </span>
  );
}
