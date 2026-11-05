import type { HomeTeam } from "../data";
import { roundTo100, runsGained, sameOrder, wholePercent } from "./derive";

export type Upgrade = "none" | "tiny" | "small" | "modest" | "solid" | "big";

/**
 * How the title describes the model's gain, judged in runs over a 162-game season so that it means
 * something to a fan: under 1 run tiny, under 3 small, under 6 modest, under 10 solid, else big.
 * Published batting-order studies put typical gains at a handful of runs a season, which these follow.
 */
export function upgradeSize(team: HomeTeam): Upgrade {
  if (sameOrder(team.optimal.order)) return "none";
  const season = Math.max(0, runsGained(team)) * 162;
  if (season < 1) return "tiny";
  if (season < 3) return "small";
  if (season < 6) return "modest";
  if (season < 10) return "solid";
  return "big";
}

/** The chance of the optimized order beating the real one, as a whole number out of 100; never "100". */
export function beatsOutOf100(p: number): string {
  const w = wholePercent(p);
  if (w.kind === "more") return "99+";
  if (w.kind === "less") return "<1";
  return String(w.n);
}

export const RUN_GROUPS = ["0", "1", "2", "3", "4", "5+"] as const;

/** One game's runs in six groups (0 to 4, then 5 or more), as whole percents that total exactly 100. */
export function runGroups(distribution: number[]): { label: (typeof RUN_GROUPS)[number]; value: number; percent: number }[] {
  const values = [...distribution.slice(0, 5), distribution.slice(5).reduce((a, b) => a + b, 0)];
  while (values.length < 6) values.push(0);
  const percents = roundTo100(values);
  return RUN_GROUPS.map((label, i) => ({ label, value: values[i], percent: percents[i] }));
}
