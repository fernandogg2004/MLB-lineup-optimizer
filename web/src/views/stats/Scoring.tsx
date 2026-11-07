import { useMemo, useState } from "react";
import { niceTicks } from "../../components/ticks";
import type { GameSnapshot, Team } from "../../data";
import { useI18n } from "../../i18n-context";
import { cumulative, lastName, largestMove, leadoffByInning, movements, pmfMean, shade, tailFrom, withTail } from "./derive";
import { Chart, Figure, Legend, Seg } from "./kit";

const TAIL = 12;

function RunDistribution({ team }: { team: Team }) {
  const { t, pct, fmt, signed } = useI18n();
  const [mode, setMode] = useState<"both" | "act" | "opt">("both");
  const a = withTail(team.actual.run_distribution, TAIL);
  const o = withTail(team.optimal.run_distribution, TAIL);
  const label = (i: number) => (i === TAIL ? `${TAIL}+` : String(i));
  const H = 320;
  const m = { l: 50, r: 10, t: 16, b: 46 };
  const max = Math.max(...a, ...o) * 1.08;
  const y = (p: number) => H - m.b - (p / max) * (H - m.t - m.b);
  const bw = (w: number) => (w - m.l - m.r) / a.length;
  return (
    <Figure
      title={t("st.runs_title")}
      sub={t("st.runs_sub")}
      controls={
        <Seg
          label={t("st.show_orders")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "both", label: t("st.both") },
            { value: "act", label: t("sum.actual") },
            { value: "opt", label: t("sum.optimized") },
          ]}
        />
      }
      legend={<Legend items={[{ kind: "act", label: t("sum.actual") }, { kind: "opt", label: t("sum.optimized") }]} />}
      read={t("st.runs_read", {
        a0: pct(team.actual.run_distribution[0], 1),
        o0: pct(team.optimal.run_distribution[0], 1),
        a5: pct(tailFrom(team.actual.run_distribution, 5), 1),
        o5: pct(tailFrom(team.optimal.run_distribution, 5), 1),
        ma: fmt(pmfMean(team.actual.run_distribution), 3),
        mo: fmt(pmfMean(team.optimal.run_distribution), 3),
        r: team.observed_runs ?? "—",
      })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("runs.x")}</th>
              <th scope="col" className="num">{t("sum.actual")}</th>
              <th scope="col" className="num">{t("sum.optimized")}</th>
            </tr>
          </thead>
          <tbody>
            {a.map((p, i) => (
              <tr key={i}>
                <th scope="row">{label(i)}</th>
                <td className="num">{pct(p, 2)}</td>
                <td className="num">{pct(o[i], 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("st.runs_title")}
        height={H}
        count={a.length}
        indexAt={(px, _y, w) => {
          const i = Math.floor((px - m.l) / bw(w));
          return i >= 0 && i < a.length ? i : null;
        }}
        anchor={(i, w) => ({ x: m.l + (i + 0.5) * bw(w), y: Math.max(m.t + 40, y(Math.max(a[i], o[i]))) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_runs", { n: label(i) })}</b>
            <br />
            {t("sum.actual")}: {pct(a[i], 2)}
            <br />
            {t("sum.optimized")}: {pct(o[i], 2)}
            <br />
            {t("st.tip_diff")}: {signed((o[i] - a[i]) * 100, 2)} {t("st.points")}
          </>
        )}
        draw={(w, cur) => {
          const b = bw(w);
          const both = mode === "both";
          const bar = both ? Math.max(1, (b - 3) / 2) : Math.max(1, b - 3);
          return (
            <>
              {niceTicks(0, max, 4).map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                  <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="st-tick">{pct(v)}</text>
                </g>
              ))}
              {a.map((_, i) => {
                const x0 = m.l + i * b + 1.5;
                return (
                  <g key={i}>
                    {cur === i && <rect x={m.l + i * b} y={m.t} width={b} height={H - m.t - m.b} className="st-hot" />}
                    {mode !== "opt" && <rect x={x0} width={bar} y={y(a[i])} height={H - m.b - y(a[i])} className="st-bar-act" />}
                    {mode !== "act" && <rect x={both ? x0 + bar : x0} width={bar} y={y(o[i])} height={H - m.b - y(o[i])} className="st-bar-opt" />}
                    <text x={m.l + (i + 0.5) * b} y={H - m.b + 17} textAnchor="middle" className="st-tick">{label(i)}</text>
                  </g>
                );
              })}
              <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("runs.x")}</text>
            </>
          );
        }}
      />
    </Figure>
  );
}

