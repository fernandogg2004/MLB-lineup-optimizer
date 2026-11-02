import { useMemo, useState } from "react";
import type { GameSnapshot, Team } from "../data";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import { ChartCard, Histogram, IntervalBar, PairedBars, PmfChart } from "../components/charts";
import { Simulator } from "./Simulator";

const OUTCOMES = ["K", "BB", "1B", "2B", "3B", "HR", "GB", "AIR"] as const;

function sd(p: number[]): number {
  const m = p.reduce((a, v, i) => a + v * i, 0);
  return Math.sqrt(p.reduce((a, v, i) => a + v * (i - m) ** 2, 0));
}

export function GameView({ snap }: { snap: GameSnapshot }) {
  const { t, fmt, signed, lang } = useI18n();
  const g = snap.game;
  const [side, setSide] = useState<"away" | "home">("away");
  const team = snap.teams[side];
  const date = new Date(`${g.date}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const ua = snap.teams.away.optimal.er9 - snap.teams.away.actual.er9;
  const ub = snap.teams.home.optimal.er9 - snap.teams.home.actual.er9;
  const gameSd = (sd(snap.teams.away.actual.run_distribution) + sd(snap.teams.home.actual.run_distribution)) / 2;

  return (
    <div className="space-y-6">
      <header className="hero">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {g.reference === "true" && <span className="badge badge-ref">{t("game.reference")}</span>}
          <span className="text-muted">
            {g.series_description && g.series_game_number
              ? t("game.series", { series: g.series_description, n: g.series_game_number })
              : g.series_description}{" "}
            · {date} · {g.venue}
          </span>
        </div>
        <div className="scoreboard" aria-label={t("game.result")}>
          <span className="badge badge-fact">{t("game.historical")}</span>
          <div className="score-row">
            <span className="score-team">{g.away}</span>
            <span className="score-num">{g.away_runs}</span>
          </div>
          <div className="score-row">
            <span className="score-team">{g.home}</span>
            <span className="score-num">{g.home_runs}</span>
          </div>
          <div className="text-xs text-muted">{t("game.final")}</div>
        </div>
        <h1 className="hero-q">{t("hero.question")}</h1>
        <p className="hero-a">
          <span className="badge badge-model mr-2">{t("game.model")}</span>
          {t("hero.answer", {
            ua: signed(ua, 3),
            ub: signed(ub, 3),
            a: snap.teams.away.name,
            b: snap.teams.home.name,
            sd: fmt(gameSd, 1),
          })}
        </p>
        <p className="text-sm text-muted mt-2">{t("hero.cutoff", { date })}</p>
      </header>

      <div role="tablist" aria-label={t("team.select")} className="segmented">
        {(["away", "home"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            className={side === s ? "seg seg-on" : "seg"}
            onClick={() => setSide(s)}
          >
            {snap.teams[s].name}
          </button>
        ))}
      </div>

      <TeamPanel snap={snap} team={team} />
    </div>
  );
}

function TeamPanel({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt, signed, pct } = useI18n();
  const opp = snap.teams[team === snap.teams.away ? "home" : "away"];
  const u = team.uncertainty;
  const uplift = team.optimal.er9 - team.actual.er9;
  return (
    <div className="space-y-6" role="tabpanel">
      <p className="text-muted">
        {t("team.vs", { pitcher: team.opponent_starter.name, hand: team.opponent_starter.throws, team: opp.name })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("kpi.actual")} value={fmt(team.actual.er9, 3)} sub={t("kpi.runs9")} kind="used" />
        <Stat label={t("kpi.optimal")} value={fmt(team.optimal.er9, 3)} sub={t("kpi.runs9")} kind="optimal" />
        <Stat
          label={t("kpi.uplift")}
          value={signed(uplift, 3)}
          sub={t("kpi.uplift_sub", { lo: signed(u.diff_q05, 3), hi: signed(u.diff_q95, 3) })}
          extra={t("kpi.prob", { p: pct(u.p_opt_better) })}
        />
        <Stat
          label={t("kpi.rank")}
          value={pct(team.actual.percentile, 1)}
          sub={t("kpi.rank_sub", { pct: pct(team.actual.percentile, 1) })}
        />
      </div>

      <LineupComparison team={team} />
      <WhyPanel team={team} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t("dist.title")}
          subtitle={t("dist.subtitle")}
          footer={t("dist.spread", { d: fmt(team.optimal.er9 - team.worst.er9, 3) })}
          table={
            <table className="data-table">
              <tbody>
                {[
                  [t("dist.optimal"), team.optimal.er9],
                  [t("dist.book"), team.the_book.er9],
                  [t("dist.used"), team.actual.er9],
                  ["μ", team.all_orders.mean],
                  [t("dist.worst"), team.worst.er9],
                ].map(([k, v]) => (
                  <tr key={String(k)}>
                    <th scope="row">{k}</th>
                    <td>{fmt(Number(v), 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <Histogram
            edges={team.all_orders.hist.edges}
            counts={team.all_orders.hist.counts}
            xLabel={t("dist.x")}
            yLabel={t("dist.y")}
            digits={2}
            markers={[
              { value: team.actual.er9, label: t("dist.used"), kind: "used" },
              { value: team.optimal.er9, label: t("dist.optimal"), kind: "optimal" },
              { value: team.worst.er9, label: t("dist.worst"), kind: "neutral" },
            ]}
          />
        </ChartCard>
        <ChartCard
          title={t("runs.title")}
          subtitle={t("runs.subtitle", { r: team.observed_runs ?? "—" })}
          footer={t("runs.observed_note")}
          table={
            <table className="data-table">
              <tbody>
                {team.actual.run_distribution.slice(0, 16).map((p, i) => (
                  <tr key={i}>
                    <th scope="row">{i}</th>
                    <td>{fmt(p * 100, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <PmfChart
            probs={team.actual.run_distribution}
            observed={team.observed_runs}
            observedLabel={t("runs.observed")}
            xLabel={t("runs.x")}
            maxX={15}
          />
        </ChartCard>
      </div>

      <ChartCard title={t("unc.title")} subtitle={t("unc.subtitle", { n: u.n_draws })}>
        <IntervalBar
          lo={u.diff_q05}
          mid={uplift}
          hi={u.diff_q95}
          domain={[Math.min(-0.02, u.diff_q05 - 0.01), Math.max(0.06, u.diff_q95 + 0.01)]}
          label={t("unc.interval")}
        />
        <dl className="grid gap-3 sm:grid-cols-3 text-sm mt-2">
          <div className="mini">
            <dt className="text-muted">{t("unc.interval")}</dt>
            <dd className="mini-val">
              {signed(u.diff_q05, 3)} … {signed(u.diff_q95, 3)}
            </dd>
          </div>
          <div className="mini">
            <dt className="text-muted">{t("unc.prob")}</dt>
            <dd className="mini-val">{pct(u.p_opt_better)}</dd>
          </div>
          <div className="mini">
            <dt className="text-muted">{t("unc.stable")}</dt>
            <dd className="mini-val">
              {pct(u.p_same_optimum)}
            </dd>
          </div>
        </dl>
      </ChartCard>

      <Simulator key={`${snap.game.game_pk}-${team.team}`} snap={snap} team={team} />
      <Technical snap={snap} team={team} />
    </div>
  );
}

function Stat(props: { label: string; value: string; sub: string; extra?: string; kind?: "used" | "optimal" }) {
  const { t } = useI18n();
  return (
    <div className={`stat ${props.kind ? `stat-${props.kind}` : ""}`}>
      <div className="stat-label">
        {props.label} <span className="badge badge-model">{t("game.model")}</span>
      </div>
      <div className="stat-value">{props.value}</div>
      <div className="stat-sub">{props.sub}</div>
      {props.extra && <div className="stat-sub">{props.extra}</div>}
    </div>
  );
}

function LineupComparison({ team }: { team: Team }) {
  const { t, fmt } = useI18n();
  const same = team.optimal.order.every((p, i) => p === team.actual.order[i]);
  const optSlot = (p: number) => team.optimal.order.indexOf(p);
  return (
    <section className="card" aria-labelledby="lc-title">
      <h3 id="lc-title" className="card-title">
        {t("lineup.title")}
      </h3>
      {same && <p className="card-sub">{t("lineup.identical")}</p>}
      <div className="grid gap-6 md:grid-cols-2 mt-3">
        {(["used", "optimal"] as const).map((kind) => {
          const order = kind === "used" ? team.actual.order : team.optimal.order;
          return (
            <div key={kind}>
              <h4 className={`lineup-head lineup-head-${kind}`}>{kind === "used" ? t("lineup.used") : t("lineup.optimal")}</h4>
              <table className="lineup">
                <thead>
                  <tr>
                    <th scope="col">{t("lineup.slot")}</th>
                    <th scope="col">{t("lineup.player")}</th>
                    <th scope="col" className="hidden sm:table-cell">{t("lineup.pos")}</th>
                    <th scope="col" className="num">{t("lineup.obp")}</th>
                    <th scope="col" className="num hidden sm:table-cell">{t("lineup.power")}</th>
                    {kind === "optimal" && <th scope="col"><span className="sr-only">Δ</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {order.map((p, i) => {
                    const h = team.hitters[p];
                    const d = p - optSlot(p); // actual slot index == p
                    return (
                      <tr key={p}>
                        <td className="slot">{i + 1}</td>
                        <td>
                          {h.name}
                          <div className="text-xs text-muted">{t("lineup.history", { n: Math.round(h.history_pa) })}</div>
                        </td>
                        <td className="text-muted hidden sm:table-cell">{h.pos}</td>
                        <td className="num">{fmt(h.obp, 3)}</td>
                        <td className="num hidden sm:table-cell">{fmt(h.power, 3)}</td>
                        {kind === "optimal" && (
                          <td className="move">
                            {d > 0 ? (
                              <span className="up">▲ {t("lineup.up", { n: d })}</span>
                            ) : d < 0 ? (
                              <span className="down">▼ {t("lineup.down", { n: -d })}</span>
                            ) : (
                              <span className="text-muted">= {t("lineup.same")}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-3">{t("lineup.note")}</p>
    </section>
  );
}

function WhyPanel({ team }: { team: Team }) {
  const { t, fmt, signed } = useI18n();
  const paUsed = team.actual.pa_by_slot;
  const paOpt = team.optimal.pa_by_slot;
  const moves = useMemo(
    () =>
      team.hitters
        .map((h, p) => {
          const to = team.optimal.order.indexOf(p);
          return { name: h.name, from: p + 1, to: to + 1, dpa: paOpt[to] - paUsed[p] };
        })
        .filter((m) => m.from !== m.to)
        .sort((a, b) => Math.abs(b.dpa) - Math.abs(a.dpa)),
    [team, paOpt, paUsed],
  );
  return (
    <section className="card" aria-labelledby="why-title">
      <h3 id="why-title" className="card-title">
        {t("why.title")}
      </h3>
      <p className="mt-2">{t("why.intro", { d: fmt(paUsed[0] - paUsed[8], 2) })}</p>
      {moves.length > 0 && (
        <ul className="list-disc ml-5 mt-2 space-y-1">
          {moves.slice(0, 5).map((m) => (
            <li key={m.name}>{t("why.move", { name: m.name, from: m.from, to: m.to, pa: signed(m.dpa, 2) })}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted mt-3">{t("why.caveat")}</p>
      <div className="mt-4">
        <h4 className="font-medium text-sm">{t("tech.pa")}</h4>
        <PairedBars
          categories={paUsed.map((_, i) => String(i + 1))}
          a={paUsed}
          b={paOpt}
          aLabel={t("tech.pa_used")}
          bLabel={t("tech.pa_opt")}
        />
      </div>
    </section>
  );
}

function Technical({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt, pct } = useI18n();
  return (
    <details className="card">
      <summary className="card-title cursor-pointer">{t("tech.title")}</summary>
      <div className="mt-4 space-y-6">
        <div className="overflow-x-auto">
          <h4 className="font-medium text-sm mb-2">{t("tech.probs")}</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("lineup.player")}</th>
                <th scope="col" />
                {OUTCOMES.map((o) => (
                  <th key={o} scope="col" className="num">
                    <abbr title={t(`outcome.${o}` as Key)}>{o}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.hitters.flatMap((h) => [
                <tr key={`${h.id}s`}>
                  <th scope="row" rowSpan={2} className="text-left font-normal">
                    {h.name}
                  </th>
                  <td className="text-muted text-xs">{t("tech.vs_starter")}</td>
                  {h.probs_starter.map((p, i) => (
                    <td key={i} className="num">{fmt(p * 100, 1)}</td>
                  ))}
                </tr>,
                <tr key={`${h.id}b`}>
                  <td className="text-muted text-xs">{t("tech.vs_bullpen")}</td>
                  {h.probs_bullpen.map((p, i) => (
                    <td key={i} className="num">{fmt(p * 100, 1)}</td>
                  ))}
                </tr>,
              ])}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <h4 className="font-medium text-sm mb-2">{t("tech.regime")}</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("tech.inning")}</th>
                {team.regime_weights.map((_, k) => (
                  <th key={k} scope="col" className="num">{k + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{team.opponent_starter.name}</th>
                {team.regime_weights.map((w, k) => (
                  <td key={k} className="num">{pct(w[0])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          {t("tech.version", { date: snap.generated_at.slice(0, 10), sw: `${snap.software.package}@${snap.software.git}`, cutoff: snap.cutoff.information_before })}
          {" · "}
          <a className="link" href={`${import.meta.env.BASE_URL}data/games/${snap.game.game_pk}.json`} download>
            {t("tech.download")}
          </a>
        </p>
      </div>
    </details>
  );
}
