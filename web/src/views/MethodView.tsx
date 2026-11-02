import { useEffect, useState } from "react";
import { fetchJson } from "../data";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import { ChartCard } from "../components/charts";
import { niceTicks } from "../components/ticks";

type Diff = { mean: number; ci_low: number; ci_high: number };
interface Validation {
  e2?: { by_season: Record<string, { n_pa: number; models: Record<string, { log_loss: number; diff_vs_M2: Diff }> }> };
  e2b?: { window: string[]; n_pa_matched: number; models: Record<string, { log_loss: number; diff_vs_M2: Diff }> };
  e3?: { by_decile: { decile: number; pred: number; obs: number; obs_se: number }[]; calibration_slope: number; bias_obs_minus_pred: number; n_team_games: number };
  e4a?: { methods: Record<string, { n: number; mean_gap: number; share_optimal: number; mean_evaluations: number }>; noisy_ga?: { mean_winners_curse: number } };
  e4b?: { n_team_games?: number; uplift_opt_vs_actual: { mean: number; per_162_games: number }; actual_percentile: { median: number } };
  e4c?: { n_team_games: number; draws_per_game: number; mean_p_opt_better: number; share_interval_excludes_0: number; mean_p_same_optimum: number };
}

const MODELS = ["M0_league", "M1_batter", "M2_batter_pitcher", "M2_default_hyper", "M3_lightgbm"] as const;

function Takeaway({ children }: { children: string }) {
  return <p className="callout mt-3">{children}</p>;
}

