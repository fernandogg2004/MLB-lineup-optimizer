import { useEffect, useMemo, useRef, useState } from "react";
import { niceTicks } from "../../components/ticks";
import type { Team } from "../../data";
import { useI18n } from "../../i18n-context";
import { lastName, zoomBins } from "./derive";
import { useStoryMode } from "./hooks";
import { Chart, Figure, Legend, Seg } from "./kit";

type Zoom = "all" | "near";

function OrderHistogram({ team, stage }: { team: Team; stage: number }) {
  const { t, fmt, int, pct } = useI18n();
  const [zoom, setZoom] = useState<Zoom>("all");
  const { edges, counts } = team.all_orders.hist;
  const total = team.all_orders.count;
  const [a, b] = zoom === "all" ? [0, counts.length - 1] : zoomBins(edges, team.actual.er9, team.optimal.er9);
  const lo = edges[a];
  const hi = edges[b + 1];
  const shown = counts.slice(a, b + 1);
  const maxC = Math.max(...shown, 1);
  const m = { l: 62, r: 14, t: 66, b: 46 };
  const H = 360;
  const x = (v: number, w: number) => m.l + ((v - lo) / (hi - lo)) * (w - m.l - m.r);
  const y = (c: number) => H - m.b - (c / maxC) * (H - m.t - m.b);
  const marks = [
    { v: team.worst.er9, label: t("dist.worst"), kind: "neutral", stage: 3 },
    { v: team.the_book.er9, label: t("dist.book"), kind: "book", stage: 3 },
    { v: team.actual.er9, label: t("dist.used"), kind: "act", stage: 2 },
    { v: team.optimal.er9, label: t("dist.optimal"), kind: "opt", stage: 3 },
  ].filter((k) => k.v >= lo - 1e-5 && k.v <= hi + 1e-5);
  const place = (w: number) => {
    const taken: number[][] = [[], [], [], []];
    return [...marks]
      .sort((p, q) => p.v - q.v)
      .map((k) => {
        const px = x(k.v, w);
        const half = k.label.length * 3.6 + 4;
        const cx = Math.max(half, Math.min(w - half, px));
        const row = taken.findIndex((r) => r.every((o) => Math.abs(o - cx) > half + 34));
        const useRow = row < 0 ? 3 : row;
        taken[useRow].push(cx);
        return { ...k, px, cx, row: useRow };
      });
  };
  const yTicks = niceTicks(0, maxC, 4);
  const inBin = (i: number) => marks.filter((k) => k.v >= edges[a + i] && (k.v < edges[a + i + 1] || a + i === counts.length - 1));
  return (
    <Figure
      title={t("st.hist_title")}
      sub={t("st.hist_sub", { n: int(total) })}
      controls={
        <Seg
          label={t("st.hist_range")}
          value={zoom}
          onChange={setZoom}
          options={[
            { value: "all", label: t("st.hist_all") },
            { value: "near", label: t("st.hist_near") },
          ]}
        />
      }
      legend={<Legend items={[{ kind: "act", shape: "line", label: t("sum.actual") }, { kind: "opt", shape: "line", label: t("sum.optimized") }]} />}
      read={zoom === "near" ? t("st.hist_zoom_note") : t("st.hist_axis_note", { d: fmt(team.optimal.er9 - team.worst.er9, 3) })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("st.expected_runs")}</th>
              <th scope="col" className="num">{t("dist.y")}</th>
              <th scope="col" className="num">{t("st.share_space")}</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c, i) => (
              <tr key={i}>
                <td>{fmt(edges[i], 3)}–{fmt(edges[i + 1], 3)}</td>
                <td className="num">{int(c)}</td>
                <td className="num">{pct(c / total, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("chart.dist_summary", { u: fmt(team.actual.er9, 3), p: pct(team.actual.percentile, 1), o: fmt(team.optimal.er9, 3) })}
        height={H}
        count={shown.length}
        indexAt={(px, _py, w) => {
          const i = Math.floor(((px - m.l) / (w - m.l - m.r)) * shown.length);
          return i >= 0 && i < shown.length ? i : null;
        }}
        anchor={(i, w) => ({ x: (x(edges[a + i], w) + x(edges[a + i + 1], w)) / 2, y: Math.max(m.t, y(shown[i])) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_range", { lo: fmt(edges[a + i], 3), hi: fmt(edges[a + i + 1], 3) })}</b>
            <br />
            {t("st.tip_orders", { n: int(shown[i]), p: pct(shown[i] / total, 2) })}
            {inBin(i).map((k) => (
              <span key={k.label}>
                <br />
                {k.label}: {fmt(k.v, 3)}
              </span>
            ))}
          </>
        )}
        draw={(w, cur) => (
          <>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="st-tick">{int(v)}</text>
              </g>
            ))}
            <g className="st-stage" data-on={stage >= 0 || undefined}>
              {shown.map((c, i) => {
                const x0 = x(edges[a + i], w);
                const x1 = x(edges[a + i + 1], w);
                return <rect key={i} x={x0 + 0.5} width={Math.max(0.5, x1 - x0 - 1)} y={y(c)} height={H - m.b - y(c)} rx={1.5} className={cur === i ? "st-bar st-bar-hot" : "st-bar"} />;
              })}
            </g>
            {niceTicks(lo, hi, w < 460 ? 3 : 6).map((v) => (
              <text key={v} x={x(v, w)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{fmt(v, zoom === "near" ? 3 : 2)}</text>
            ))}
            <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("dist.x")}</text>
            <text x={14} y={(m.t + H - m.b) / 2} textAnchor="middle" className="st-axis" transform={`rotate(-90 14 ${(m.t + H - m.b) / 2})`}>{t("dist.y")}</text>
            {place(w).map((k) => (
              <g key={k.label} className="st-stage" data-on={stage >= k.stage || undefined}>
                <line x1={k.px} x2={k.px} y1={m.t - 6} y2={H - m.b} className={`st-mark st-mark-${k.kind}`} />
                <text x={k.cx} y={m.t - 12 - k.row * 15} textAnchor="middle" className={`st-mark-label st-mark-label-${k.kind}`}>{k.label}</text>
              </g>
            ))}
          </>
        )}
      />
    </Figure>
  );
}

