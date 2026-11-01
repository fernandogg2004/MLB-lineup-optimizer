import { useEffect, useState } from "react";
import { fetchJson } from "../data";
import { useI18n } from "../i18n";
import { ChartCard, niceTicks } from "../components/charts";

interface Validation {
  e2?: { by_season: Record<string, { n_pa: number; models: Record<string, { log_loss: number; diff_vs_M2: { mean: number; ci_low: number; ci_high: number } }> }> };
  e3?: { by_decile: { decile: number; pred: number; obs: number; obs_se: number }[]; calibration_slope: number; bias_obs_minus_pred: number; n_team_games: number };
  e4a?: { methods: Record<string, { mean_gap: number; share_optimal: number; mean_evaluations: number }> };
  e4b?: { uplift_opt_vs_actual: { mean: number; per_162_games: number }; actual_percentile: { median: number } };
}

const MODEL_LABELS: Record<string, string> = {
  M0_league: "M0 · league average",
  M1_batter: "M1 · + batter",
  M2_batter_pitcher: "M2 · + pitcher (selected)",
  M2_default_hyper: "M2 · untuned priors",
  M3_lightgbm: "M3 · gradient boosting",
};

export function MethodView() {
  const { t, fmt, pct, signed } = useI18n();
  const [v, setV] = useState<Validation | null | "error">(null);
  useEffect(() => {
    fetchJson<Validation>("validation.json").then(setV, () => setV("error"));
  }, []);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="hero-q">{t("method.title")}</h1>
        <p className="mt-2 max-w-3xl">{t("method.intro")}</p>
      </header>
      <section className="card">
        <h3 className="card-title">{t("method.objective")}</h3>
        <p className="mt-2">{t("method.objective_text")}</p>
      </section>
      <h2 className="text-xl font-semibold">{t("method.validation")}</h2>
      {v === "error" && <p className="text-muted">{t("method.unavailable")}</p>}
      {v && v !== "error" && (
        <>
          {v.e2 && (
            <ChartCard title={t("method.pa")}>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("method.model")}</th>
                      {Object.keys(v.e2.by_season).map((s) => (
                        <th key={s} scope="col" className="num" colSpan={2}>
                          {s} ({v.e2!.by_season[s].n_pa.toLocaleString()} {t("method.n")})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(MODEL_LABELS).map((m) => (
                      <tr key={m}>
                        <th scope="row" className="text-left font-normal">{MODEL_LABELS[m]}</th>
                        {Object.values(v.e2!.by_season).flatMap((s, i) => {
                          const r = s.models[m];
                          if (!r) return [<td key={`${i}a`} />, <td key={`${i}b`} />];
                          return [
                            <td key={`${i}a`} className="num">{fmt(r.log_loss, 4)}</td>,
                            <td key={`${i}b`} className="num text-muted text-xs">
                              {m === "M2_batter_pitcher" ? "—" : `${signed(r.diff_vs_M2.mean, 4)} [${signed(r.diff_vs_M2.ci_low, 4)}, ${signed(r.diff_vs_M2.ci_high, 4)}]`}
                            </td>,
                          ];
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted mt-2">{t("method.diff")}</p>
            </ChartCard>
          )}
          {v.e3 && <Calibration e3={v.e3} />}
          {v.e4a && (
            <ChartCard title={t("method.search")}>
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
                        <th scope="row" className="text-left font-normal">{k.replaceAll("_", " ")}</th>
                        <td className="num">{fmt(r.mean_gap, 4)}</td>
                        <td className="num">{pct(r.share_optimal)}</td>
                        <td className="num">{Math.round(r.mean_evaluations).toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </ChartCard>
          )}
          {v.e4b && (
            <section className="card">
              <h3 className="card-title">{t("method.actual_vs_opt")}</h3>
              <p className="mt-2">
                {t("method.uplift", { u: signed(v.e4b.uplift_opt_vs_actual.mean, 3), s: signed(v.e4b.uplift_opt_vs_actual.per_162_games, 1) })}
              </p>
              <p className="mt-1">{t("method.pct", { p: pct(v.e4b.actual_percentile.median, 1) })}</p>
            </section>
          )}
        </>
      )}
      <section className="card">
        <h3 className="card-title">{t("method.limits")}</h3>
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
  const { t, fmt } = useI18n();
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
      subtitle={`n = ${e3.n_team_games.toLocaleString()} · slope ${fmt(e3.calibration_slope, 2)} · bias ${fmt(e3.bias_obs_minus_pred, 3)}`}
      table={
        <table className="data-table">
          <thead>
            <tr><th>#</th><th className="num">{t("method.pred")}</th><th className="num">{t("method.obs")}</th></tr>
          </thead>
          <tbody>
            {e3.by_decile.map((d) => (
              <tr key={d.decile}><td>{d.decile + 1}</td><td className="num">{fmt(d.pred, 2)}</td><td className="num">{fmt(d.obs, 2)} ± {fmt(2 * d.obs_se, 2)}</td></tr>
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
    </ChartCard>
  );
}
