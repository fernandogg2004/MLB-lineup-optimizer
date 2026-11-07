import { useEffect, useMemo, useState } from "react";
import { niceTicks } from "../../components/ticks";
import type { GameSnapshot, Team } from "../../data";
import { useI18n } from "../../i18n-context";
import { freqByPlayer, gainInputs, histogram, lastName, shade } from "./derive";
import type { GainRequest } from "./gains.worker";
import { useCertainty, useSeen } from "./hooks";
import { Chart, Figure, Legend, Seg } from "./kit";
import type { Validation } from "./validation";

/** Runs on first sight, in a worker: the stored draws re-evaluated with the site's exact engine. */
function useGains(snap: GameSnapshot, team: Team, on: boolean): number[] | null {
  const [state, setState] = useState<{ team: Team; gains: number[] } | null>(null);
  useEffect(() => {
    if (!on) return;
    const worker = new Worker(new URL("./gains.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ gains: number[] }>) => {
      setState({ team, gains: e.data.gains });
      worker.terminate();
    };
    worker.postMessage({ id: 1, ...gainInputs(snap, team) } satisfies GainRequest);
    return () => worker.terminate();
  }, [snap, team, on]);
  return state && state.team === team ? state.gains : null;
}

function GainPlot({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt, signed, int } = useI18n();
  const [ref, seen] = useSeen<HTMLDivElement>("300px");
  const gains = useGains(snap, team, seen);
  const [overlay, setOverlay] = useState<"on" | "off">("on");
  const u = team.uncertainty;
  const mid = team.optimal.er9 - team.actual.er9;
  const hist = useMemo(() => (gains ? histogram(gains, 24) : null), [gains]);
  const lo = Math.min(0, u.diff_q05, hist ? hist.edges[0] : 0) - 0.004;
  const hi = Math.max(0, u.diff_q95, hist ? hist.edges[hist.edges.length - 1] : 0) + 0.004;
  const H = overlay === "on" ? 280 : 130;
  const m = { l: 14, r: 14, t: 18, b: 44 };
  const x = (v: number, w: number) => m.l + ((v - lo) / (hi - lo)) * (w - m.l - m.r);
  const base = H - m.b - 24;
  const maxC = hist ? Math.max(...hist.counts) : 1;
  const yh = (c: number) => base - 14 - (c / maxC) * (base - 14 - m.t);
  const n = overlay === "on" && hist ? hist.counts.length : 0;
  return (
    <div ref={ref}>
      <Figure
        title={t("st.gain_title")}
        sub={t("st.gain_sub", { n: int(u.n_draws) })}
        controls={
          <Seg
            label={t("st.gain_overlay")}
            value={overlay}
            onChange={setOverlay}
            options={[
              { value: "on", label: t("st.gain_show") },
              { value: "off", label: t("st.gain_hide") },
            ]}
          />
        }
        legend={<Legend items={[{ kind: "opt", shape: "line", label: t("st.gain_interval") }, { kind: "neutral", label: t("st.gain_draws") }]} />}
        read={t("st.gain_read", { m: signed(mid, 3), lo: signed(u.diff_q05, 3), hi: signed(u.diff_q95, 3) })}
      >
        <Chart
          label={t("chart.interval_summary", { m: signed(mid, 3), lo: signed(u.diff_q05, 3), hi: signed(u.diff_q95, 3) })}
          height={H}
          count={Math.max(n, 1)}
          indexAt={(px, _y, w) => {
            if (!n || !hist) return 0;
            const v = lo + ((px - m.l) / (w - m.l - m.r)) * (hi - lo);
            const i = Math.floor(((v - hist.edges[0]) / (hist.edges[n] - hist.edges[0])) * n);
            return i >= 0 && i < n ? i : null;
          }}
          anchor={(i, w) => (n && hist ? { x: x((hist.edges[i] + hist.edges[i + 1]) / 2, w), y: Math.max(70, yh(hist.counts[i])) } : { x: x(mid, w), y: base })}
          tip={(i) =>
            n && hist ? (
              <>
                <b>{t("st.tip_gain", { lo: signed(hist.edges[i], 3), hi: signed(hist.edges[i + 1], 3) })}</b>
                <br />
                {t("st.tip_draws", { n: hist.counts[i], total: int(u.n_draws) })}
              </>
            ) : (
              <>
                <b>{signed(mid, 3)}</b>
                <br />
                {signed(u.diff_q05, 3)} … {signed(u.diff_q95, 3)}
              </>
            )
          }
          draw={(w, cur) => (
            <>
              {n > 0 && hist && hist.counts.map((c, i) => (
                <rect key={i} x={x(hist.edges[i], w) + 0.5} width={Math.max(1, x(hist.edges[i + 1], w) - x(hist.edges[i], w) - 1)} y={yh(c)} height={base - 14 - yh(c)} className={cur === i ? "st-bar-neutral st-bar-hot" : "st-bar-neutral"} />
              ))}
              <line x1={x(0, w)} x2={x(0, w)} y1={m.t} y2={base + 12} className="st-zero" />
              <text x={x(0, w)} y={m.t - 5} textAnchor="middle" className="st-tick">{t("st.zero")}</text>
              <line x1={x(u.diff_q05, w)} x2={x(u.diff_q95, w)} y1={base} y2={base} className="st-interval" />
              <line x1={x(u.diff_q05, w)} x2={x(u.diff_q05, w)} y1={base - 6} y2={base + 6} className="st-interval" />
              <line x1={x(u.diff_q95, w)} x2={x(u.diff_q95, w)} y1={base - 6} y2={base + 6} className="st-interval" />
              <circle cx={x(mid, w)} cy={base} r={6.5} className="st-pt-opt" />
              {niceTicks(lo, hi, w < 460 ? 4 : 7).map((v) => (
                <text key={v} x={x(v, w)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{signed(v, 2) || fmt(0, 2)}</text>
              ))}
              <text x={w / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("st.gain_axis")}</text>
            </>
          )}
        />
      </Figure>
    </div>
  );
}

function Waffle({ p, label }: { p: number; label: string }) {
  const on = Math.round(p * 100);
  return (
    <div className="st-waffle" role="img" aria-label={label}>
      {Array.from({ length: 100 }, (_, i) => (
        <i key={i} data-on={i < on || undefined} />
      ))}
    </div>
  );
}

function TwoMeasures({ team, v }: { team: Team; v: Validation | null }) {
  const { t, fmt, pct, int } = useI18n();
  const cert = useCertainty();
  const u = team.uncertainty;
  const better = Math.round(u.p_opt_better * u.n_draws);
  const same = Math.round(u.p_same_optimum * u.n_draws);
  return (
    <div className="st-grid-2">
      <Figure title={t("st.beat_title")} sub={t("st.beat_sub")} read={t("st.beat_read")}>
        <div className="st-measure">
          <Waffle p={u.p_opt_better} label={t("st.of_draws", { n: int(better), total: int(u.n_draws) })} />
          <div>
            <p className="st-big">{cert(u.p_opt_better)}</p>
            <p className="st-axis-note">{t("st.of_draws", { n: int(better), total: int(u.n_draws) })}</p>
          </div>
        </div>
      </Figure>
      <Figure title={t("st.same_title")} sub={t("st.same_sub")} read={t("st.same_read", { r: fmt(u.regret_of_point_optimum_mean, 3) })}>
        <div className="st-measure">
          <Waffle p={u.p_same_optimum} label={t("st.of_draws", { n: int(same), total: int(u.n_draws) })} />
          <div>
            <p className="st-big">{pct(u.p_same_optimum, 1)}</p>
            <p className="st-axis-note">{t("st.of_draws", { n: int(same), total: int(u.n_draws) })}</p>
          </div>
        </div>
      </Figure>
      {v?.e4c && (
        <p className="st-context">
          {t("st.unc_context", {
            n: int(v.e4c.n_team_games),
            d: int(v.e4c.draws_per_game),
            b: pct(v.e4c.mean_p_opt_better, 1),
            s: pct(v.e4c.mean_p_same_optimum, 1),
            e: pct(v.e4c.share_interval_excludes_0, 1),
          })}
        </p>
      )}
    </div>
  );
}

function SlotHeat({ team, player, setPlayer }: { team: Team; player: number | null; setPlayer: (p: number | null) => void }) {
  const { t, pct, int } = useI18n();
  const [slot, setSlot] = useState<number | null>(null);
  const u = team.uncertainty;
  const f = useMemo(() => freqByPlayer(u.slot_player_freq), [u]);
  const pad = (p: number) => (p < 0.0005 ? "·" : pct(p));
  return (
    <Figure title={t("st.slot_title")} sub={t("st.slot_sub", { n: int(u.n_draws) })} read={t("st.slot_read")}>
      <div className="st-scroll" tabIndex={0} role="region" aria-label={t("st.slot_title")}>
        <table className="st-heat st-heat-wide st-slotheat">
          <thead>
            <tr>
              <th scope="col">{t("lineup.player")}</th>
              {f[0].map((_, s) => (
                <th key={s} scope="col" className="num">
                  <button type="button" className="st-rowname" aria-pressed={slot === s} aria-label={t("st.slot_pick", { n: s + 1 })} onClick={() => setSlot(slot === s ? null : s)}>
                    {s + 1}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.actual.order.map((p) => (
              <tr key={p} data-on={player === p || undefined}>
                <th scope="row">
                  <button type="button" className="st-rowname" aria-pressed={player === p} onClick={() => setPlayer(player === p ? null : p)}>
                    {lastName(team.hitters[p].name)}
                  </button>
                </th>
                {f[p].map((v, s) => (
                  <td
                    key={s}
                    className={`num heat-${shade(v, 0, 0.6)}`}
                    data-col={slot === s || undefined}
                    data-opt={team.optimal.order[s] === p || undefined}
                    data-act={team.actual.order[s] === p || undefined}
                    title={t("st.slot_tip", { name: team.hitters[p].name, n: s + 1, p: pct(v, 1) })}
                  >
                    {pad(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="st-legend">
        <li><span className="st-key st-key-optcell" aria-hidden="true" />{t("st.slot_opt")}</li>
        <li><span className="st-key st-key-actcell" aria-hidden="true" />{t("st.slot_act")}</li>
      </ul>
    </Figure>
  );
}

export function Uncertainty(props: { snap: GameSnapshot; team: Team; v: Validation | null; player: number | null; setPlayer: (p: number | null) => void }) {
  const { t } = useI18n();
  const { snap, team } = props;
  return (
    <>
      <GainPlot snap={snap} team={team} />
      <TwoMeasures team={team} v={props.v} />
      <SlotHeat team={team} player={props.player} setPlayer={props.setPlayer} />
      <section className="st-card" aria-labelledby="st-unc-lim">
        <h3 id="st-unc-lim" className="st-card-title">{t("st.lim_title")}</h3>
        <div className="st-two">
          <div>
            <h4 className="st-h4">{t("st.lim_in")}</h4>
            <ul className="st-list">
              {t("st.lim_in_items").split("|").map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="st-h4">{t("st.lim_out")}</h4>
            <ul className="st-list">
              {t("st.lim_out_items").split("|").map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
