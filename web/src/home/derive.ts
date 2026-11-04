/** Pure calculations behind the Home page. Inputs are generated data, never typed numbers. */
import type { HomeTeam } from "../data";

/** Largest-remainder rounding, so displayed percentages always total exactly 100. */
export function roundTo100(p: number[]): number[] {
  const total = p.reduce((a, b) => a + b, 0);
  const exact = p.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    out[i] += 1;
  }
  return out;
}

export type SliceKey = "bb" | "single" | "xbh" | "hr" | "k" | "gb" | "air";

export interface Slice {
  key: SliceKey;
  /** Exact probability. */
  value: number;
  /** Displayed whole percent; all slices of a pie total exactly 100. */
  percent: number;
  /** Below one percent but not zero, so it must read "<1%" rather than "0%". */
  belowOne: boolean;
}

/**
 * The pie's slices from the model's eight classes (K, BB, 1B, 2B, 3B, HR, GB, AIR), with doubles and
 * triples merged and the ways of reaching base placed together.
 */
export function pieSlices(p: number[]): Slice[] {
  const values: [SliceKey, number][] = [
    ["bb", p[1]],
    ["single", p[2]],
    ["xbh", p[3] + p[4]],
    ["hr", p[5]],
    ["k", p[0]],
    ["gb", p[6]],
    ["air", p[7]],
  ];
  const percents = roundTo100(values.map(([, v]) => v));
  return values.map(([key, value], i) => ({
    key,
    value,
    percent: percents[i],
    belowOne: value > 0 && percents[i] === 0,
  }));
}

/**
 * A probability as a whole percent, following the site's rule: 0 and 100 only when exactly true, and
 * the model's estimates of certainty are never shown as 100.
 */
export type Whole = { kind: "exact"; n: number } | { kind: "more"; n: 99 } | { kind: "less"; n: 1 };

export function wholePercent(p: number): Whole {
  if (p <= 0) return { kind: "exact", n: 0 };
  if (p < 0.01) return { kind: "less", n: 1 };
  if (p > 0.99) return { kind: "more", n: 99 };
  return { kind: "exact", n: Math.round(p * 100) };
}

export interface Move {
  /** Index into `hitters`, which equals the zero-based slot in the order used. */
  hitter: number;
  from: number;
  to: number;
}

/** The hitter moved furthest from the order used; ties go to the earlier new slot. */
export function biggestMove(order: number[]): Move | null {
  let best: Move | null = null;
  order.forEach((hitter, to) => {
    if (hitter !== to && (!best || Math.abs(hitter - to) > Math.abs(best.from - best.to))) {
      best = { hitter, from: hitter, to };
    }
  });
  return best;
}

export function runsGained(t: HomeTeam): number {
  return t.optimal.er9 - t.actual.er9;
}

export function runsOverSeason(t: HomeTeam): number {
  return runsGained(t) * 162;
}

export function chanceOfScoring(t: HomeTeam): number {
  return 1 - t.optimal.run_distribution[0];
}

export function chanceOfFivePlus(t: HomeTeam): number {
  return t.optimal.run_distribution.slice(5).reduce((a, b) => a + b, 0);
}

export function bestToWorstGap(t: HomeTeam): number {
  return t.optimal.er9 - t.worst.er9;
}

export function sameOrder(order: number[]): boolean {
  return order.every((hitter, slot) => hitter === slot);
}

/** English ordinal suffix; Spanish uses the indicator "º". */
export function ordinal(n: number, lang: "en" | "es"): string {
  if (lang === "es") return `${n}.º`;
  const r10 = n % 10;
  const r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/** Split a translated string into text and `{placeholder}` pieces, for rolling numbers. */
export function splitTemplate(s: string): { text?: string; slot?: string }[] {
  return s
    .split(/(\{[a-z_]+\})/)
    .filter((part) => part !== "")
    .map((part) => (/^\{[a-z_]+\}$/.test(part) ? { slot: part.slice(1, -1) } : { text: part }));
}
