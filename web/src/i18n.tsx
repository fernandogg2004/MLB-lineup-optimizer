import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "es";

const en = {
  "app.name": "Batting Order Lab",
  "app.tagline": "How much does the batting order matter? An exact expected-runs model.",
  "nav.game": "Game analysis",
  "nav.simulator": "Simulator",
  "nav.method": "Method & validation",
  "nav.paper": "Paper (PDF)",
  "nav.code": "Source code",
  "lang.label": "Language",
  "lang.switch": "Español",
  "game.picker": "Game",
  "game.reference": "Reference game",
  "game.final": "Final",
  "game.series": "{series}, Game {n}",
  "game.result": "Final score",
  "game.historical": "Historical fact",
  "game.model": "Model estimate",
  "game.loading": "Loading game data…",
  "game.error": "Could not load the game data.",
  "hero.question": "Did the managers use the best batting order?",
  "hero.answer":
    "Under the model, the best possible order would add {ua} expected runs per game for {a} and {ub} for {b}. For scale, a team's run total in a single game varies by about ±{sd} runs (one standard deviation).",
  "hero.cutoff": "Model uses only information available before first pitch on {date}.",
  "team.select": "Team",
  "team.vs": "facing {pitcher} ({hand}HP) and the {team} bullpen",
  "kpi.actual": "Order used",
  "kpi.optimal": "Model-optimal order",
  "kpi.uplift": "Estimated gain",
  "kpi.rank": "Rank of the order used",
  "kpi.runs9": "expected runs / 9 innings",
  "kpi.uplift_sub": "runs per game · 90% interval {lo} to {hi}",
  "kpi.rank_sub": "better than {pct} of all 362,880 possible orders",
  "kpi.prob": "Probability the optimal order is better: {p}",
  "lineup.title": "Lineups compared",
  "lineup.used": "Order used",
  "lineup.optimal": "Model-optimal",
  "lineup.slot": "#",
  "lineup.player": "Player",
  "lineup.pos": "Pos",
  "lineup.obp": "On-base",
  "lineup.power": "Power",
  "lineup.up": "moved up {n}",
  "lineup.down": "moved down {n}",
  "lineup.same": "same slot",
  "lineup.identical": "The model-optimal order is identical to the order used.",
  "lineup.history": "{n} PA of history",
  "lineup.note":
    "On-base = probability of reaching base (hit, walk, hit-by-pitch); Power = expected extra bases per PA. Both are model estimates for this matchup.",
  "why.title": "Why does the model suggest these changes?",
  "why.intro":
    "Batting slots differ mainly in how many plate appearances they get: the leadoff hitter bats about {d} more times per game than the ninth. The model gives more plate appearances to the hitters with the highest run value in this matchup.",
  "why.move": "{name}: slot {from} → {to} ({pa} expected plate appearances).",
  "why.caveat":
    "This does not mean the manager was wrong. Managers weigh information the model does not see — health, recent form, defensive substitutions, matchups late in the game, and player comfort.",
  "dist.title": "How much does the order matter at all?",
  "dist.subtitle":
    "Expected runs of every one of the 362,880 possible orders of these nine hitters (exact computation).",
  "dist.x": "Expected runs per 9 innings",
  "dist.y": "Number of orders",
  "dist.used": "Used",
  "dist.optimal": "Optimal",
  "dist.book": "“The Book” rule",
  "dist.worst": "Worst",
  "dist.spread": "Best vs worst possible order: {d} runs per game.",
  "runs.title": "One game is mostly luck",
  "runs.subtitle":
    "Exact probability of each run total over 9 innings with the order used. The real game produced {r} runs — one draw from this distribution.",
  "runs.x": "Runs scored in 9 innings",
  "runs.y": "Probability",
  "runs.observed": "Actual result",
  "runs.observed_note": "Actual runs are a historical fact; the bars are a model estimate.",
  "unc.title": "How sure is the model?",
  "unc.subtitle":
    "We redraw every player's ability from its statistical uncertainty ({n} draws) and recompute the gain of the optimal order over the order used.",
  "unc.interval": "90% interval of the gain",
  "unc.prob": "Share of draws in which the optimal order is better",
  "unc.stable": "Share of draws in which the same order is optimal",
  "sim.title": "Try your own batting order",
  "sim.subtitle":
    "Drag hitters to reorder (or use the arrow buttons). Every change is evaluated exactly in your browser.",
  "sim.your": "Your order",
  "sim.reset": "Reset to order used",
  "sim.load_opt": "Load optimal order",
  "sim.lock": "Lock this hitter in this slot",
  "sim.unlock": "Unlock",
  "sim.locked": "locked",
  "sim.find": "Find best order with my locks",
  "sim.finding": "Searching all orders… {p}%",
  "sim.found": "Best order under your constraints: {v} runs (searched {n} orders).",
  "sim.infeasible": "Your locks are inconsistent (two hitters locked to one slot, or one hitter to two slots).",
  "sim.your_value": "Your order",
  "sim.vs_used": "vs order used",
  "sim.vs_opt": "vs optimal order (historical workload)",
  "sim.depth": "Opposing starter's workload",
  "sim.depth_help":
    "How deep the opposing starter pitches. The default comes from his history; shorter means more innings against the bullpen.",
  "sim.depth_short": "shorter",
  "sim.depth_long": "longer",
  "sim.depth_default": "historical",
  "sim.interval": "90% interval from parameter uncertainty: {lo} to {hi}",
  "sim.move_up": "Move {name} up",
  "sim.move_down": "Move {name} down",
  "sim.drag": "Drag to reorder {name}",
  "sim.announce_move": "{name} moved to slot {slot}.",
  "sim.exact": "exact",
  "tech.title": "Technical details",
  "tech.probs": "Outcome probabilities per plate appearance",
  "tech.vs_starter": "vs starter",
  "tech.vs_bullpen": "vs bullpen",
  "tech.regime": "Probability the starter is still pitching, by inning",
  "tech.inning": "Inning",
  "tech.pa": "Expected plate appearances per player",
  "tech.pa_used": "Order used",
  "tech.pa_opt": "Optimal",
  "tech.version": "Snapshot generated {date} · software {sw} · model cutoff {cutoff}",
  "tech.download": "Download snapshot (JSON)",
  "outcome.K": "Strikeout",
  "outcome.BB": "Walk / HBP",
  "outcome.1B": "Single",
  "outcome.2B": "Double",
  "outcome.3B": "Triple",
  "outcome.HR": "Home run",
  "outcome.GB": "Ground-ball out",
  "outcome.AIR": "Fly/line out",
  "table.show": "Show data table",
  "table.hide": "Hide data table",
  "method.title": "Method and validation",
  "method.intro":
    "Every number on this site comes from one model: each hitter's outcome probabilities (estimated with empirical Bayes from Statcast data before the game) feed an exact Markov chain over the 24 base-out states. We search all 362,880 orders exhaustively, so the reported optimum is guaranteed under the model.",
  "method.objective": "Objective",
  "method.objective_text":
    "Maximize expected runs over nine innings for a fixed pregame order. Not win probability: at the level of a single game, win probability is close to a coin flip.",
  "method.validation": "Is the model any good?",
  "method.pa": "Plate-appearance predictions on unseen seasons (log-loss, lower is better)",
  "method.calib": "Predicted vs observed runs (innings 1–8), grouped by predicted decile",
  "method.search": "Search methods compared with the exact optimum",
  "method.actual_vs_opt": "Orders used by MLB teams vs the model optimum (2025–2026)",
  "method.limits": "Limitations",
  "method.limits_items":
    "Results are model-based counterfactuals, not observed effects of batting order.|Runner speed and batter-specific double-play tendencies beyond ground-ball rate are not modelled; base running is league-average.|Pitching changes are assumed to happen between innings; the bullpen is pooled by team.|In-game substitutions, pinch hitters and defense are outside the scope (fixed pregame lineup).|Historical data end at the game date; the model never uses later information.",
  "method.model": "Model",
  "method.n": "PAs",
  "method.ll": "Log-loss",
  "method.diff": "Δ vs selected (95% CI)",
  "method.method": "Method",
  "method.gap": "Mean gap (runs)",
  "method.found": "Finds optimum",
  "method.evals": "Evaluations",
  "method.pred": "Predicted",
  "method.obs": "Observed",
  "method.uplift": "Mean model gain of the optimal order: {u} runs/game ({s} per 162 games).",
  "method.pct": "Median rank of the order actually used: better than {p} of all possible orders.",
  "method.unavailable": "Validation results are not available.",
  "footer.data":
    "Data: MLB Statcast and MLB Stats API (© MLB Advanced Media), used for non-commercial research. Not affiliated with MLB.",
  "footer.disclaimer": "Estimates are model-based and uncertain; they are not betting advice.",
};

