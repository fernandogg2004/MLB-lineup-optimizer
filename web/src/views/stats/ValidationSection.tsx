import { niceTicks } from "../../components/ticks";
import { useI18n } from "../../i18n-context";
import type { Key } from "../../strings";
import { Chart, Figure, Legend } from "./kit";
import { Eq, Frac, I, N, O, Row, Sub, SumOver, Tx } from "./Math";
import type { Validation } from "./validation";

const MODELS = ["M0_league", "M1_batter", "M2_batter_pitcher", "M2_default_hyper", "M3_lightgbm"] as const;

function Calibration({ e3 }: { e3: NonNullable<Validation["e3"]> }) {
  const { t, fmt, int, signed } = useI18n();
  const d = e3.by_decile;
  const vals = d.flatMap((r) => [r.pred, r.obs - 2 * r.obs_se, r.obs + 2 * r.obs_se]);
  const lo = Math.floor(Math.min(...vals) * 2) / 2;
  const hi = Math.ceil(Math.max(...vals) * 2) / 2;
  const H = (w: number) => Math.min(380, w);
  const m = { l: 52, r: 14, t: 12, b: 46 };
  const x = (v: number, w: number) => m.l + ((v - lo) / (hi - lo)) * (w - m.l - m.r);
  const y = (v: number, w: number) => H(w) - m.b - ((v - lo) / (hi - lo)) * (H(w) - m.t - m.b);
  return (
    <Figure
      title={t("st.cal_title")}
      sub={t("st.cal_sub", { n: int(e3.n_team_games), x: int(e3.excluded_fewer_than_8_innings) })}
      legend={<Legend items={[{ kind: "opt", shape: "dot", label: t("st.cal_points") }, { kind: "neutral", shape: "line", label: t("st.cal_ideal") }]} />}
      read={t("st.cal_read", {
        s: fmt(e3.calibration_slope, 2),
        sl: fmt(e3.slope_ci95[0], 2),
        sh: fmt(e3.slope_ci95[1], 2),
        b: signed(e3.bias_obs_minus_pred, 3),
        bl: signed(e3.bias_ci95[0], 3),
        bh: signed(e3.bias_ci95[1], 3),
      })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("st.cal_decile")}</th>
              <th scope="col" className="num">n</th>
              <th scope="col" className="num">{t("st.predicted")}</th>
              <th scope="col" className="num">{t("st.observed")}</th>
              <th scope="col" className="num">{t("st.se")}</th>
            </tr>
          </thead>
          <tbody>
            {d.map((r) => (
              <tr key={r.decile}>
                <th scope="row">{r.decile + 1}</th>
                <td className="num">{int(r.n)}</td>
                <td className="num">{fmt(r.pred, 3)}</td>
                <td className="num">{fmt(r.obs, 3)}</td>
                <td className="num">{fmt(r.obs_se, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("st.cal_title")}
        height={H}
        count={d.length}
        indexAt={(px, _y, w) => {
          let best = 0;
          d.forEach((r, i) => {
            if (Math.abs(x(r.pred, w) - px) < Math.abs(x(d[best].pred, w) - px)) best = i;
          });
          return best;
        }}
        anchor={(i, w) => ({ x: x(d[i].pred, w), y: Math.max(90, y(d[i].obs + 2 * d[i].obs_se, w)) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_decile", { n: d[i].decile + 1, c: int(d[i].n) })}</b>
            <br />
            {t("st.predicted")}: {fmt(d[i].pred, 3)}
            <br />
            {t("st.observed")}: {fmt(d[i].obs, 3)} ± {fmt(2 * d[i].obs_se, 3)}
          </>
        )}
        draw={(w, cur) => (
          <>
            {niceTicks(lo, hi, 4).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v, w)} y2={y(v, w)} className="st-grid" />
                <text x={m.l - 8} y={y(v, w) + 4} textAnchor="end" className="st-tick">{fmt(v, 1)}</text>
                <text x={x(v, w)} y={H(w) - m.b + 18} textAnchor="middle" className="st-tick">{fmt(v, 1)}</text>
              </g>
            ))}
            <line x1={x(lo, w)} y1={y(lo, w)} x2={x(hi, w)} y2={y(hi, w)} className="st-zero" />
            {d.map((r, i) => (
              <g key={r.decile}>
                <line x1={x(r.pred, w)} x2={x(r.pred, w)} y1={y(r.obs - 2 * r.obs_se, w)} y2={y(r.obs + 2 * r.obs_se, w)} className="st-whisker" />
                <circle cx={x(r.pred, w)} cy={y(r.obs, w)} r={cur === i ? 7 : 5} className="st-pt-opt" />
              </g>
            ))}
            <text x={(m.l + w - m.r) / 2} y={H(w) - 8} textAnchor="middle" className="st-axis">{t("st.cal_x")}</text>
            <text x={13} y={(m.t + H(w) - m.b) / 2} textAnchor="middle" className="st-axis" transform={`rotate(-90 13 ${(m.t + H(w) - m.b) / 2})`}>{t("st.cal_y")}</text>
          </>
        )}
      />
    </Figure>
  );
}

function ModelCompare({ e2 }: { e2: NonNullable<Validation["e2"]> }) {
  const { t, fmt, signed, int } = useI18n();
  const seasons = Object.keys(e2.by_season).sort();
  const rows = MODELS.filter((k) => k !== "M2_batter_pitcher");
  const all = seasons.flatMap((s) => rows.flatMap((k) => [e2.by_season[s].models[k].diff_vs_M2.ci_low, e2.by_season[s].models[k].diff_vs_M2.ci_high]));
  const lo = Math.min(0, ...all) - 0.002;
  const hi = Math.max(0, ...all) + 0.002;
  const left = (w: number) => (w < 520 ? 104 : 168);
  const H = 56 * rows.length + 54;
  const x = (v: number, w: number) => left(w) + ((v - lo) / (hi - lo)) * (w - left(w) - 16);
  const m3 = seasons.map((s) => e2.by_season[s].models.M3_lightgbm.diff_vs_M2);
  const items = rows.flatMap((k) => seasons.map((s) => ({ k, s })));
  return (
    <Figure
      title={t("st.ll_title")}
      sub={t("st.ll_sub", { list: seasons.map((s) => t("st.ll_season", { s, n: int(e2.by_season[s].n_pa) })).join("; ") })}
      legend={<Legend items={seasons.map((s, i) => ({ kind: i ? "act" : "opt", shape: "dot" as const, label: s }))} />}
      read={t("st.ll_read", {
        a: seasons[0],
        b: seasons[1],
        da: signed(m3[0].mean, 4),
        la: signed(m3[0].ci_low, 4),
        ha: signed(m3[0].ci_high, 4),
        db: signed(m3[1].mean, 4),
        lb: signed(m3[1].ci_low, 4),
        hb: signed(m3[1].ci_high, 4),
      })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("method.model")}</th>
              {seasons.map((s) => (
                <th key={s} scope="col" className="num">{s}</th>
              ))}
              {seasons.map((s) => (
                <th key={s} scope="col" className="num">{t("st.ll_diff_col", { s })}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODELS.map((k) => (
              <tr key={k}>
                <th scope="row">{t(`model.${k}` as Key)}</th>
                {seasons.map((s) => (
                  <td key={s} className="num">{fmt(e2.by_season[s].models[k].log_loss, 4)}</td>
                ))}
                {seasons.map((s) => {
                  const d = e2.by_season[s].models[k].diff_vs_M2;
                  return (
                    <td key={s} className="num">{k === "M2_batter_pitcher" ? "—" : `${signed(d.mean, 4)} [${signed(d.ci_low, 4)}, ${signed(d.ci_high, 4)}]`}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("st.ll_title")}
        height={H}
        count={items.length}
        indexAt={(_x, py) => {
          const row = Math.floor((py - 10) / 56);
          if (row < 0 || row >= rows.length) return null;
          const sub = py - 10 - row * 56 > 28 ? 1 : 0;
          return row * seasons.length + sub;
        }}
        anchor={(i, w) => ({ x: x(e2.by_season[items[i].s].models[items[i].k].diff_vs_M2.mean, w), y: 40 + Math.floor(i / seasons.length) * 56 })}
        tip={(i) => {
          const { k, s } = items[i];
          const r = e2.by_season[s].models[k];
          return (
            <>
              <b>{t(`model.${k}` as Key)}, {s}</b>
              <br />
              {t("st.tip_ll", { v: fmt(r.log_loss, 4) })}
              <br />
              {signed(r.diff_vs_M2.mean, 4)} [{signed(r.diff_vs_M2.ci_low, 4)}, {signed(r.diff_vs_M2.ci_high, 4)}]
            </>
          );
        }}
        draw={(w, cur) => (
          <>
            {niceTicks(lo, hi, w < 520 ? 3 : 6).map((v) => (
              <g key={v}>
                <line x1={x(v, w)} x2={x(v, w)} y1={8} y2={H - 44} className="st-grid" />
                <text x={x(v, w)} y={H - 28} textAnchor="middle" className="st-tick">{signed(v, 3) || fmt(0, 3)}</text>
              </g>
            ))}
            <line x1={x(0, w)} x2={x(0, w)} y1={8} y2={H - 44} className="st-zero" />
            {rows.map((k, r) => (
              <g key={k}>
                <text x={0} y={10 + r * 56 + 32} className="st-rowlabel">{t(`st.ll_short_${k}` as Key)}</text>
                {seasons.map((s, si) => {
                  const d = e2.by_season[s].models[k].diff_vs_M2;
                  const yy = 10 + r * 56 + 18 + si * 20;
                  const hot = cur === r * seasons.length + si;
                  return (
                    <g key={s}>
                      <line x1={x(d.ci_low, w)} x2={x(d.ci_high, w)} y1={yy} y2={yy} className="st-whisker" />
                      {si === 0 ? (
                        <circle cx={x(d.mean, w)} cy={yy} r={hot ? 6.5 : 4.5} className="st-pt-opt" />
                      ) : (
                        <rect x={x(d.mean, w) - (hot ? 6 : 4)} y={yy - (hot ? 6 : 4)} width={hot ? 12 : 8} height={hot ? 12 : 8} className="st-pt-act" />
                      )}
                    </g>
                  );
                })}
              </g>
            ))}
            <text x={(left(w) + w - 16) / 2} y={H - 8} textAnchor="middle" className="st-axis">{w < 520 ? t("st.ll_axis_short") : t("st.ll_axis")}</text>
          </>
        )}
      />
      <details className="st-tech">
        <summary>{t("st.ll_what")}</summary>
        <Eq label={t("st.ll_what")}>
          <Tx>log-loss</Tx><O>=</O><O>−</O><Frac n={<N>1</N>} d={<I>n</I>} />
          <SumOver from={<Row><I>i</I><O>=</O><N>1</N></Row>} to={<I>n</I>} />
          <mi mathvariant="normal">log</mi><O>&#8201;</O><Sub b={<mover><mi>p</mi><mo>^</mo></mover>} s={<I>i</I>} /><O>(</O><Sub b={<I>c</I>} s={<I>i</I>} /><O>)</O>
        </Eq>
        <p>{t("st.ll_what_text")}</p>
      </details>
    </Figure>
  );
}

function Pit({ pit }: { pit: NonNullable<Validation["e3"]>["pit"] }) {
  const { t, fmt, pct, int } = useI18n();
  const total = pit.pit_hist.reduce((a, v) => a + v, 0);
  const dens = pit.pit_hist.map((c) => (c / total) * 10);
  const max = Math.max(...dens, 1.2) * 1.08;
  const H = 250;
  const m = { l: 40, r: 10, t: 14, b: 46 };
  const y = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const bw = (w: number) => (w - m.l - m.r) / 10;
  const rows = [
    { k: t("st.cov_nominal"), v: 0.8, kind: "neutral" },
    { k: t("st.cov_implied"), v: pit.coverage_80_model_implied, kind: "act" },
    { k: t("st.cov_observed"), v: pit.coverage_80_nominal, kind: "opt" },
  ];
  return (
    <Figure
      title={t("st.pit_title")}
      sub={t("st.pit_sub", { n: int(pit.n) })}
      read={t("st.pit_read", { o: pct(pit.coverage_80_nominal, 1), m: pct(pit.coverage_80_model_implied, 1) })}
    >
      <Chart
        label={t("st.pit_title")}
        height={H}
        count={10}
        indexAt={(px, _y, w) => {
          const i = Math.floor((px - m.l) / bw(w));
          return i >= 0 && i < 10 ? i : null;
        }}
        anchor={(i, w) => ({ x: m.l + (i + 0.5) * bw(w), y: Math.max(70, y(dens[i])) })}
        tip={(i) => (
          <>
            <b>{fmt(i / 10, 1)}–{fmt((i + 1) / 10, 1)}</b>
            <br />
            {t("st.tip_pit", { n: pit.pit_hist[i], d: fmt(dens[i], 2) })}
          </>
        )}
        draw={(w, cur) => (
          <>
            {niceTicks(0, max, 3).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="st-tick">{fmt(v, 1)}</text>
              </g>
            ))}
            {dens.map((v, i) => (
              <rect key={i} x={m.l + i * bw(w) + 1.5} width={bw(w) - 3} y={y(v)} height={H - m.b - y(v)} className={cur === i ? "st-bar st-bar-hot" : "st-bar"} />
            ))}
            <line x1={m.l} x2={w - m.r} y1={y(1)} y2={y(1)} className="st-zero" />
            {[0, 0.5, 1].map((v) => (
              <text key={v} x={m.l + v * (w - m.l - m.r)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{fmt(v, 1)}</text>
            ))}
            <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("st.pit_x")}</text>
          </>
        )}
      />
      <ul className="st-hbars st-cov">
        {rows.map((r) => (
          <li key={r.k}>
            <span className="st-hbar-name">{r.k}</span>
            <span className="st-hbar-track"><span className={`st-hbar st-hbar-${r.kind}`} style={{ width: `${r.v * 100}%` }} /></span>
            <span className="st-hbar-val">{pct(r.v, 1)}</span>
          </li>
        ))}
      </ul>
    </Figure>
  );
}

function Benchmarks({ e3 }: { e3: NonNullable<Validation["e3"]> }) {
  const { t, fmt, int } = useI18n();
  const rows = [
    { k: t("st.mse_model"), v: e3.mse.model, kind: "opt" },
    { k: t("st.mse_const"), v: e3.mse.constant_prior_season, kind: "neutral" },
    { k: t("st.mse_team"), v: e3.mse.team_last60, kind: "neutral" },
  ];
  const top = Math.max(...rows.map((r) => r.v));
  return (
    <Figure
      title={t("st.mse_title")}
      sub={t("st.mse_sub", { n: int(e3.mse_n) })}
      read={t("st.mse_read", { c: fmt(e3.corr, 3), rmse: fmt(Math.sqrt(e3.mse.model), 2) })}
    >
      <ul className="st-hbars">
        {rows.map((r) => (
          <li key={r.k}>
            <span className="st-hbar-name">{r.k}</span>
            <span className="st-hbar-track"><span className={`st-hbar st-hbar-${r.kind}`} style={{ width: `${(r.v / top) * 100}%` }} /></span>
            <span className="st-hbar-val">{fmt(r.v, 3)}</span>
          </li>
        ))}
      </ul>
      <p className="st-axis-note">{t("st.mse_note")}</p>
    </Figure>
  );
}

function HistoricalGains({ e4b, rmse }: { e4b: NonNullable<Validation["e4b"]>; rmse: number | null }) {
  const { t, fmt, signed, int, pct } = useI18n();
  const u = e4b.uplift_opt_vs_actual;
  const edges = e4b.uplift_hist_edges;
  const counts = e4b.uplift_histogram;
  const total = counts.reduce((a, v) => a + v, 0);
  const lo = Math.min(0, edges[0]);
  const hi = edges[edges.length - 1];
  const H = 330;
  const m = { l: 56, r: 12, t: 54, b: 46 };
  const x = (v: number, w: number) => m.l + ((v - lo) / (hi - lo)) * (w - m.l - m.r);
  const maxC = Math.max(...counts);
  const y = (c: number) => H - m.b - (c / maxC) * (H - m.t - m.b);
  const marks = [
    { v: 0, label: t("st.zero"), row: 0 },
    { v: u.median, label: t("st.median"), row: 1 },
    { v: u.mean, label: t("st.mean"), row: 0 },
    { v: u.q90, label: t("st.q90"), row: 0 },
  ];
  return (
    <Figure
      title={t("st.hg_title")}
      sub={t("st.hg_sub", { n: int(e4b.n_team_games) })}
      read={t("st.hg_read", { mean: fmt(u.mean, 4), median: fmt(u.median, 4), q90: fmt(u.q90, 4), max: fmt(u.max, 3), s: signed(u.per_162_games, 1), spread: fmt(e4b.spread_best_minus_worst_mean, 3), rand: fmt(e4b.opt_minus_random_mean, 3) })}
    >
      <p className="st-callout-gold">
        {t("st.hg_scale", { mean: signed(u.mean, 3), s: fmt(u.per_162_games, 1), rmse: rmse === null ? "—" : fmt(rmse, 2) })}
      </p>
      <Chart
        label={t("st.hg_title")}
        height={H}
        count={counts.length}
        indexAt={(px, _y, w) => {
          const v = lo + ((px - m.l) / (w - m.l - m.r)) * (hi - lo);
          const i = edges.findIndex((e, k) => k < counts.length && v >= e && v < edges[k + 1]);
          return i >= 0 ? i : null;
        }}
        anchor={(i, w) => ({ x: x((edges[i] + edges[i + 1]) / 2, w), y: Math.max(m.t + 30, y(counts[i])) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_gain", { lo: signed(edges[i], 3), hi: signed(edges[i + 1], 3) })}</b>
            <br />
            {t("st.tip_games", { n: int(counts[i]), p: pct(counts[i] / total, 1) })}
          </>
        )}
        draw={(w, cur) => (
          <>
            {niceTicks(0, maxC, 4).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="st-tick">{int(v)}</text>
              </g>
            ))}
            {counts.map((c, i) => (
              <rect key={i} x={x(edges[i], w) + 0.5} width={Math.max(1, x(edges[i + 1], w) - x(edges[i], w) - 1)} y={y(c)} height={H - m.b - y(c)} rx={1.5} className={cur === i ? "st-bar st-bar-hot" : "st-bar"} />
            ))}
            {marks.map((k) => (
              <g key={k.label}>
                <line x1={x(k.v, w)} x2={x(k.v, w)} y1={m.t - 4} y2={H - m.b} className={k.v === 0 ? "st-zero" : "st-mark st-mark-gold"} />
                <text x={Math.min(w - 40, Math.max(12, x(k.v, w)))} y={m.t - 10 - k.row * 15} textAnchor="middle" className="st-mark-label">{k.label}</text>
              </g>
            ))}
            {niceTicks(lo, hi, w < 460 ? 4 : 8).map((v) => (
              <text key={v} x={x(v, w)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{fmt(v, 2)}</text>
            ))}
            <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{w < 520 ? t("st.hg_x_short") : t("st.hg_x")}</text>
            <text x={13} y={(m.t + H - m.b) / 2} textAnchor="middle" className="st-axis" transform={`rotate(-90 13 ${(m.t + H - m.b) / 2})`}>{t("st.team_games")}</text>
          </>
        )}
      />
    </Figure>
  );
}

function Ranks({ ranks }: { ranks: NonNullable<Validation["ranks"]> }) {
  const { t, fmt, int, pct } = useI18n();
  const { hist_counts: counts, hist_edges: edges } = ranks;
  const total = counts.reduce((a, v) => a + v, 0);
  const H = 280;
  const m = { l: 56, r: 12, t: 16, b: 46 };
  const maxC = Math.max(...counts);
  const bw = (w: number) => (w - m.l - m.r) / counts.length;
  const y = (c: number) => H - m.b - (c / maxC) * (H - m.t - m.b);
  return (
    <Figure
      title={t("st.ranks_title")}
      sub={t("st.ranks_sub", { n: int(ranks.n_team_games) })}
      read={t("st.ranks_read", { med: pct(ranks.median, 1), mean: pct(ranks.mean, 1), a90: pct(ranks.share_above["0.90"], 1), a99: pct(ranks.share_above["0.99"], 1) })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("st.ranks_x")}</th>
              <th scope="col" className="num">{t("st.team_games")}</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c, i) => (
              <tr key={i}>
                <th scope="row">{pct(edges[i])}–{pct(edges[i + 1])}</th>
                <td className="num">{int(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("st.ranks_title")}
        height={H}
        count={counts.length}
        indexAt={(px, _y, w) => {
          const i = Math.floor((px - m.l) / bw(w));
          return i >= 0 && i < counts.length ? i : null;
        }}
        anchor={(i, w) => ({ x: m.l + (i + 0.5) * bw(w), y: Math.max(70, y(counts[i])) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_rank", { lo: pct(edges[i]), hi: pct(edges[i + 1]) })}</b>
            <br />
            {t("st.tip_games", { n: int(counts[i]), p: pct(counts[i] / total, 1) })}
          </>
        )}
        draw={(w, cur) => (
          <>
            {niceTicks(0, maxC, 4).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="st-tick">{int(v)}</text>
              </g>
            ))}
            {counts.map((c, i) => (
              <rect key={i} x={m.l + i * bw(w) + 1} width={Math.max(1, bw(w) - 2)} y={y(c)} height={H - m.b - y(c)} rx={1.5} className={cur === i ? "st-bar st-bar-hot" : "st-bar"} />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <text key={v} x={m.l + v * (w - m.l - m.r)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{fmt(v * 100, 0)}</text>
            ))}
            <text x={(m.l + w - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("st.ranks_x")}</text>
            <text x={13} y={(m.t + H - m.b) / 2} textAnchor="middle" className="st-axis" transform={`rotate(-90 13 ${(m.t + H - m.b) / 2})`}>{t("st.team_games")}</text>
          </>
        )}
      />
    </Figure>
  );
}

export function ValidationSection({ v, failed }: { v: Validation | null; failed: boolean }) {
  const { t, int, fmt } = useI18n();
  if (failed) return <p className="st-card" role="alert">{t("method.unavailable")}</p>;
  if (!v) return <p className="st-card" aria-busy="true">{t("game.loading")}</p>;
  const e3 = v.e3;
  return (
    <>
      <p className="st-banner">{t("st.val_banner", { n: int(e3?.n_team_games ?? 0) })}</p>
      {e3 && (
        <div className="st-grid-2">
          <Calibration e3={e3} />
          <Pit pit={e3.pit} />
        </div>
      )}
      {v.e2 && <ModelCompare e2={v.e2} />}
      {e3 && <Benchmarks e3={e3} />}
      {v.e4b && <HistoricalGains e4b={v.e4b} rmse={e3 ? Math.sqrt(e3.mse.model) : null} />}
      {v.ranks && <Ranks ranks={v.ranks} />}
      <section className="st-card" aria-labelledby="st-sci">
        <h3 id="st-sci" className="st-card-title">{t("st.sci_title")}</h3>
        <dl className="st-four">
          {(["acc", "opt", "rob", "cf"] as const).map((k) => (
            <div key={k}>
              <dt>{t(`st.sci_${k}` as Key)}</dt>
              <dd>{t(`st.sci_${k}_text` as Key)}</dd>
            </div>
          ))}
        </dl>
        <h4 className="st-h4 st-mt">{t("method.limits")}</h4>
        <ul className="st-list">
          {t("method.limits_items").split("|").map((s) => <li key={s}>{s}</li>)}
        </ul>
        {v.e0 && v.e1 && (
          <p className="st-axis-note">
            {t("st.val_checks", {
              m: int(Math.round(v.e0.share_both_match * v.e0.n)),
              n: int(v.e0.n),
              d: fmt(Math.max(...Object.values(v.e1.by_season).map((s) => s.weighted_mean_abs_diff)), 3),
            })}
          </p>
        )}
        <p className="st-mt">
          <a className="link" href={`${import.meta.env.BASE_URL}paper.pdf`}>{t("st.read_paper")}</a>
        </p>
      </section>
    </>
  );
}
