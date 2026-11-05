import type { HomeTeam } from "../data";
import { roundTo100, runsGained, sameOrder } from "./derive";

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

/**
 * How many of 100 re-estimates of player ability the optimized order wins, as a whole number. The owner
 * chose to show 100 when it rounds to 100: the screen says these are model estimates. A tiny epsilon keeps
 * floating point from turning 99.5 (398 of 400) into 99.4999… and rounding it down.
 */
export function beatsOutOf100(p: number): string {
  return String(Math.round(Math.min(1, Math.max(0, p)) * 100 + 1e-9));
}

export const RUN_GROUPS = ["0", "1", "2", "3", "4", "5+"] as const;

/** One game's runs in six groups (0 to 4, then 5 or more), as whole percents that total exactly 100. */
export function runGroups(distribution: number[]): { label: (typeof RUN_GROUPS)[number]; value: number; percent: number }[] {
  const values = [...distribution.slice(0, 5), distribution.slice(5).reduce((a, b) => a + b, 0)];
  while (values.length < 6) values.push(0);
  const percents = roundTo100(values);
  return RUN_GROUPS.map((label, i) => ({ label, value: values[i], percent: percents[i] }));
}
