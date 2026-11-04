/** Hash routes. Old `#/game/{pk}` and `#/method` links keep working by redirecting. */

export type StatsTab = "game" | "simulator" | "method";

/** Screen index on Home: 0-8 are the batters, 9 is the summary. */
export const SUMMARY_SCREEN = 9;

export type Route =
  | { page: "home"; pk?: number; team?: string; screen: number }
  | { page: "statistics"; tab: StatsTab; pk?: number; team?: string };

function screenOf(part: string | undefined): number {
  if (part === "summary") return SUMMARY_SCREEN;
  const n = Number(part);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n - 1 : 0;
}

function pkOf(part: string | undefined): number | undefined {
  return part && /^\d+$/.test(part) ? Number(part) : undefined;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [head, a, b, c] = parts;
  if (head === "g") return { page: "home", pk: pkOf(a), team: b, screen: screenOf(c) };
  if (head === "statistics") {
    const tab: StatsTab = a === "simulator" || a === "method" ? a : "game";
    return { page: "statistics", tab, pk: pkOf(b), team: c };
  }
  // Links from the previous version of the site.
  if (head === "method") return { page: "statistics", tab: "method" };
  if (head === "game") return { page: "statistics", tab: "game", pk: pkOf(a) };
  return { page: "home", screen: 0 };
}

export function homeHash(pk: number, team: string, screen = 0): string {
  return `#/g/${pk}/${team}/${screen === SUMMARY_SCREEN ? "summary" : screen + 1}`;
}

export function statsHash(tab: StatsTab, pk?: number, team?: string): string {
  return pk === undefined || tab === "method" ? `#/statistics/${tab}` : `#/statistics/${tab}/${pk}/${team ?? ""}`.replace(/\/$/, "");
}