type Dict = Record<keyof typeof en, string>;

const es: Dict = {
  "app.name": "Batting Order Lab",
  "app.tagline": "¿Cuánto importa el orden al bate? Un modelo exacto de carreras esperadas.",
  "nav.game": "Análisis del partido",
  "nav.simulator": "Simulador",
  "nav.method": "Método y validación",
  "nav.paper": "Artículo (PDF)",
  "nav.code": "Código fuente",
  "lang.label": "Idioma",
  "lang.switch": "English",
  "game.picker": "Partido",
  "game.reference": "Partido de referencia",
  "game.final": "Final",
  "game.series": "{series}, juego {n}",
  "game.result": "Marcador final",
  "game.historical": "Dato histórico",
  "game.model": "Estimación del modelo",
  "game.loading": "Cargando datos del partido…",
  "game.error": "No se pudieron cargar los datos del partido.",
  "hero.question": "¿Usaron los mánagers el mejor orden al bate?",
  "hero.answer":
    "Según el modelo, el mejor orden posible añadiría {ua} carreras esperadas por partido a {a} y {ub} a {b}. Como referencia, las carreras de un equipo en un solo partido varían en unas ±{sd} (una desviación típica).",
  "hero.cutoff": "El modelo usa solo información disponible antes del primer lanzamiento del {date}.",
  "team.select": "Equipo",
  "team.vs": "frente a {pitcher} ({hand}) y el bullpen de {team}",
  "kpi.actual": "Orden usado",
  "kpi.optimal": "Orden óptimo del modelo",
  "kpi.uplift": "Ganancia estimada",
  "kpi.rank": "Posición del orden usado",
  "kpi.runs9": "carreras esperadas / 9 entradas",
  "kpi.uplift_sub": "carreras por partido · intervalo del 90 %: {lo} a {hi}",
  "kpi.rank_sub": "mejor que el {pct} de los 362 880 órdenes posibles",
  "kpi.prob": "Probabilidad de que el orden óptimo sea mejor: {p}",
  "lineup.title": "Alineaciones comparadas",
  "lineup.used": "Orden usado",
  "lineup.optimal": "Óptimo del modelo",
  "lineup.slot": "#",
  "lineup.player": "Jugador",
  "lineup.pos": "Pos",
  "lineup.obp": "Embasarse",
  "lineup.power": "Poder",
  "lineup.up": "sube {n}",
  "lineup.down": "baja {n}",
  "lineup.same": "mismo puesto",
  "lineup.identical": "El orden óptimo del modelo es idéntico al orden usado.",
  "lineup.history": "{n} apariciones de historial",
  "lineup.note":
    "Embasarse = probabilidad de llegar a base (hit, base por bolas, golpeado); Poder = bases extra esperadas por aparición. Ambas son estimaciones del modelo para este enfrentamiento.",
  "why.title": "¿Por qué sugiere el modelo estos cambios?",
  "why.intro":
    "Los puestos del orden se diferencian sobre todo en cuántas apariciones al plato reciben: el primer bateador batea unas {d} veces más por partido que el noveno. El modelo da más apariciones a los bateadores con mayor valor en carreras en este enfrentamiento.",
  "why.move": "{name}: puesto {from} → {to} ({pa} apariciones esperadas).",
  "why.caveat":
    "Esto no significa que el mánager se equivocara. Los mánagers consideran información que el modelo no ve: salud, forma reciente, cambios defensivos, enfrentamientos al final del partido y la comodidad de los jugadores.",
  "dist.title": "¿Cuánto importa realmente el orden?",
  "dist.subtitle":
    "Carreras esperadas de cada uno de los 362 880 órdenes posibles de estos nueve bateadores (cálculo exacto).",
  "dist.x": "Carreras esperadas por 9 entradas",
  "dist.y": "Número de órdenes",
  "dist.used": "Usado",
  "dist.optimal": "Óptimo",
  "dist.book": "Regla de “The Book”",
  "dist.worst": "Peor",
  "dist.spread": "Mejor frente a peor orden posible: {d} carreras por partido.",
  "runs.title": "Un partido es sobre todo azar",
  "runs.subtitle":
    "Probabilidad exacta de cada total de carreras en 9 entradas con el orden usado. El partido real produjo {r} carreras: una sola realización de esta distribución.",
  "runs.x": "Carreras anotadas en 9 entradas",
  "runs.y": "Probabilidad",
  "runs.observed": "Resultado real",
  "runs.observed_note": "Las carreras reales son un dato histórico; las barras son una estimación del modelo.",
  "unc.title": "¿Qué tan seguro está el modelo?",
  "unc.subtitle":
    "Volvemos a generar la habilidad de cada jugador según su incertidumbre estadística ({n} simulaciones) y recalculamos la ganancia del orden óptimo frente al usado.",
  "unc.interval": "Intervalo del 90 % de la ganancia",
  "unc.prob": "Proporción de simulaciones en que el orden óptimo es mejor",
  "unc.stable": "Proporción de simulaciones en que el mismo orden es óptimo",
  "sim.title": "Prueba tu propio orden al bate",
  "sim.subtitle":
    "Arrastra a los bateadores para reordenarlos (o usa los botones de flecha). Cada cambio se evalúa de forma exacta en tu navegador.",
  "sim.your": "Tu orden",
  "sim.reset": "Volver al orden usado",
  "sim.load_opt": "Cargar orden óptimo",
  "sim.lock": "Fijar a este bateador en este puesto",
  "sim.unlock": "Liberar",
  "sim.locked": "fijado",
  "sim.find": "Buscar el mejor orden con mis restricciones",
  "sim.finding": "Buscando en todos los órdenes… {p} %",
  "sim.found": "Mejor orden con tus restricciones: {v} carreras ({n} órdenes evaluados).",
  "sim.infeasible": "Tus restricciones son incompatibles (dos bateadores fijados en un puesto, o un bateador en dos puestos).",
  "sim.your_value": "Tu orden",
  "sim.vs_used": "frente al orden usado",
  "sim.vs_opt": "frente al orden óptimo (carga histórica)",
  "sim.depth": "Duración del abridor rival",
  "sim.depth_help":
    "Cuánto lanza el abridor rival. El valor por defecto sale de su historial; más corto significa más entradas contra el bullpen.",
  "sim.depth_short": "más corto",
  "sim.depth_long": "más largo",
  "sim.depth_default": "histórico",
  "sim.interval": "Intervalo del 90 % por incertidumbre de parámetros: {lo} a {hi}",
  "sim.move_up": "Subir a {name}",
  "sim.move_down": "Bajar a {name}",
  "sim.drag": "Arrastrar para reordenar a {name}",
  "sim.announce_move": "{name} pasó al puesto {slot}.",
  "sim.exact": "exacto",
  "tech.title": "Detalles técnicos",
  "tech.probs": "Probabilidades de cada resultado por aparición al plato",
  "tech.vs_starter": "vs abridor",
  "tech.vs_bullpen": "vs bullpen",
  "tech.regime": "Probabilidad de que el abridor siga lanzando, por entrada",
  "tech.inning": "Entrada",
  "tech.pa": "Apariciones al plato esperadas por jugador",
  "tech.pa_used": "Orden usado",
  "tech.pa_opt": "Óptimo",
  "tech.version": "Instantánea generada el {date} · software {sw} · corte del modelo {cutoff}",
  "tech.download": "Descargar instantánea (JSON)",
  "outcome.K": "Ponche",
  "outcome.BB": "Base por bolas / golpeado",
  "outcome.1B": "Sencillo",
  "outcome.2B": "Doble",
  "outcome.3B": "Triple",
  "outcome.HR": "Jonrón",
  "outcome.GB": "Out por rodado",
  "outcome.AIR": "Out por elevado/línea",
  "table.show": "Mostrar tabla de datos",
  "table.hide": "Ocultar tabla de datos",
  "method.title": "Método y validación",
  "method.intro":
    "Todos los números de este sitio salen de un único modelo: las probabilidades de cada bateador (estimadas con Bayes empírico a partir de datos de Statcast anteriores al partido) alimentan una cadena de Markov exacta sobre los 24 estados de bases y outs. Buscamos exhaustivamente entre los 362 880 órdenes, así que el óptimo informado está garantizado dentro del modelo.",
  "method.objective": "Objetivo",
  "method.objective_text":
    "Maximizar las carreras esperadas en nueve entradas para un orden fijo antes del partido. No la probabilidad de ganar: a nivel de un solo partido, esa probabilidad es casi una moneda al aire.",
  "method.validation": "¿Funciona el modelo?",
  "method.pa": "Predicción de apariciones al plato en temporadas no vistas (log-loss, menor es mejor)",
  "method.calib": "Carreras predichas frente a observadas (entradas 1–8), agrupadas por decil de predicción",
  "method.search": "Métodos de búsqueda comparados con el óptimo exacto",
  "method.actual_vs_opt": "Órdenes usados por los equipos de MLB frente al óptimo del modelo (2025–2026)",
  "method.limits": "Limitaciones",
  "method.limits_items":
    "Los resultados son contrafactuales del modelo, no efectos observados del orden al bate.|No se modelan la velocidad de los corredores ni la tendencia individual a dobles matanzas más allá de la tasa de rodados; el corrido de bases es el promedio de la liga.|Se supone que los cambios de lanzador ocurren entre entradas; el bullpen se agrupa por equipo.|Las sustituciones durante el partido, los bateadores emergentes y la defensa quedan fuera del alcance (alineación fija antes del partido).|Los datos históricos terminan en la fecha del partido; el modelo nunca usa información posterior.",
  "method.model": "Modelo",
  "method.n": "Apariciones",
  "method.ll": "Log-loss",
  "method.diff": "Δ frente al seleccionado (IC 95 %)",
  "method.method": "Método",
  "method.gap": "Brecha media (carreras)",
  "method.found": "Encuentra el óptimo",
  "method.evals": "Evaluaciones",
  "method.pred": "Predicho",
  "method.obs": "Observado",
  "method.uplift": "Ganancia media del orden óptimo según el modelo: {u} carreras/partido ({s} por 162 partidos).",
  "method.pct": "Posición mediana del orden realmente usado: mejor que el {p} de todos los órdenes posibles.",
  "method.unavailable": "Los resultados de validación no están disponibles.",
  "footer.data":
    "Datos: MLB Statcast y MLB Stats API (© MLB Advanced Media), usados para investigación no comercial. Sin afiliación con MLB.",
  "footer.disclaimer": "Las estimaciones provienen de un modelo y son inciertas; no son consejos de apuestas.",
};

export type Key = keyof typeof en;
export const dictionaries: Record<Lang, Dict> = { en, es };

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key, vars?: Record<string, string | number>) => string;
  fmt: (v: number, digits?: number) => string;
  pct: (v: number, digits?: number) => string;
  signed: (v: number, digits?: number) => string;
}

const I18nContext = createContext<Ctx | null>(null);

function initialLang(): Lang {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "en" || q === "es") return q;
  const stored = window.localStorage.getItem("lang");
  if (stored === "en" || stored === "es") return stored;
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem("lang", lang);
  }, [lang]);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const value = useMemo<Ctx>(() => {
    const locale = lang === "es" ? "es-ES" : "en-US";
    const fmt = (v: number, digits = 2) =>
      new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    return {
      lang,
      setLang,
      t: (k, vars) => {
        let s = dictionaries[lang][k] ?? en[k];
        if (vars) for (const [name, v] of Object.entries(vars)) s = s.split(`{${name}}`).join(String(v));
        return s;
      },
      fmt,
      pct: (v, digits = 0) =>
        new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(v),
      signed: (v, digits = 3) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), digits),
    };
  }, [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
