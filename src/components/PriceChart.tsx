"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
 */
export function PriceChart({ series, ticker }: { series: SeriesPoint[]; ticker: string }) {
  if (series.length === 0) {
    return (
      <div className="rounded border border-dashed border-hairline bg-surface px-6 py-16 text-center">
        <p className="display text-2xl text-ink-secondary">NO PRICE DATA</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
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
    <div className="flex flex-col gap-4">
      <Legend />

      <figure className="m-0 rounded border border-hairline bg-surface p-4 pb-2">
        <figcaption className="sr-only">
          {ticker} daily close price with 20-day and 50-day moving averages.
        </figcaption>

        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid
                stroke="var(--color-grid)"
                strokeWidth={1}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayMonth}
                interval={tickInterval}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--color-baseline)" }}
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
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={s.width}
                  dot={false}
                  // 10px hit radius so the crosshair does not demand pixel-perfect
                  // aim on a 1.5px line.
                  activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--color-surface)" }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="m-0 rounded border border-hairline bg-surface p-4 pb-2">
        <figcaption className="px-1 pb-2 text-xs tracking-widest text-ink-muted uppercase">
          Volume
        </figcaption>
        <div className="h-[110px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--color-grid)" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDayMonth}
                interval={tickInterval}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--color-baseline)" }}
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
                cursor={{ fill: "var(--color-elevated)" }}
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
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" aria-label="Chart series">
      {SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-ink-secondary">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-5 rounded-full"
            style={{ backgroundColor: s.color, height: s.width }}
          />
          <span className="num tracking-wide">{s.label}</span>
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

function PriceTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded border border-hairline bg-elevated px-3 py-2 text-xs shadow-lg">
      <p className="num mb-1.5 tracking-wide text-ink-secondary">{point.date}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        <Row label="Close" value={formatPrice(point.close)} color="var(--color-ink)" />
        <Row label="Open" value={formatPrice(point.open)} />
        <Row label="High" value={formatPrice(point.high)} />
        <Row label="Low" value={formatPrice(point.low)} />
        <Row
          label="MA 20"
          value={formatPrice(point.ma20)}
          color="var(--color-series-ma20)"
        />
        <Row
          label="MA 50"
          value={formatPrice(point.ma50)}
          color="var(--color-series-ma50)"
        />
        <Row label="Return" value={formatPercent(point.dailyReturn)} />
      </dl>
    </div>
  );
}

function VolumeTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded border border-hairline bg-elevated px-3 py-2 text-xs shadow-lg">
      <p className="num mb-1 tracking-wide text-ink-secondary">{point.date}</p>
      <p className="num text-ink">{point.volume.toLocaleString()} shares</p>
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
    <details className="rounded border border-hairline bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-xs tracking-widest text-ink-muted uppercase transition-colors hover:text-ink-secondary">
        Table view — {rows.length} rows
      </summary>
      <div className="max-h-[420px] overflow-auto border-t border-hairline">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <caption className="sr-only">
            {ticker} daily OHLCV with derived metrics, newest first.
          </caption>
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-hairline text-left tracking-widest text-ink-muted uppercase">
              <th scope="col" className="px-4 py-2 font-normal">Date</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Open</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">High</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Low</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Close</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Volume</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Return</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">MA 20</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">MA 50</th>
              <th scope="col" className="px-4 py-2 text-right font-normal">Vol 30d</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((point) => (
              <tr key={point.date} className="border-b border-hairline/50 last:border-b-0">
                <th scope="row" className="px-4 py-1.5 text-left font-normal text-ink-secondary">
                  {point.date}
                </th>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatPrice(point.open)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatPrice(point.high)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatPrice(point.low)}</td>
                <td className="px-4 py-1.5 text-right text-ink">{formatPrice(point.close)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatCompact(point.volume)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatPercent(point.dailyReturn)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatPrice(point.ma20)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">{formatPrice(point.ma50)}</td>
                <td className="px-4 py-1.5 text-right text-ink-secondary">
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