function Story({ team, g }: { team: Team; g: string }) {
  const { t, fmt, signed, pct, int } = useI18n();
  const story = useStoryMode();
  const [stage, setStage] = useState(-1);
  const steps = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!story) return;
    // The stage only moves forward: a chart never resets because the reader scrolled back a little.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = steps.current.indexOf(e.target as HTMLDivElement);
          if (i >= 0 && e.isIntersecting) setStage((s) => Math.max(s, i));
        }
      },
      // The watched band reaches far above the screen, so a fast scroll past a step still counts.
      { threshold: 0, rootMargin: "1000000px 0px -42% 0px" },
    );
    steps.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [story]);
  const text = [
    t("st.story_1", { n: int(team.all_orders.count) }),
    t("st.story_2", { mean: fmt(team.all_orders.mean, 3), sd: fmt(team.all_orders.sd, 3) }),
    t("st.story_3", { v: fmt(team.actual.er9, 3), p: pct(team.actual.percentile, 1) }),
    t("st.story_4", { v: fmt(team.optimal.er9, 3), d: signed(team.optimal.er9 - team.actual.er9, 3) }),
  ];
  return (
    <div className={story ? "st-story" : "st-story-flat"} key={g}>
      <div className="st-story-steps">
        {text.map((s, i) => (
          <div key={i} ref={(el) => { steps.current[i] = el; }} className="st-step" data-on={!story || stage >= i || undefined}>
            <span className="st-step-n" aria-hidden="true">{i + 1}</span>
            <p>{s}</p>
          </div>
        ))}
      </div>
      <div className="st-story-chart">
        <OrderHistogram team={team} stage={story ? stage : 3} />
      </div>
    </div>
  );
}

function RankBar({ team }: { team: Team }) {
  const { t, pct, int } = useI18n();
  const p = team.actual.percentile;
  return (
    <Figure title={t("st.rank_title")} sub={t("st.rank_sub")} read={t("st.rank_read", { p: pct(p, 1), n: int(Math.round((1 - p) * team.all_orders.count)) })}>
      <div className="st-rank" role="img" aria-label={t("kpi.rank_sub", { pct: pct(p, 1) })}>
        <div className="st-rank-track">
          <div className="st-rank-fill" style={{ width: `${p * 100}%` }} />
          <span className="st-rank-pin" style={{ left: `${p * 100}%` }} />
        </div>
        <div className="st-rank-scale" aria-hidden="true">
          <span>{t("st.rank_worst")}</span>
          <span>{t("st.rank_best")}</span>
        </div>
        <p className="st-big">{pct(p, 1)}</p>
      </div>
    </Figure>
  );
}

