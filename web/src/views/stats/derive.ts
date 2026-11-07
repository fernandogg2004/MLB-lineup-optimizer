/**
 * Read-only transformations of stored model outputs for the Statistics page.
 * Nothing here estimates anything: each function re-expresses values the model already produced.
 */
import { drawFlat, kernelFlat, matchupFlat } from "../../data";
import type { GameSnapshot, Team } from "../../data";
import { ABSORB, N_NEXT, N_OUT, N_STATES, evaluate, inningTables, operators, SLOTS } from "../../engine/markov";

export const OUTCOMES = ["K", "BB", "1B", "2B", "3B", "HR", "GB", "AIR"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Base codes in the state encoding s = 8·outs + first + 2·second + 4·third. */
export const BASE_CODES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export interface BaseOut {
  outs: number;
  code: number;
  first: boolean;
  second: boolean;
  third: boolean;
  runners: number;
}

export function decodeState(s: number): BaseOut {
  const outs = Math.floor(s / 8);
  const code = s % 8;
  const first = (code & 1) > 0;
  const second = (code & 2) > 0;
  const third = (code & 4) > 0;
  return { outs, code, first, second, third, runners: Number(first) + Number(second) + Number(third) };
}

/**
 * Runs on a transition that does not end the inning, from participant conservation (assumption A5):
 * runners + batter = runners after + runs + new outs. The kernel stores next-state probabilities and
 * expected runs, so this is how the page shows the runs of each individual transition.
 */
export function conservedRuns(s: number, next: number): number {
  const a = decodeState(s);
  const b = decodeState(next);
  return a.runners + 1 - b.runners - (b.outs - a.outs);
}

export interface TransitionRow {
  next: number;
  p: number;
  /** null when the inning ends: runs on the third out are not fixed by conservation. */
  runs: number | null;
}

export function transitions(snap: GameSnapshot, c: number, s: number): { rows: TransitionRow[]; expectedRuns: number } {
  const row = snap.kernel.P[c][s];
  const rows: TransitionRow[] = [];
  for (let n = 0; n < N_NEXT; n++) {
    if (row[n] > 0) rows.push({ next: n, p: row[n], runs: n === ABSORB ? null : conservedRuns(s, n) });
  }
  rows.sort((a, b) => b.p - a.p);
  return { rows, expectedRuns: snap.kernel.R[c][s] };
}

/** The floor q of assumption A4: the smallest chance that a plate appearance adds an out. */
export function outFloor(snap: GameSnapshot, team: Team): number {
  let q = 1;
  for (const h of team.hitters) {
    for (const x of [h.probs_starter, h.probs_bullpen]) {
      for (let s = 0; s < N_STATES; s++) {
        const outs = decodeState(s).outs;
        let p = 0;
        for (let c = 0; c < N_OUT; c++) {
          let add = snap.kernel.P[c][s][ABSORB];
          for (let n = 0; n < N_STATES; n++) if (decodeState(n).outs > outs) add += snap.kernel.P[c][s][n];
          p += x[c] * add;
        }
        if (p < q) q = p;
      }
    }
  }
  return q;
}

/** μ_k: probability that each slot leads off inning k, for a fixed order (the nine-state chain). */
export function leadoffByInning(snap: GameSnapshot, team: Team, order: number[]): number[][] {
  const op = operators(kernelFlat(snap), matchupFlat(team));
  const tb = inningTables(op, order);
  let mu = new Array<number>(SLOTS).fill(0);
  mu[0] = 1;
  const out: number[][] = [];
  for (let k = 0; k < 9; k++) {
    out.push(mu);
    const nx = new Array<number>(SLOTS).fill(0);
    for (let j = 0; j < SLOTS; j++) {
      for (let g = 0; g < op.G; g++) {
        const wg = op.w[k * op.G + g];
        for (let j2 = 0; j2 < SLOTS; j2++) nx[j2] += mu[j] * wg * tb.L[(g * SLOTS + j) * SLOTS + j2];
      }
    }
    mu = nx;
  }
  return out;
}

/** Fixed-order gain in each stored posterior draw: the same draws behind the published interval. */
export function gainsByDraw(kernel: { P: number[]; R: number[] }, w: number[], draws: number[][], opt: number[], act: number[]): number[] {
  return draws.map((x) => {
    const op = operators(kernel, { G: 2, x, w });
    return evaluate(op, opt).expectedRuns - evaluate(op, act).expectedRuns;
  });
}

export function gainInputs(snap: GameSnapshot, team: Team) {
  return {
    kernel: kernelFlat(snap),
    w: team.regime_weights.flat(),
    draws: team.uncertainty.draws_x.map(drawFlat),
    opt: team.optimal.order,
    act: team.actual.order,
  };
}

export function histogram(values: number[], bins: number): { edges: number[]; counts: number[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo + (span * i) / bins);
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - lo) / span) * bins))]++;
  return { edges, counts };
}

export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

export function pmfMean(p: number[]): number {
  return p.reduce((a, v, i) => a + v * i, 0);
}

/** Bars 0…cut−1 plus one upper group, summed from the full distribution. */
export function withTail(p: number[], cut: number): number[] {
  const head = p.slice(0, cut);
  head.push(p.slice(cut).reduce((a, v) => a + v, 0));
  return head;
}

export function tailFrom(p: number[], from: number): number {
  return p.slice(from).reduce((a, v) => a + v, 0);
}

export interface Move {
  player: number;
  from: number;
  to: number;
}

/** Slots are 0-based here. `order[slot]` is the player in that slot. */
export function movements(actual: number[], optimal: number[]): Move[] {
  return actual.map((player, from) => ({ player, from, to: optimal.indexOf(player) }));
}

export function largestMove(moves: Move[]): Move | null {
  let best: Move | null = null;
  for (const m of moves) {
    if (m.from !== m.to && (!best || Math.abs(m.to - m.from) > Math.abs(best.to - best.from))) best = m;
  }
  return best;
}

/** Stored as frequency[slot][player]; the heatmap reads it by player, then slot. */
export function freqByPlayer(freq: number[][]): number[][] {
  return freq[0].map((_, p) => freq.map((row) => row[p]));
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1];
}

/** A window on the stored bins around the actual and optimal orders. Bars are never re-binned. */
export function zoomBins(edges: number[], actual: number, optimal: number): [number, number] {
  const n = edges.length - 1;
  // The top order sits on or just past the last edge, which is rounded to five decimals.
  const binOf = (v: number) => {
    const i = edges.findIndex((_, k) => k < n && v < edges[k + 1]);
    return i < 0 ? n - 1 : i;
  };
  const a = binOf(Math.min(actual, optimal));
  return [Math.max(0, a - 3), Math.min(n - 1, binOf(optimal) + 1)];
}

/** Seven-step shade for a value inside [lo, hi]. */
export function shade(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return Math.max(0, Math.min(6, Math.round(((v - lo) / (hi - lo)) * 6)));
}

export function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}
