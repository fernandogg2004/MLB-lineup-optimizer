import { useState } from "react";
import type { GameSnapshot, Team } from "../../data";
import { useI18n } from "../../i18n-context";
import type { Key } from "../../strings";
import { Eq, I, N, O, ObjectiveFormula, Pi, Row, Sub } from "./Math";

const STAGES = ["data", "probs", "markov", "evaluate", "select"] as const;

export function Overview({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt, signed, pct, date, series, int } = useI18n();
  const [stage, setStage] = useState<(typeof STAGES)[number]>("data");
  const g = snap.game;
  const opp = snap.teams[team === snap.teams.away ? "home" : "away"];
  const u = team.uncertainty;
  const uplift = team.optimal.er9 - team.actual.er9;
  const top = Math.max(0.01, Math.ceil((1 - Math.min(snap.teams.away.actual.percentile, snap.teams.home.actual.percentile)) * 100) / 100);
  const label = g.series_description && g.series_game_number ? t("game.series", { series: series(g.series_description), n: g.series_game_number }) : series(g.series_description);
  const kernel = snap.cutoff.kernel as { n_transitions?: number };
  const vars = {
    from: date(snap.cutoff.pa_history_from),
    to: date(snap.cutoff.information_before),
    n: int(kernel.n_transitions ?? 0),
    count: int(team.all_orders.count),
    v: fmt(team.optimal.er9, 3),
  };
  return (
    <>
      <div className="st-game">
        <div className="st-game-head">
          <div className="st-game-tags">
            {g.reference === "true" && <span className="badge badge-ref">{t("game.reference")}</span>}
            <span className="badge badge-fact">{t("game.historical")}</span>
          </div>
          <p className="st-game-line">
            {label} · {date(g.date)} · {g.venue}
          </p>
          <p className="st-game-score">
            {g.away} <b>{g.away_runs}</b> <span aria-hidden="true">–</span> <b>{g.home_runs}</b> {g.home} <span className="text-muted">({t("game.final")})</span>
          </p>
          <p className="st-game-line">
            <b>{team.name}</b>{" "}
            {t("team.vs", { pitcher: team.opponent_starter.name, hand: t(team.opponent_starter.throws === "L" ? "hand.L" : "hand.R"), team: opp.name })}
          </p>
          <p className="st-game-line text-muted">{t("hero.cutoff", { date: date(g.date) })}</p>
        </div>
        <dl className="st-kpis">
          <div className="stat stat-used">
            <dt className="stat-label">{t("kpi.actual")}</dt>
            <dd className="stat-value">{fmt(team.actual.er9, 3)}</dd>
            <dd className="stat-sub">{t("kpi.runs9")}</dd>
          </div>
          <div className="stat stat-optimal">
            <dt className="stat-label">{t("kpi.optimal")}</dt>
            <dd className="stat-value">{fmt(team.optimal.er9, 3)}</dd>
            <dd className="stat-sub">{t("kpi.runs9")}</dd>
          </div>
          <div className="stat stat-gain">
            <dt className="stat-label">{t("kpi.uplift")}</dt>
            <dd className="stat-value">{signed(uplift, 3)}</dd>
            <dd className="stat-sub">{t("kpi.uplift_sub", { lo: signed(u.diff_q05, 3), hi: signed(u.diff_q95, 3) })}</dd>
          </div>
          <div className="stat">
            <dt className="stat-label">{t("kpi.rank")}</dt>
            <dd className="stat-value">{pct(team.actual.percentile, 1)}</dd>
            <dd className="stat-sub">{t("kpi.rank_sub", { pct: pct(team.actual.percentile, 1) })}</dd>
          </div>
        </dl>
        <p className="st-verdict">
          {top <= 0.1
            ? t("hero.verdict", { top: pct(top) })
            : t("st.verdict_mixed", { a: snap.teams.away.name, b: snap.teams.home.name, pa: pct(snap.teams.away.actual.percentile, 1), pb: pct(snap.teams.home.actual.percentile, 1) })}
        </p>
      </div>

      <section className="st-card" aria-labelledby="st-pipe">
        <h3 id="st-pipe" className="st-card-title">
          {t("st.pipe_title")}
        </h3>
        <ol className="st-pipe">
          {STAGES.map((s, i) => (
            <li key={s}>
              <button type="button" aria-pressed={stage === s} onClick={() => setStage(s)} onPointerEnter={(e) => e.pointerType === "mouse" && setStage(s)}>
                <span className="st-pipe-n" aria-hidden="true">
                  {i + 1}
                </span>
                {t(`st.pipe_${s}` as Key, vars)}
              </button>
            </li>
          ))}
        </ol>
        <p className="st-pipe-detail" aria-live="polite">
          {t(`st.pipe_${stage}_text` as Key, vars)}
        </p>
      </section>

      <section className="st-card" aria-labelledby="st-obj">
        <h3 id="st-obj" className="st-card-title">
          {t("st.obj_title")}
        </h3>
        <ObjectiveFormula label={t("st.obj_label")} />
        <p className="st-read">{t("st.obj_read")}</p>
        <details className="st-tech">
          <summary>{t("st.obj_symbols")}</summary>
          <dl className="st-symbols">
            <div>
              <dt>
                <Eq inline label="">
                  <Pi />
                </Eq>
              </dt>
              <dd>{t("st.sym_pi")}</dd>
            </div>
            <div>
              <dt>
                <Eq inline label="">
                  <Sub b={<I>S</I>} s={<N>9</N>} />
                </Eq>
              </dt>
              <dd>{t("st.sym_s9")}</dd>
            </div>
            <div>
              <dt>
                <Eq inline label="">
                  <Sub b={<I>R</I>} s={<N>9</N>} />
                </Eq>
              </dt>
              <dd>{t("st.sym_r9")}</dd>
            </div>
            <div>
              <dt>
                <Eq inline label="">
                  <Row>
                    <mi>ℐ</mi>
                  </Row>
                </Eq>
              </dt>
              <dd>{t("st.sym_i", { to: date(snap.cutoff.information_before) })}</dd>
            </div>
            <div>
              <dt>
                <Eq inline label="">
                  <Row>
                    <I>V</I>
                    <O>(</O>
                    <Pi />
                    <O>)</O>
                  </Row>
                </Eq>
              </dt>
              <dd>{t("st.sym_v")}</dd>
            </div>
          </dl>
        </details>
      </section>
    </>
  );
}