function Comparison({ team }: { team: Team }) {
  const { t, fmt, signed } = useI18n();
  const rows = [
    { key: t("sum.optimized"), v: team.optimal.er9, kind: "opt" },
    { key: t("dist.book"), v: team.the_book.er9, kind: "book" },
    { key: t("sum.actual"), v: team.actual.er9, kind: "act" },
    { key: t("dist.worst"), v: team.worst.er9, kind: "neutral" },
  ];
  const top = team.optimal.er9;
  const span = team.optimal.er9 - team.worst.er9 || 1;
  const lo = team.worst.er9 - team.actual.er9;
  const hi = team.optimal.er9 - team.actual.er9;
  const pos = (d: number) => ((d - lo) / (hi - lo || 1)) * 100;
  return (
    <Figure
      title={t("st.cmp_title")}
      sub={t("st.cmp_sub")}
      read={t("st.cmp_read", { d: signed(team.optimal.er9 - team.actual.er9, 4), r: fmt(span, 3) })}
    >
      <div className="st-stack">
        <div>
          <h4 className="st-h4">{t("st.cmp_scale")}</h4>
          <ul className="st-hbars">
            {rows.map((r) => (
              <li key={r.key}>
                <span className="st-hbar-name">{r.key}</span>
                <span className="st-hbar-track"><span className={`st-hbar st-hbar-${r.kind}`} style={{ width: `${(r.v / top) * 100}%` }} /></span>
                <span className="st-hbar-val">{fmt(r.v, 4)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="st-h4">{t("st.cmp_diff")}</h4>
          <ul className="st-lolli">
            {rows.map((r) => {
              const d = r.v - team.actual.er9;
              return (
                <li key={r.key}>
                  <span className="st-hbar-name">{r.key}</span>
                  <span className="st-lolli-track">
                    <span className="st-lolli-zero" style={{ left: `${pos(0)}%` }} />
                    <span className={`st-lolli-dot st-dot-${r.kind}`} style={{ left: `${pos(d)}%` }} />
                  </span>
                  <span className="st-hbar-val">{signed(d, 4)}</span>
                </li>
              );
            })}
          </ul>
          <p className="st-axis-note">{t("st.cmp_zoom")}</p>
        </div>
      </div>
    </Figure>
  );
}

function TopOrders({ team }: { team: Team }) {
  const { t, fmt, signed, pct } = useI18n();
  const [sel, setSel] = useState(0);
  const [against, setAgainst] = useState<"actual" | "optimal">("actual");
  const name = (p: number) => lastName(team.hitters[p].name);
  const selected = team.top10[sel] ?? team.top10[0];
  const base = against === "actual" ? team.actual.order : team.optimal.order;
  const same = useMemo(() => selected.order.filter((p, i) => p === base[i]).length, [selected, base]);
  const spread = team.top10[0].er9 - team.top10[team.top10.length - 1].er9;
  return (
    <Figure
      title={t("st.top_title")}
      sub={t("st.top_sub")}
      read={t("st.top_read", { d: fmt(spread, 4), p: pct(team.uncertainty.p_same_optimum, 1) })}
    >
      <div className="st-scroll" tabIndex={0} role="region" aria-label={t("st.top_title")}>
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col" className="num">{t("st.top_rank")}</th>
              <th scope="col">{t("st.top_order")}</th>
              <th scope="col" className="num">{t("st.expected_runs")}</th>
              <th scope="col" className="num">{t("st.top_vs_best")}</th>
              <th scope="col" className="num">{t("st.top_vs_act")}</th>
            </tr>
          </thead>
          <tbody>
            {team.top10.map((o, i) => (
              <tr key={i} data-on={sel === i || undefined}>
                <td className="num">
                  <button type="button" className="st-rowbtn" aria-pressed={sel === i} aria-label={t("st.top_pick", { n: i + 1 })} onClick={() => setSel(i)}>
                    {i + 1}
                  </button>
                </td>
                <td className="st-order">
                  {o.order.map((p, s) => (
                    <span key={p} data-moved={p !== team.actual.order[s] || undefined}>{name(p)}</span>
                  ))}
                </td>
                <td className="num">{fmt(o.er9, 4)}</td>
                <td className="num">{signed(o.er9 - team.optimal.er9, 4) || fmt(0, 4)}</td>
                <td className="num">{signed(o.er9 - team.actual.er9, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-axis-note">{t("st.top_moved_note")}</p>
      <div className="st-compare">
        <div className="st-controls">
          <h4 className="st-h4">{t("st.top_compare", { n: sel + 1 })}</h4>
          <Seg
            label={t("st.top_against")}
            value={against}
            onChange={setAgainst}
            options={[
              { value: "actual", label: t("sum.actual") },
              { value: "optimal", label: t("sum.optimized") },
            ]}
          />
        </div>
        <ol className="st-slots">
          {selected.order.map((p, s) => {
            const moved = p !== base[s];
            return (
              <li key={s} data-moved={moved || undefined}>
                <span className="st-slot-n">{s + 1}</span>
                <span className="st-slot-a">{name(p)}</span>
                <span className="st-slot-b">{moved ? <><span aria-hidden="true">≠ </span>{name(base[s])}</> : t("st.same_slot")}</span>
              </li>
            );
          })}
        </ol>
        <p className="st-axis-note">{t("st.top_same", { n: same })}</p>
      </div>
    </Figure>
  );
}

export function Optimization({ team, g }: { team: Team; g: string }) {
  const { t, fmt } = useI18n();
  const span = team.optimal.er9 - team.worst.er9;
  return (
    <>
      <Story team={team} g={g} />
      <div className="st-grid-2">
        <RankBar team={team} />
        <Comparison team={team} />
      </div>
      <TopOrders team={team} />
      <p className="st-conclusion">{t("st.opt_conclusion", { sd: fmt(team.all_orders.sd, 3), d: fmt(span, 3), t10: fmt(team.top10[0].er9 - team.top10[team.top10.length - 1].er9, 4) })}</p>
    </>
  );
}