export function MethodView() {
  const { t, fmt, pct, signed, int, date } = useI18n();
  const [v, setV] = useState<Validation | null | "error">(null);
  useEffect(() => {
    fetchJson<Validation>("validation.json").then(setV, () => setV("error"));
  }, []);
  const diffCell = (d: Diff) => `${signed(d.mean, 4)} [${signed(d.ci_low, 4)}, ${signed(d.ci_high, 4)}]`;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="hero-q">{t("method.title")}</h1>
        <p className="mt-2 max-w-3xl">{t("method.intro")}</p>
      </header>
      <section className="card" aria-labelledby="m-obj">
        <h2 id="m-obj" className="card-title">{t("method.objective")}</h2>
        <p className="mt-2">{t("method.objective_text")}</p>
      </section>
      <section aria-labelledby="m-val" className="space-y-6">
        <h2 id="m-val" className="text-xl font-semibold">{t("method.validation")}</h2>
        {v === "error" && <p className="text-muted">{t("method.unavailable")}</p>}
        {v && v !== "error" && (
          <>
            {v.e2 && (
              <ChartCard title={t("method.pa")}>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("method.pa")}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col" rowSpan={2}>{t("method.model")}</th>
                        {Object.keys(v.e2.by_season).map((s) => (
                          <th key={s} scope="colgroup" className="num" colSpan={2}>
                            {s} ({int(v.e2!.by_season[s].n_pa)} {t("method.n")})
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {Object.keys(v.e2.by_season).flatMap((s) => [
                          <th key={`${s}a`} scope="col" className="num">{t("method.ll_col")}</th>,
                          <th key={`${s}b`} scope="col" className="num">{t("method.diff_col")}</th>,
                        ])}
                      </tr>
                    </thead>
                    <tbody>
                      {MODELS.map((m) => (
                        <tr key={m}>
                          <th scope="row" className="text-left font-normal">{t(`model.${m}` as Key)}</th>
                          {Object.values(v.e2!.by_season).flatMap((s, i) => {
                            const r = s.models[m];
                            if (!r) return [<td key={`${i}a`} />, <td key={`${i}b`} />];
                            return [
                              <td key={`${i}a`} className="num">{fmt(r.log_loss, 4)}</td>,
                              <td key={`${i}b`} className="num text-muted text-xs">
                                {m === "M2_batter_pitcher" ? "—" : diffCell(r.diff_vs_M2)}
                              </td>,
                            ];
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Takeaway>{t("method.pa_take")}</Takeaway>
              </ChartCard>
            )}
            {v.e2b && (
              <ChartCard
                title={t("method.legacy")}
                subtitle={`${date(v.e2b.window[0])} – ${date(v.e2b.window[1])} · ${int(v.e2b.n_pa_matched)} ${t("method.n")}`}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("method.model")}</th>
                      <th scope="col" className="num">{t("method.ll_col")}</th>
                      <th scope="col" className="num">{t("method.diff_col")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["legacy_lightgbm_51_features", "model.legacy"],
                        ["M0_league", "model.M0_league"],
                        ["M2_batter_pitcher", "model.M2_batter_pitcher"],
                      ] as const
                    ).map(([k, label]) => {
                      const r = v.e2b!.models[k];
                      return (
                        <tr key={k}>
                          <th scope="row" className="text-left font-normal">{t(label)}</th>
                          <td className="num">{fmt(r.log_loss, 4)}</td>
                          <td className="num text-xs text-muted">{k === "M2_batter_pitcher" ? "—" : diffCell(r.diff_vs_M2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Takeaway>{t("method.legacy_take")}</Takeaway>
              </ChartCard>
            )}
            {v.e3 && <Calibration e3={v.e3} />}
            {v.e4a && (
              <ChartCard title={t("method.search")} subtitle={t("method.search_n", { n: int(v.e4a.methods.exhaustive?.n ?? 0) })}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("method.method")}</th>
                      <th scope="col" className="num">{t("method.gap")}</th>
                      <th scope="col" className="num">{t("method.found")}</th>
                      <th scope="col" className="num">{t("method.evals")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(v.e4a.methods)
                      .sort((a, b) => a[1].mean_gap - b[1].mean_gap)
                      .map(([k, r]) => (
                        <tr key={k}>
                          <th scope="row" className="text-left font-normal">{t(`search.${k}` as Key)}</th>
                          <td className="num">{fmt(r.mean_gap, 4)}</td>
                          <td className="num">{pct(r.share_optimal)}</td>
                          <td className="num">{int(r.mean_evaluations)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <Takeaway>{t("method.search_take", { curse: fmt(v.e4a.noisy_ga?.mean_winners_curse ?? 0, 2) })}</Takeaway>
              </ChartCard>
            )}
            {v.e4b && (
              <section className="card" aria-labelledby="m-e4b">
                <h2 id="m-e4b" className="card-title">{t("method.actual_vs_opt")}</h2>
                {v.e4b.n_team_games && <p className="card-sub">{t("method.actual_n", { n: int(v.e4b.n_team_games) })}</p>}
                <p className="mt-2">
                  {t("method.uplift", { u: signed(v.e4b.uplift_opt_vs_actual.mean, 3), s: signed(v.e4b.uplift_opt_vs_actual.per_162_games, 1) })}
                </p>
                <p className="mt-1">{t("method.pct", { p: pct(v.e4b.actual_percentile.median, 1) })}</p>
              </section>
            )}
            {v.e4c && (
              <section className="card" aria-labelledby="m-e4c">
                <h2 id="m-e4c" className="card-title">
                  {t("method.e4c", { n: int(v.e4c.n_team_games), d: int(v.e4c.draws_per_game) })}
                </h2>
                <dl className="grid gap-3 sm:grid-cols-3 text-sm mt-3">
                  <div className="mini">
                    <dt className="text-muted">{t("method.e4c_better")}</dt>
                    <dd className="mini-val">{pct(v.e4c.mean_p_opt_better)}</dd>
                  </div>
                  <div className="mini">
                    <dt className="text-muted">{t("method.e4c_excl")}</dt>
                    <dd className="mini-val">{pct(v.e4c.share_interval_excludes_0)}</dd>
                  </div>
                  <div className="mini">
                    <dt className="text-muted">{t("method.e4c_same")}</dt>
                    <dd className="mini-val">{pct(v.e4c.mean_p_same_optimum)}</dd>
                  </div>
                </dl>
                <Takeaway>{t("method.e4c_take")}</Takeaway>
              </section>
            )}
          </>
        )}
      </section>
      <section className="card" aria-labelledby="m-lim">
        <h2 id="m-lim" className="card-title">{t("method.limits")}</h2>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          {t("method.limits_items").split("|").map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Calibration({ e3 }: { e3: NonNullable<Validation["e3"]> }) {
  const { t, fmt, int, signed } = useI18n();
  const W = 420;
  const H = 300;
  const m = { l: 52, r: 16, t: 16, b: 44 };
  const vals = e3.by_decile.flatMap((d) => [d.pred, d.obs - 2 * d.obs_se, d.obs + 2 * d.obs_se]);
  const lo = Math.floor(Math.min(...vals) * 2) / 2;
  const hi = Math.ceil(Math.max(...vals) * 2) / 2;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
  const ticks = niceTicks(lo, hi, 4);
  return (
    <ChartCard
      title={t("method.calib")}
      subtitle={t("method.calib_sub", { n: int(e3.n_team_games), slope: fmt(e3.calibration_slope, 2), bias: signed(e3.bias_obs_minus_pred, 3) })}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="num">{t("method.pred")}</th>
              <th scope="col" className="num">{t("method.obs")}</th>
            </tr>
          </thead>
          <tbody>
            {e3.by_decile.map((d) => (
              <tr key={d.decile}>
                <td>{d.decile + 1}</td>
                <td className="num">{fmt(d.pred, 2)}</td>
                <td className="num">{fmt(d.obs, 2)} ± {fmt(2 * d.obs_se, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md h-auto" role="img" aria-label={t("method.calib")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="tick">{fmt(v, 1)}</text>
            <text x={x(v)} y={H - m.b + 16} textAnchor="middle" className="tick">{fmt(v, 1)}</text>
          </g>
        ))}
        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} className="zero-line" />
        {e3.by_decile.map((d) => (
          <g key={d.decile}>
            <line x1={x(d.pred)} x2={x(d.pred)} y1={y(d.obs - 2 * d.obs_se)} y2={y(d.obs + 2 * d.obs_se)} className="interval" />
            <circle cx={x(d.pred)} cy={y(d.obs)} r={5} className="interval-dot" />
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 8} textAnchor="middle" className="axis-label">{t("method.pred")}</text>
        <text x={14} y={(m.t + H - m.b) / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 14 ${(m.t + H - m.b) / 2})`}>{t("method.obs")}</text>
      </svg>
      <Takeaway>{t("method.calib_take")}</Takeaway>
    </ChartCard>
  );
}
