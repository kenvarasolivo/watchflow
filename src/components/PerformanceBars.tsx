"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PerformanceRow } from "@/db/queries";
import { companyName } from "@/lib/companies";
import { RANGE_LABELS, type Range } from "@/lib/range";
import { formatPercent } from "@/lib/format";

/**
 * Window return per ticker, as a horizontal bar chart.
 *
 * Colour here encodes polarity, not identity: a bar is teal when the return is
 * positive and red when it is negative, with the zero baseline as the neutral
 * midpoint. That is the diverging case, and the two hues read as opposites.
 * The sign is also printed on every bar's direct label, so the split survives
 * without colour.
 */
export function PerformanceBars({ rows, range }: { rows: PerformanceRow[]; range: Range }) {
  const data = rows.filter((row) => row.returnPct !== null);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-baseline bg-subtle px-6 py-12 text-center text-sm text-ink-secondary">
        No ticker has enough price history in the {RANGE_LABELS[range]} window to compute a
        return yet.
      </div>
    );
  }

  // Horizontal bars: one row per ticker, sized so labels never crowd.
  const height = Math.max(160, data.length * 38 + 48);

  return (
    <figure className="m-0 rounded-2xl border border-hairline bg-canvas p-5">
      <figcaption className="mb-4 eyebrow">
        {RANGE_LABELS[range]} return by ticker — best to worst
      </figcaption>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke="var(--color-grid)" strokeWidth={1} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "var(--color-ink-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              width={68}
              tick={{ fill: "var(--color-ink)", fontSize: 12, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine x={0} stroke="var(--color-baseline)" strokeWidth={1} />
            <Tooltip
              content={<PerformanceTooltip range={range} />}
              cursor={{ fill: "var(--color-sunken)" }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="returnPct"
              name="Return"
              radius={[3, 3, 3, 3]}
              isAnimationActive={false}
              label={{
                position: "right",
                formatter: (value: number) => formatPercent(value),
                fill: "var(--color-ink-secondary)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
            >
              {data.map((row) => (
                <Cell
                  key={row.ticker}
                  fill={
                    (row.returnPct ?? 0) >= 0 ? "var(--color-gain)" : "var(--color-loss)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function PerformanceTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: PerformanceRow }[];
  range: Range;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const name = companyName(row.ticker, row.name);

  return (
    <div className="rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-xs shadow-[0_8px_24px_rgba(10,10,10,0.10)]">
      <p className="num font-medium text-ink">{row.ticker}</p>
      {name && <p className="mb-2 text-ink-muted">{name}</p>}
      <dl className={`grid grid-cols-[auto_auto] gap-x-5 gap-y-1 ${name ? "" : "mt-2"}`}>
        <dt className="text-ink-muted">{RANGE_LABELS[range]} return</dt>
        <dd
          className={`num text-right ${
            (row.returnPct ?? 0) >= 0 ? "text-gain" : "text-loss"
          }`}
        >
          {formatPercent(row.returnPct)}
        </dd>
        <dt className="text-ink-muted">Window</dt>
        <dd className="num text-right text-ink-secondary">
          {row.firstDate} → {row.lastDate}
        </dd>
        <dt className="text-ink-muted">Sessions</dt>
        <dd className="num text-right text-ink-secondary">{row.observations}</dd>
        <dt className="text-ink-muted">Volatility 30d</dt>
        <dd className="num text-right text-ink-secondary">
          {formatPercent(row.volatility30d, { signed: false })}
        </dd>
      </dl>
    </div>
  );
}
