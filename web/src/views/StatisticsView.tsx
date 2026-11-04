import { useEffect, useState } from "react";
import { fetchJson, validateSnapshot, type GameSnapshot, type HomeData } from "../data";
import { setStadiumDepth } from "../home/stadium";
import { useMedia } from "../home/format";
import { useI18n } from "../i18n-context";
import { statsHash, type StatsTab } from "../route";
import { GameView } from "./GameView";
import { MethodView } from "./MethodView";
import { Simulator } from "./Simulator";

const REPO = "https://github.com/fernandogg2004/mlb-lineup-optimizer";

/** Season lines behind the rings on Home, with their definitions and source. */
function SeasonHitting({ pk, team }: { pk: number; team: string }) {
  const { t, date } = useI18n();
  const [data, setData] = useState<HomeData | null>(null);
  const [photos, setPhotos] = useState<{ author: string; source: string; license: string }[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}players/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ players: { author: string; source: string; license: string }[] }>) : { players: [] }))
      .then((m) => setPhotos(m.players))
      .catch(() => setPhotos([]));
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchJson<HomeData>(`home/${pk}.json`).then(
      (d) => {
        if (!cancelled) setData(d);
      },
      () => {
        if (!cancelled) setData(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pk]);
  if (!data) return null;
  const hit = data.hitting;
  const squad = data.teams.home.team === team ? data.teams.home : data.teams.away;
  const rates = ["avg", "obp", "slg", "ops"] as const;
  return (
    <section className="card" aria-labelledby="hit-title">
      <h2 id="hit-title" className="card-title">
        {t("hit.title")}
      </h2>
      <p className="card-sub">{t("hit.sub", { start: date(hit.start), end: date(hit.end), season: hit.season })}</p>
      <div className="overflow-x-auto mt-3" tabIndex={0} role="region" aria-label={t("hit.table")}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="text-left">{t("lineup.player")}</th>
              <th scope="col" className="num">PA</th>
              {rates.map((r) => (
                <th key={r} scope="col" className="num">
                  <abbr title={t(`stat.${r}`)}>{r.toUpperCase()}</abbr>
                </th>
              ))}
              {rates.map((r) => (
                <th key={r} scope="col" className="num">
                  {t("hit.pct", { stat: r.toUpperCase() })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {squad.hitters.map((h) => (
              <tr key={h.id}>
                <th scope="row" className="text-left font-normal">{h.name}</th>
                <td className="num">{h.batting.pa}</td>
                {rates.map((r) => (
                  <td key={r} className="num">{h.batting.rates[r] ?? "—"}</td>
                ))}
                {rates.map((r) => (
                  <td key={r} className="num">{h.batting.pct[r] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="font-medium text-sm mt-4">{t("hit.defs")}</h3>
      <dl className="hit-defs">
        {rates.map((r) => (
          <div key={r}>
            <dt>{r.toUpperCase()}: {t(`stat.${r}`)}</dt>
            <dd>{t(`hit.def_${r}`)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm mt-3">{t("hit.source")}</p>
      <p className="text-sm mt-2">{t("hit.pool", { min: hit.min_pa, pool: hit.pool_size })}</p>
      <p className="text-sm mt-2">{t("hit.pie")}</p>
      <p className="text-sm mt-2 text-muted">{t("hit.figure")}</p>
      {photos.length > 0 && (
        <p className="text-sm mt-2 text-muted">
          {t("hit.credits", { credits: photos.map((p) => `${p.author} (${p.license})`).join("; ") })}
        </p>
      )}
    </section>
  );
}

export function StatisticsView({ tab, pk, team }: { tab: StatsTab; pk: number; team: string }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<{ pk: number; snap: GameSnapshot | null } | null>(null);
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const needsGame = tab !== "method";

  useEffect(() => {
    if (!needsGame) return;
    let cancelled = false;
    fetchJson<GameSnapshot>(`games/${pk}.json`)
      .then((s) => {
        validateSnapshot(s);
        if (!cancelled) setLoaded({ pk, snap: s });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ pk, snap: null });
      });
    return () => {
      cancelled = true;
    };
  }, [pk, needsGame]);

  // The stadium drifts gently behind this page too.
  useEffect(() => {
    setStadiumDepth(0);
    if (still) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setStadiumDepth(max > 0 ? (window.scrollY / max) * 6 : 0);
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(frame);
    };
  }, [still]);

  const current = loaded && loaded.pk === pk ? loaded : null;
  const snap = current?.snap ?? null;
  const side = snap && snap.teams.home.team === team ? "home" : "away";
  const tabs: [StatsTab, Parameters<typeof t>[0]][] = [
    ["game", "nav.game"],
    ["simulator", "nav.simulator"],
    ["method", "nav.method"],
  ];

  return (
    <div className="stats-page">
      <div className="container">
        <nav className="tabs" aria-label={t("stats.tabs")}>
          {tabs.map(([key, label]) => (
            <a key={key} className="nav-link" href={statsHash(key, pk, team)} aria-current={tab === key ? "page" : undefined}>
              {t(label)}
            </a>
          ))}
          <a className="nav-link" href={`${import.meta.env.BASE_URL}paper.pdf`}>
            {t("nav.paper")}
          </a>
          <a className="nav-link" href={REPO} rel="noopener">
            {t("nav.code")}
          </a>
        </nav>
        {tab === "method" ? (
          <MethodView />
        ) : current && !snap ? (
          <p role="alert">{t("game.error")}</p>
        ) : !snap ? (
          <p aria-busy="true">{t("game.loading")}</p>
        ) : tab === "simulator" ? (
          <Simulator key={`${snap.game.game_pk}-${snap.teams[side].team}`} snap={snap} team={snap.teams[side]} />
        ) : (
          <div className="space-y-6">
            <GameView snap={snap} side={side} />
            <SeasonHitting pk={pk} team={snap.teams[side].team} />
          </div>
        )}
      </div>
      <footer className="footer">
        <div className="container py-6 text-xs text-muted space-y-1">
          <p>{t("footer.data")}</p>
          <p>{t("footer.disclaimer")}</p>
        </div>
      </footer>
    </div>
  );
}
