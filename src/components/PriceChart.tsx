"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SeriesPoint } from "@/db/queries";
import { formatCompact, formatDayMonth, formatPercent, formatPrice } from "@/lib/format";

const SERIES = [
  { key: "close", label: "Close", color: "var(--color-ink)", width: 2 },
  { key: "ma20", label: "MA 20", color: "var(--color-series-ma20)", width: 1.5 },
  { key: "ma50", label: "MA 50", color: "var(--color-series-ma50)", width: 1.5 },
] as const;

const AXIS_TICK = { fill: "var(--color-ink-muted)", fontSize: 11, fontFamily: "var(--font-mono)" };

/**
 * Price history with moving averages, plus volume as a *separate* chart.
 *
 * Volume is deliberately not overlaid on the price plot with its own y-axis:
 * a dual-axis chart lets the two scales be aligned arbitrarily, which invents a
 * relationship the data does not contain. Two stacked charts sharing an x-axis
 * show the same thing honestly.
 *
 * The close line is drawn as an area at 6% ink as well as a 2px stroke. The
 * fill carries no extra information — it exists because on a white surface a
 * single dark line reads as thinner than it measures, and it also makes clear
 * which of the three series is the subject. Green stays out of this plot
 * entirely: MA-20 orange collapses onto gain green under protanopia (ΔE 4.7),
 * so the two must never share a surface.
 */
export function PriceChart({ series, ticker }: { series: SeriesPoint[]; ticker: string }) {
  if (series.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-16 text-center">
        <p className="display text-2xl text-ink">No price data</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-secondary">
          {ticker} has no rows in this window yet. Either it was added since the last pipeline
          run, or the symbol returned no data from Yahoo Finance.
        </p>
      </div>
    );
  }

  // With ~250 points in the 1y window, labelling every date collides. Show a
  // fixed budget of ticks and let the tooltip carry exact dates.
  const tickInterval = Math.max(0, Math.ceil(series.length / 7) - 1);

  return (
    // min-w-0 for the same reason as WatchlistPanel: the 760px table inside the
    // (initially closed) <details> below would otherwise set this flex item's
    // minimum width the moment someone opens it.
    <div className="flex min-w-0 flex-col gap-4">
      <figure className="m-0 rounded-2xl border border-hairline bg-canvas p-5 pb-3">
        <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow">Close price</span>
          <Legend />
        </figcaption>

        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="closeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="var(--color-grid)" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayMonth}
                interval={tickInterval}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--color-hairline)" }}
                minTickGap={16}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={(value: number) => formatPrice(value)}
                domain={[
                  (min: number) => min - Math.abs(min) * 0.03,
                  (max: number) => max + Math.abs(max) * 0.03,
                ]}
              />
              <Tooltip
                content={<PriceTooltip />}
                cursor={{ stroke: "var(--color-baseline)", strokeWidth: 1 }}
                isAnimationActive={false}
              />

              <Area
                type="monotone"
                dataKey="close"
                stroke="none"
                fill="url(#closeFill)"
                isAnimationActive={false}
                activeDot={false}
                legendType="none"
              />

              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={s.width}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--color-canvas)" }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="m-0 rounded-2xl border border-hairline bg-canvas p-5 pb-3">
        <figcaption className="mb-3 eyebrow">Volume</figcaption>
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--color-grid)" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayMonth}
                interval={tickInterval}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--color-hairline)" }}
                minTickGap={16}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={(value: number) => formatCompact(value)}
              />
              <Tooltip
                content={<VolumeTooltip />}
                cursor={{ fill: "var(--color-sunken)" }}
                isAnimationActive={false}
              />
              <Bar
                dataKey="volume"
                name="Volume"
                fill="var(--color-mark-neutral)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <DataTable series={series} ticker={ticker} />
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" aria-label="Chart series">
      {SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-ink-secondary">
          <span
            aria-hidden="true"
            className="inline-block w-5 rounded-full"
            style={{ backgroundColor: s.color, height: s.width }}
          />
          <span className="num">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

type TooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { payload: SeriesPoint }[];
};

const TOOLTIP_SHELL =
  "rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-xs shadow-[0_8px_24px_rgba(10,10,10,0.10)]";

function PriceTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className={TOOLTIP_SHELL}>
      <p className="num mb-2 font-medium text-ink">{point.date}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1">
        <Row label="Close" value={formatPrice(point.close)} color="var(--color-ink)" />
        <Row label="Open" value={formatPrice(point.open)} />
        <Row label="High" value={formatPrice(point.high)} />
        <Row label="Low" value={formatPrice(point.low)} />
        <Row label="MA 20" value={formatPrice(point.ma20)} color="var(--color-series-ma20)" />
        <Row label="MA 50" value={formatPrice(point.ma50)} color="var(--color-series-ma50)" />
        <Row label="Return" value={formatPercent(point.dailyReturn)} />
      </dl>
    </div>
  );
}

function VolumeTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className={TOOLTIP_SHELL}>
      <p className="num mb-1 font-medium text-ink">{point.date}</p>
      <p className="num text-ink-secondary">{point.volume.toLocaleString()} shares</p>
    </div>
  );
}

/** Values stay in text tokens; the swatch beside the label carries identity. */
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-ink-muted">
        {color && (
          <span
            aria-hidden="true"
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        {label}
      </dt>
      <dd className="num text-right text-ink">{value}</dd>
    </>
  );
}

/**
 * The table-view twin. Every value in the charts above is reachable here
 * without relying on hover or on colour.
 */
function DataTable({ series, ticker }: { series: SeriesPoint[]; ticker: string }) {
  const rows = [...series].reverse();

  return (
    <details className="group rounded-2xl border border-hairline bg-canvas">
      <summary className="flex cursor-pointer items-center justify-between px-5 py-4 transition-colors hover:bg-subtle">
        <span className="eyebrow">Table view — {rows.length} rows</span>
        <span
          aria-hidden="true"
          className="text-ink-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="max-h-[420px] overflow-auto border-t border-hairline">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <caption className="sr-only">
            {ticker} daily OHLCV with derived metrics, newest first.
          </caption>
          <thead className="sticky top-0 z-10 bg-canvas">
            <tr className="border-b border-hairline text-left text-[0.6875rem] tracking-[0.14em] text-ink-muted uppercase">
              <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Open</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">High</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Low</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Close</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Volume</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Return</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">MA 20</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">MA 50</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Vol 30d</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((point) => (
              <tr key={point.date} className="border-b border-grid last:border-b-0">
                <th scope="row" className="px-5 py-1.5 text-left font-normal text-ink-secondary">
                  {point.date}
                </th>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatPrice(point.open)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatPrice(point.high)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatPrice(point.low)}</td>
                <td className="px-5 py-1.5 text-right font-medium text-ink">{formatPrice(point.close)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatCompact(point.volume)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatPercent(point.dailyReturn)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatPrice(point.ma20)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">{formatPrice(point.ma50)}</td>
                <td className="px-5 py-1.5 text-right text-ink-secondary">
                  {formatPercent(point.volatility30d, { signed: false })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
