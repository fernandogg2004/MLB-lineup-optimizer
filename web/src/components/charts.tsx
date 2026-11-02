import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useI18n } from "../i18n-context";
import { niceTicks } from "./ticks";

/** Width of a container in CSS pixels (charts draw at true size, so text stays legible). */
function useWidth(fallback = 600): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.round(entries[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Shared chart frame: title, subtitle, figure, optional data table toggle. */
export function ChartCard(props: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  table?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="card-title">
        {props.title}
      </h2>
      {props.subtitle && <p className="card-sub">{props.subtitle}</p>}
      <div className="mt-3">{props.children}</div>
      {props.footer && <div className="mt-2 text-sm text-muted">{props.footer}</div>}
      {props.table && (
        <div className="mt-2">
          <button className="link-btn" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
            {showTable ? t("table.hide") : t("table.show")}
          </button>
          {showTable && (
            <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={props.title}>
              {props.table}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface Marker {
  value: number;
  label: string;
  kind: "used" | "optimal" | "neutral" | "observed";
}

/** Histogram of lineup values with labelled vertical markers. */
export function Histogram(props: {
  edges: number[];
  counts: number[];
  markers: Marker[];
  xLabel: string;
  yLabel: string;
  summary: string;
  digits?: number;
}) {
  const { fmt, int } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = 240;
  const m = { l: 52, r: 12, t: 40, b: 44 };
  const lo = props.edges[0];
  const hi = props.edges[props.edges.length - 1];
  const maxC = Math.max(...props.counts);
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const y = (c: number) => H - m.b - (c / maxC) * (H - m.t - m.b);
  const ticks = niceTicks(lo, hi, W < 420 ? 3 : 5);
  const yTicks = niceTicks(0, maxC, 4);
  const sortedMarkers = [...props.markers].sort((a, b) => a.value - b.value);
  return (
    <div className="relative" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={props.summary}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tick">
              {int(v)}
            </text>
          </g>
        ))}
        {props.counts.map((c, i) => {
          const x0 = x(props.edges[i]);
          const x1 = x(props.edges[i + 1]);
          return (
            <rect
              key={i}
              x={x0 + 0.5}
              width={Math.max(0.5, x1 - x0 - 1)}
              y={y(c)}
              height={H - m.b - y(c)}
              rx={1.5}
              className={hover === i ? "bar bar-hover" : "bar"}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {ticks.map((v) => (
          <text key={v} x={x(v)} y={H - m.b + 18} textAnchor="middle" className="tick">
            {fmt(v, props.digits ?? 2)}
          </text>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="axis-label">
          {props.xLabel}
        </text>
        {sortedMarkers.map((mk, i) => {
          const xv = x(mk.value);
          const row = i % 2;
          return (
            <g key={mk.label}>
              <line x1={xv} x2={xv} y1={m.t - 4} y2={H - m.b} className={`marker marker-${mk.kind}`} />
              <text
                x={xv}
                y={m.t - 10 - row * 14}
                textAnchor={xv > W - 70 ? "end" : xv < 70 ? "start" : "middle"}
                className={`marker-label marker-label-${mk.kind}`}
              >
                {mk.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" role="status">
          {fmt(props.edges[hover], 3)}–{fmt(props.edges[hover + 1], 3)}: {int(props.counts[hover])}
        </div>
      )}
    </div>
  );
}

/** Probability mass function as bars with an optional observed marker. */
export function PmfChart(props: {
  probs: number[];
  observed?: number | null;
  observedLabel?: string;
  xLabel: string;
  summary: string;
  maxX?: number;
}) {
  const { pct } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const n = Math.min(props.probs.length, (props.maxX ?? 16) + 1);
  const probs = props.probs.slice(0, n);
  const H = 220;
  const m = { l: 44, r: 8, t: 26, b: 44 };
  const maxP = Math.max(...probs) * 1.12;
  const bw = (W - m.l - m.r) / n;
  const y = (p: number) => H - m.b - (p / maxP) * (H - m.t - m.b);
  const yTicks = niceTicks(0, maxP, 4);
  const showEvery = bw < 22 ? 2 : 1;
  return (
    <div className="relative" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={props.summary}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="tick">
              {pct(v)}
            </text>
          </g>
        ))}
        {probs.map((p, i) => {
          const obs = props.observed === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={m.l + i * bw} y={m.t} width={bw} height={H - m.t - m.b} fill="transparent" />
              <rect
                x={m.l + i * bw + 1}
                width={Math.max(1, bw - 2)}
                y={y(p)}
                height={H - m.b - y(p)}
                rx={1.5}
                className={obs ? "bar bar-observed" : hover === i ? "bar bar-hover" : "bar"}
              />
              {(i % showEvery === 0 || obs) && (
                <text x={m.l + i * bw + bw / 2} y={H - m.b + 16} textAnchor="middle" className="tick">
                  {i === n - 1 && n < props.probs.length ? `${i}+` : i}
                </text>
              )}
              {obs && (
                <text x={m.l + i * bw + bw / 2} y={y(p) - 6} textAnchor="middle" className="marker-label marker-label-observed">
                  {props.observedLabel}
                </text>
              )}
            </g>
          );
        })}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="axis-label">
          {props.xLabel}
        </text>
      </svg>
      {hover !== null && (
        <div className="tooltip" role="status">
          {hover}: {pct(probs[hover], 1)}
        </div>
      )}
    </div>
  );
}

/** Horizontal interval: point estimate with 90% interval on a zero-anchored axis. */
export function IntervalBar(props: { lo: number; mid: number; hi: number; domain: [number, number]; label: string }) {
  const { signed } = useI18n();
  const [ref, W] = useWidth();
  const H = 60;
  const m = { l: 24, r: 24 };
  const [d0, d1] = props.domain;
  const x = (v: number) => m.l + ((v - d0) / (d1 - d0)) * (W - m.l - m.r);
  const ticks = niceTicks(d0, d1, W < 420 ? 3 : 5);
  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={props.label}>
        <line x1={x(0)} x2={x(0)} y1={6} y2={36} className="zero-line" />
        <line x1={x(props.lo)} x2={x(props.hi)} y1={20} y2={20} className="interval" />
        <circle cx={x(props.mid)} cy={20} r={6} className="interval-dot" />
        {ticks.map((v) => (
          <text key={v} x={x(v)} y={54} textAnchor="middle" className="tick">
            {signed(v, 2)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Grouped horizontal bars for two series per category (used vs top order). */
export function PairedBars(props: {
  categories: string[];
  a: number[];
  b: number[];
  aLabel: string;
  bLabel: string;
  digits?: number;
}) {
  const { fmt } = useI18n();
  const max = Math.max(...props.a, ...props.b);
  return (
    <div>
      <div className="legend" aria-hidden>
        <span className="swatch swatch-used" /> {props.aLabel}
        <span className="swatch swatch-optimal ml-4" /> {props.bLabel}
      </div>
      <table className="w-full text-sm mt-2">
        <tbody>
          {props.categories.map((c, i) => (
            <tr key={c}>
              <th scope="row" className="text-left font-normal text-muted py-0.5 pr-2 whitespace-nowrap text-xs w-32 max-w-32 truncate">
                {c}
              </th>
              <td className="py-0.5">
                <div className="hbar-wrap">
                  <div className="hbar hbar-used" style={{ width: `${(props.a[i] / max) * 100}%` }} />
                  <span className="hbar-val">
                    <span className="sr-only">{props.aLabel}: </span>
                    {fmt(props.a[i], props.digits ?? 2)}
                  </span>
                </div>
                <div className="hbar-wrap">
                  <div className="hbar hbar-optimal" style={{ width: `${(props.b[i] / max) * 100}%` }} />
                  <span className="hbar-val">
                    <span className="sr-only">{props.bLabel}: </span>
                    {fmt(props.b[i], props.digits ?? 2)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