function InningRuns({ team }: { team: Team }) {
  const { t, fmt, signed } = useI18n();
  const [mode, setMode] = useState<"inning" | "cum">("inning");
  const per = (k: "actual" | "optimal") => team[k].by_inning ?? [];
  const a = mode === "inning" ? per("actual") : cumulative(per("actual"));
  const o = mode === "inning" ? per("optimal") : cumulative(per("optimal"));
  const H = 300;
  const m = { l: 52, r: 16, t: 16, b: 46 };
  const lo = mode === "inning" ? Math.floor(Math.min(...a, ...o) * 20) / 20 : 0;
  const hi = Math.max(...a, ...o) * (mode === "inning" ? 1.01 : 1.04);
  const x = (i: number, w: number) => m.l + (i / 8) * (w - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
  const path = (s: number[], w: number) => s.map((v, i) => `${i ? "L" : "M"}${x(i, w).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const yName = mode === "inning" ? t("st.inn_y") : t("st.inn_y_cum");
  return (
    <Figure
      title={t("st.inn_title")}
      sub={mode === "inning" ? t("st.inn_sub") : t("st.inn_sub_cum")}
      controls={
        <Seg
          label={t("st.inn_view")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "inning", label: t("st.inn_per") },
            { value: "cum", label: t("st.inn_cum") },
          ]}
        />
      }
      legend={<Legend items={[{ kind: "act", shape: "line", label: t("sum.actual") }, { kind: "opt", shape: "line", label: t("sum.optimized") }]} />}
      read={t("st.inn_read")}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("tech.inning")}</th>
              <th scope="col" className="num">{t("sum.actual")}</th>
              <th scope="col" className="num">{t("sum.optimized")}</th>
            </tr>
          </thead>
          <tbody>
            {a.map((v, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td className="num">{fmt(v, 4)}</td>
                <td className="num">{fmt(o[i], 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={yName}
        height={H}
        count={9}
        indexAt={(px, _y, w) => {
          const i = Math.round(((px - m.l) / (w - m.l - m.r)) * 8);
          return i >= 0 && i <= 8 ? i : null;
        }}
        anchor={(i, w) => ({ x: x(i, w), y: Math.max(m.t + 60, y(Math.max(a[i], o[i]))) })}
        tip={(i) => (
          <>
            <b>{mode === "inning" ? t("st.tip_inn", { n: i + 1 }) : t("st.tip_cum", { n: i + 1 })}</b>
            <br />
            {t("sum.actual")}: {fmt(a[i], 4)}
            <br />
            {t("sum.optimized")}: {fmt(o[i], 4)}
            <br />
            {t("st.tip_diff")}: {signed(o[i] - a[i], 4)}
          </>
        )}
        draw={(w, cur) => (
          <>
            {niceTicks(lo, hi, 4).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="st-tick">{fmt(v, mode === "inning" ? 2 : 1)}</text>
              </g>
            ))}
            {a.map((_, i) => (
              <text key={i} x={x(i, w)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{i + 1}</text>
            ))}
            {cur !== null && <line x1={x(cur, w)} x2={x(cur, w)} y1={m.t} y2={H - m.b} className="st-cursor" />}
            <path d={path(a, w)} className="st-line-act" />
            <path d={path(o, w)} className="st-line-opt" />
            {a.map((v, i) => (
              <rect key={i} x={x(i, w) - 3.5} y={y(v) - 3.5} width={7} height={7} className="st-pt-act" />
            ))}
            {o.map((v, i) => (
              <circle key={i} cx={x(i, w)} cy={y(v)} r={3.8} className="st-pt-opt" />
            ))}
            <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("tech.inning")}</text>
            <text x={13} y={(m.t + H - m.b) / 2} textAnchor="middle" className="st-axis" transform={`rotate(-90 13 ${(m.t + H - m.b) / 2})`}>{yName}</text>
          </>
        )}
      />
    </Figure>
  );
}

function LeadoffChain({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, pct } = useI18n();
  const [mode, setMode] = useState<"optimal" | "actual">("optimal");
  const mu = useMemo(() => leadoffByInning(snap, team, team[mode].order), [snap, team, mode]);
  const order = team[mode].order;
  return (
    <Figure
      title={t("st.lead_title")}
      sub={t("st.lead_sub")}
      controls={
        <Seg
          label={t("st.show_orders")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "optimal", label: t("sum.optimized") },
            { value: "actual", label: t("sum.actual") },
          ]}
        />
      }
      read={t("st.lead_read")}
    >
      <div className="st-scroll" tabIndex={0} role="region" aria-label={t("st.lead_title")}>
        <table className="st-heat">
          <thead>
            <tr>
              <th scope="col">{t("st.lead_col")}</th>
              {order.map((_, s) => (
                <th key={s} scope="col" className="num">{s + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mu.map((row, k) => (
              <tr key={k}>
                <th scope="row">{t("st.lead_inn", { n: k + 1 })}</th>
                {row.map((p, s) => (
                  <td key={s} className={`num heat-${shade(p, 0, 0.5)}`} title={`${lastName(team.hitters[order[s]].name)}: ${pct(p, 1)}`}>
                    {p < 0.0005 ? "·" : pct(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

function PaChart({ team }: { team: Team }) {
  const { t, fmt, signed } = useI18n();
  const a = team.actual.pa_by_slot;
  const o = team.optimal.pa_by_slot;
  const H = 280;
  const m = { l: 44, r: 8, t: 16, b: 46 };
  const max = Math.max(...a, ...o) * 1.08;
  const y = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const bw = (w: number) => (w - m.l - m.r) / 9;
  return (
    <Figure
      title={t("st.pa_title")}
      sub={t("st.pa_sub")}
      legend={<Legend items={[{ kind: "act", label: t("sum.actual") }, { kind: "opt", label: t("sum.optimized") }]} />}
      read={t("st.pa_read", { d: fmt(o[0] - o[8], 2), a: fmt(o[0], 2), b: fmt(o[8], 2) })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("lineup.slot")}</th>
              <th scope="col" className="num">{t("sum.actual")}</th>
              <th scope="col" className="num">{t("sum.optimized")}</th>
            </tr>
          </thead>
          <tbody>
            {a.map((v, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td className="num">{fmt(v, 3)}</td>
                <td className="num">{fmt(o[i], 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("st.pa_title")}
        height={H}
        count={9}
        indexAt={(px, _y, w) => {
          const i = Math.floor((px - m.l) / bw(w));
          return i >= 0 && i < 9 ? i : null;
        }}
        anchor={(i, w) => ({ x: m.l + (i + 0.5) * bw(w), y: Math.max(m.t + 40, y(Math.max(a[i], o[i]))) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_slot", { n: i + 1 })}</b>
            <br />
            {lastName(team.hitters[team.actual.order[i]].name)} ({t("sum.actual")}): {fmt(a[i], 3)}
            <br />
            {lastName(team.hitters[team.optimal.order[i]].name)} ({t("sum.optimized")}): {fmt(o[i], 3)}
            <br />
            {t("st.tip_diff")}: {signed(o[i] - a[i], 3)}
          </>
        )}
        draw={(w, cur) => {
          const b = bw(w);
          const bar = Math.max(1, (b - 6) / 2);
          return (
            <>
              {niceTicks(0, max, 4).map((v) => (
                <g key={v}>
                  <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                  <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="st-tick">{fmt(v, 1)}</text>
                </g>
              ))}
              {a.map((v, i) => (
                <g key={i}>
                  {cur === i && <rect x={m.l + i * b} y={m.t} width={b} height={H - m.t - m.b} className="st-hot" />}
                  <rect x={m.l + i * b + 3} width={bar} y={y(v)} height={H - m.b - y(v)} className="st-bar-act" />
                  <rect x={m.l + i * b + 3 + bar} width={bar} y={y(o[i])} height={H - m.b - y(o[i])} className="st-bar-opt" />
                  <text x={m.l + (i + 0.5) * b} y={H - m.b + 17} textAnchor="middle" className="st-tick">{i + 1}</text>
                </g>
              ))}
              <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("st.slot_axis")}</text>
            </>
          );
        }}
      />
    </Figure>
  );
}

function Positions({ team, player, setPlayer }: { team: Team; player: number | null; setPlayer: (p: number | null) => void }) {
  const { t } = useI18n();
  const moves = movements(team.actual.order, team.optimal.order);
  const big = largestMove(moves);
  const moved = moves.filter((m) => m.from !== m.to).length;
  const name = (p: number) => team.hitters[p].name;
  const toggle = (p: number) => setPlayer(player === p ? null : p);
  const cell = (p: number, slot: number, side: "act" | "opt") => (
    <button key={p} type="button" className={`st-pos st-pos-${side}`} aria-pressed={player === p} data-dim={(player !== null && player !== p) || undefined} onClick={() => toggle(p)}>
      <span className="st-slot-n">{slot + 1}</span>
      <span className="st-pos-name">{lastName(name(p))}</span>
    </button>
  );
  return (
    <Figure
      title={t("st.pos_title")}
      sub={t("st.pos_sub")}
      read={big ? t("st.pos_big", { name: name(big.player), from: big.from + 1, to: big.to + 1, n: moved }) : t("lineup.identical")}
    >
      <div className="st-posgrid">
        <h4 className="st-h4 st-pos-head-act">{t("sum.actual")}</h4>
        <span />
        <h4 className="st-h4 st-pos-head-opt">{t("sum.optimized")}</h4>
        <div className="st-poscol">{team.actual.order.map((p, s) => cell(p, s, "act"))}</div>
        <svg className="st-poslines" viewBox="0 0 100 90" preserveAspectRatio="none" aria-hidden="true">
          {moves.map((m) => (
            <path
              key={m.player}
              d={`M0 ${m.from * 10 + 5} C50 ${m.from * 10 + 5} 50 ${m.to * 10 + 5} 100 ${m.to * 10 + 5}`}
              className={player === m.player ? "st-posline st-posline-on" : m.from === m.to ? "st-posline st-posline-same" : "st-posline"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="st-poscol">{team.optimal.order.map((p, s) => cell(p, s, "opt"))}</div>
      </div>
    </Figure>
  );
}

export function Scoring(props: { snap: GameSnapshot; team: Team; player: number | null; setPlayer: (p: number | null) => void }) {
  const { team } = props;
  return (
    <>
      <RunDistribution team={team} />
      <div className="st-grid-2">
        <InningRuns team={team} />
        <LeadoffChain snap={props.snap} team={team} />
      </div>
      <div className="st-grid-2">
        <PaChart team={team} />
        <Positions team={team} player={props.player} setPlayer={props.setPlayer} />
      </div>
    </>
  );
}
