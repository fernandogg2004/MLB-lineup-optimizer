import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Menu } from "./components/Menu";
import { MenuIcon } from "./components/MenuIcon";
import { fetchJson } from "./data";
import type { GameIndex, IndexEntry } from "./data";
import { useNarrow } from "./home/format";
import { HomeView } from "./home/HomeView";
import { I18nProvider } from "./i18n";
import { useI18n } from "./i18n-context";
import { homeHash, parseHash, statsHash } from "./route";
import type { Route } from "./route";
import { applyTheme, clearThemeOverride, initialTheme } from "./theme";
import type { Theme } from "./theme";
import { StatisticsView } from "./views/StatisticsView";

function Stadium() {
  return (
    <div id="stadium" className="bg" aria-hidden="true">
      <div className="bg-sky" />
      <div className="bg-beam b1" />
      <div className="bg-beam b2" />
      <div className="bg-beam b3" />
      <div className="bg-arc" />
      <div className="bg-field" />
    </div>
  );
}

function matchLabel(g: IndexEntry, short: boolean, t: ReturnType<typeof useI18n>["t"], series: (s: string) => string, date: (s: string) => string): string {
  const score = g.away_runs === null || g.home_runs === null ? `${g.away_abbr}–${g.home_abbr}` : `${g.away_abbr} ${g.away_runs}–${g.home_runs} ${g.home_abbr}`;
  if (g.series_description && g.series_game_number) {
    return short
      ? `${t("game.short", { n: g.series_game_number })} · ${score}`
      : `${t("game.series", { series: series(g.series_description), n: g.series_game_number })} · ${score}`;
  }
  return `${date(g.date)} · ${score}`;
}

function Shell() {
  const { t, series, date } = useI18n();
  const narrow = useNarrow();
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [index, setIndex] = useState<GameIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<{ pk?: number; team?: string }>({});

  useLayoutEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    fetchJson<GameIndex>("index.json").then(setIndex, () => setIndexError(true));
  }, []);

  // Every page has its own title.
  useEffect(() => {
    const page =
      route.page === "home"
        ? t("title.home")
        : t(route.tab === "method" ? "nav.method" : route.tab === "simulator" ? "nav.simulator" : "nav.game");
    document.title = `${page} · ${t("app.name")}`;
  }, [t, route]);

  // Statistics scrolls the page itself, so the page is held still while the menu is open.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("stats", route.page === "statistics");
    root.classList.toggle("menu-locked", menuOpen);
  }, [menuOpen, route.page]);

  // The selected game and team carry over between Home and Statistics.
  const entry = useMemo(() => {
    if (!index) return null;
    const pk = route.pk ?? selected.pk ?? index.reference_game;
    return index.games.find((g) => g.game_pk === pk) ?? index.games.find((g) => g.game_pk === index.reference_game) ?? index.games[0] ?? null;
  }, [index, route, selected.pk]);
  const wanted = route.team ?? selected.team;
  const team = entry ? (wanted === entry.home_abbr ? entry.home_abbr : wanted === entry.away_abbr ? entry.away_abbr : entry.away_abbr) : "";
  useEffect(() => {
    if (entry) setSelected({ pk: entry.game_pk, team }); // eslint-disable-line react/set-state-in-effect -- remembers the last URL's game
  }, [entry, team]);

  // Replace old-style addresses with the current ones, keeping the same content.
  useEffect(() => {
    if (/^#\/(method|game)\b/.test(window.location.hash) && route.page === "statistics") {
      window.history.replaceState(null, "", statsHash(route.tab, route.pk));
    }
  }, [route]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Focus goes back to the icon once the page behind is interactive again.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !menuOpen) burger.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  const go = (page: "home" | "statistics") => {
    if (page === route.page) return;
    window.location.hash = page === "home" ? (entry ? homeHash(entry.game_pk, team) : "#/") : statsHash("game", entry?.game_pk, team);
    window.scrollTo(0, 0);
  };

  const select = (pk: number, nextTeam: string) => {
    window.location.hash = route.page === "home" ? homeHash(pk, nextTeam) : statsHash(route.tab, pk, nextTeam);
  };

  const pkOnScreen = entry?.game_pk;
  const onScreen = useCallback(
    (screen: number) => {
      if (pkOnScreen === undefined) return;
      // Never overwrite an address the visitor has just navigated to.
      const here = parseHash(window.location.hash);
      if (here.page !== "home" || (here.pk !== undefined && (here.pk !== pkOnScreen || here.team !== team))) return;
      const next = homeHash(pkOnScreen, team, screen);
      // On the front page, stay at the plain address until the visitor moves.
      const plain = window.location.hash === "" || window.location.hash === "#/";
      if (window.location.hash !== next && !(plain && screen === 0)) window.history.replaceState(null, "", next);
    },
    [pkOnScreen, team],
  );

  const target = useMemo(() => ({ screen: route.page === "home" ? route.screen : 0 }), [route]);
  const showPickers = index !== null && entry !== null && !(route.page === "statistics" && route.tab === "method");

  return (
    <div className="app">
      <Stadium />
      <div inert={menuOpen}>
        <a
          href="#main"
          className="skip-link"
          onClick={(e) => {
            // A real jump would change the hash, which is this site's page address.
            e.preventDefault();
            document.getElementById("main")?.focus();
          }}
        >
          {t("a11y.skip")}
        </a>
        <header className="bar">
          <button ref={burger} className="burger" aria-label={t("menu.open")} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </button>
          <span className="brand">{t("app.name")}</span>
          {showPickers && entry && (
            <div className="pickers">
              <select aria-label={t("game.picker")} value={entry.game_pk} onChange={(e) => {
                const pk = Number(e.target.value);
                const g = index?.games.find((x) => x.game_pk === pk);
                select(pk, g && (team === g.home_abbr || team === g.away_abbr) ? team : (g?.away_abbr ?? team));
              }}>
                {index?.games.map((g) => (
                  <option key={g.game_pk} value={g.game_pk}>
                    {matchLabel(g, narrow, t, series, date)}
                  </option>
                ))}
              </select>
              <select aria-label={t("team.select")} value={team} onChange={(e) => select(entry.game_pk, e.target.value)}>
                <option value={entry.away_abbr}>{entry.away}</option>
                <option value={entry.home_abbr}>{entry.home}</option>
              </select>
            </div>
          )}
        </header>
        <main id="main" tabIndex={-1}>
          {(route.page === "home" || route.tab === "simulator") && <h1 className="sr-only">{t("app.name")}</h1>}
          {indexError ? (
            <p className="home-message" role="alert">
              {t("game.error")}
            </p>
          ) : route.page === "statistics" && route.tab === "method" ? (
            <StatisticsView tab="method" pk={entry?.game_pk ?? 0} team={team} />
          ) : !entry ? (
            <p className="home-message" aria-busy="true">
              {t("game.loading")}
            </p>
          ) : route.page === "statistics" ? (
            <StatisticsView tab={route.tab} pk={entry.game_pk} team={team} />
          ) : (
            <HomeView pk={entry.game_pk} team={team} target={target} theme={theme} menuOpen={menuOpen} onScreen={onScreen} />
          )}
        </main>
      </div>
      <Menu open={menuOpen} close={closeMenu} page={route.page} go={go} theme={theme} setTheme={(next) => {
        clearThemeOverride();
        setTheme(next);
      }} />
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
