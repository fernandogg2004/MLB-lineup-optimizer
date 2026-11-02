import { useEffect, useState } from "react";
import { fetchJson, validateSnapshot } from "./data";
import type { GameIndex, GameSnapshot } from "./data";
import { I18nProvider } from "./i18n";
import { useI18n } from "./i18n-context";
import { GameView } from "./views/GameView";
import { MethodView } from "./views/MethodView";

const REPO = "https://github.com/fernandogg2004/mlb-lineup-optimizer";

type Route = { page: "game"; gamePk?: number } | { page: "method" };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("method")) return { page: "method" };
  const m = h.match(/^game\/(\d+)/);
  return { page: "game", gamePk: m ? Number(m[1]) : undefined };
}

function Shell() {
  const { t, lang, setLang, date } = useI18n();
  const [route, setRoute] = useState<Route>(parseHash);
  const [index, setIndex] = useState<GameIndex | null>(null);
  const [loaded, setLoaded] = useState<{ pk: number; snap: GameSnapshot | null; error: boolean } | null>(null);
  const [indexError, setIndexError] = useState(false);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    fetchJson<GameIndex>("index.json").then(setIndex, () => setIndexError(true));
  }, []);

  const gamePk = route.page === "game" ? (route.gamePk ?? index?.reference_game) : undefined;
  useEffect(() => {
    if (!index || gamePk === undefined) return;
    const entry = index.games.find((g) => g.game_pk === gamePk) ?? index.games[0];
    let cancelled = false;
    fetchJson<GameSnapshot>(entry.path)
      .then((s) => {
        validateSnapshot(s);
        if (!cancelled) setLoaded({ pk: gamePk, snap: s, error: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ pk: gamePk, snap: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [index, gamePk]);
  const current = loaded && loaded.pk === gamePk ? loaded : null;
  const snap = current?.snap ?? null;
  const error = indexError || (current?.error ?? false);

  useEffect(() => {
    document.title = `${t("app.name")} — ${t("app.tagline")}`;
  }, [t]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="skip-link">
        {t("a11y.skip")}
      </a>
      <header className="topbar">
        <div className="container flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <a href="#/" className="brand">
            <span aria-hidden className="brand-mark">◆</span> {t("app.name")}
          </a>
          <nav aria-label={t("a11y.nav")} className="flex flex-wrap gap-4 text-sm">
            <a href="#/" aria-current={route.page === "game" ? "page" : undefined} className="nav-link">
              {t("nav.game")}
            </a>
            <a href="#/method" aria-current={route.page === "method" ? "page" : undefined} className="nav-link">
              {t("nav.method")}
            </a>
            <a href={`${import.meta.env.BASE_URL}paper.pdf`} className="nav-link">
              {t("nav.paper")}
            </a>
            <a href={REPO} className="nav-link" rel="noopener">
              {t("nav.code")}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {route.page === "game" && index && index.games.length > 1 && (
              <label className="text-sm flex items-center gap-2">
                <span className="text-muted">{t("game.picker")}</span>
                <select
                  className="select"
                  value={gamePk}
                  onChange={(e) => (window.location.hash = `#/game/${e.target.value}`)}
                >
                  {index.games.map((g) => (
                    <option key={g.game_pk} value={g.game_pk}>
                      {date(g.date)} · {g.away_abbr} {g.away_runs}–{g.home_runs} {g.home_abbr}
                      {g.reference ? " ★" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="btn btn-sm"
              onClick={() => setLang(lang === "en" ? "es" : "en")}
              lang={lang === "en" ? "es" : "en"}
            >
              {t("lang.switch")}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="container flex-1 py-6">
        {route.page === "method" ? (
          <MethodView />
        ) : error ? (
          <p role="alert">{t("game.error")}</p>
        ) : snap ? (
          <GameView snap={snap} />
        ) : (
          <p aria-busy="true">{t("game.loading")}</p>
        )}
      </main>
      <footer className="footer">
        <div className="container py-6 text-xs text-muted space-y-1">
          <p>{t("footer.data")}</p>
          <p>{t("footer.disclaimer")}</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
