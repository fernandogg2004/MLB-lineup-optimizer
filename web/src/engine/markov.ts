/**
 * Exact expected-runs evaluator — TypeScript port of
 * `src/batting_order/engine/markov.py` (same algorithm, same truncation rule).
 * Verified against Python-generated vectors in `markov.test.ts`.
 *
 * Layouts (row-major, flattened):
 *   P  : [8 outcomes][24 states][25 next]   transition probabilities
 *   R  : [8][24]                            expected runs per transition
 *   J  : [8][24][25][5]                     joint (next state, runs) — distributions only
 *   x  : [G regimes][9 players][8]          outcome probabilities
 *   w  : [9 innings][G]                     regime weight per inning
 */

export const N_OUT = 8;
export const N_STATES = 24;
export const N_NEXT = 25;
export const ABSORB = 24;
export const SLOTS = 9;
export const INNINGS = 9;
export const RUNS_PER_PA = 5; // 0..4
export const DEFAULT_TOL = 1e-13;
const MAX_STEPS = 1000;

export interface KernelData {
  P: number[];
  R: number[];
  J?: number[];
}

export interface MatchupData {
  G: number;
  x: number[];
  w: number[];
}

export interface Operators {
  G: number;
  M: Float64Array; // [G][9][24][25]
  rr: Float64Array; // [G][9][24]
  w: Float64Array; // [9][G]
}

export function operators(k: KernelData, m: MatchupData): Operators {
  const { G } = m;
  const M = new Float64Array(G * SLOTS * N_STATES * N_NEXT);
  const rr = new Float64Array(G * SLOTS * N_STATES);
  for (let g = 0; g < G; g++) {
    for (let i = 0; i < SLOTS; i++) {
      for (let c = 0; c < N_OUT; c++) {
        const p = m.x[(g * SLOTS + i) * N_OUT + c];
        if (p === 0) continue;
        for (let s = 0; s < N_STATES; s++) {
          rr[(g * SLOTS + i) * N_STATES + s] += p * k.R[c * N_STATES + s];
          const base = ((g * SLOTS + i) * N_STATES + s) * N_NEXT;
          const kb = (c * N_STATES + s) * N_NEXT;
          for (let n = 0; n < N_NEXT; n++) M[base + n] += p * k.P[kb + n];
        }
      }
    }
  }
  return { G, M, rr, w: Float64Array.from(m.w) };
}

/** One half-inning for regime g, slot->player `order`, led off by slot `start`. */
function inning(
  op: Operators,
  g: number,
  order: ArrayLike<number>,
  start: number,
  tol: number,
  nxt: Float64Array,
  v: Float64Array,
  wv: Float64Array,
): { runs: number; mass: number } {
  v.fill(0);
  v[0] = 1;
  nxt.fill(0);
  let runs = 0;
  let pos = start;
  let mass = 1;
  let steps = 0;
  const { M, rr } = op;
  while (mass > tol && steps < MAX_STEPS) {
    const b = order[pos];
    const mBase = (g * SLOTS + b) * N_STATES * N_NEXT;
    const rBase = (g * SLOTS + b) * N_STATES;
    wv.fill(0);
    for (let s = 0; s < N_STATES; s++) {
      const vs = v[s];
      if (vs === 0) continue;
      runs += vs * rr[rBase + s];
      const row = mBase + s * N_NEXT;
      for (let s2 = 0; s2 < N_NEXT; s2++) wv[s2] += vs * M[row + s2];
    }
    pos = (pos + 1) % SLOTS;
    nxt[pos] += wv[ABSORB];
    mass = 0;
    for (let s = 0; s < N_STATES; s++) {
      v[s] = wv[s];
      mass += wv[s];
    }
    steps++;
  }
  return { runs, mass };
}

export interface Tables {
  r: Float64Array; // [G][9]
  L: Float64Array; // [G][9][9]
  worst: number;
}

const scratch = {
  nxt: new Float64Array(SLOTS),
  v: new Float64Array(N_STATES),
  wv: new Float64Array(N_NEXT),
};

export function inningTables(op: Operators, order: ArrayLike<number>, tol = DEFAULT_TOL): Tables {
  const r = new Float64Array(op.G * SLOTS);
  const L = new Float64Array(op.G * SLOTS * SLOTS);
  let worst = 0;
  for (let g = 0; g < op.G; g++) {
    for (let j = 0; j < SLOTS; j++) {
      const res = inning(op, g, order, j, tol, scratch.nxt, scratch.v, scratch.wv);
      r[g * SLOTS + j] = res.runs;
      L.set(scratch.nxt, (g * SLOTS + j) * SLOTS);
      if (res.mass > worst) worst = res.mass;
    }
  }
  return { r, L, worst };
}

/** E[R_9] from tables of a cyclic order read with rotation `rot`. */
export function gameValue(op: Operators, t: Tables, rot: number, byInning?: Float64Array): number {
  const { G, w } = op;
  let pi = new Float64Array(SLOTS);
  pi[0] = 1;
  let total = 0;
  for (let k = 0; k < INNINGS; k++) {
    const nw = new Float64Array(SLOTS);
    let inn = 0;
    for (let j = 0; j < SLOTS; j++) {
      const pj = pi[j];
      if (pj === 0) continue;
      const jj = (j + rot) % SLOTS;
      for (let g = 0; g < G; g++) {
        const wg = w[k * G + g];
        if (wg === 0) continue;
        inn += pj * wg * t.r[g * SLOTS + jj];
        const lb = (g * SLOTS + jj) * SLOTS;
        for (let j2 = 0; j2 < SLOTS; j2++) nw[j2] += pj * wg * t.L[lb + ((j2 + rot) % SLOTS)];
      }
    }
    if (byInning) byInning[k] = inn;
    total += inn;
    pi = nw;
  }
  return total;
}

export interface Evaluation {
  expectedRuns: number;
  byInning: number[];
  truncatedMass: number;
}

export function isPermutation(order: ArrayLike<number>): boolean {
  if (order.length !== SLOTS) return false;
  const seen = new Set<number>();
  for (let i = 0; i < SLOTS; i++) {
    const v = order[i];
    if (!Number.isInteger(v) || v < 0 || v >= SLOTS || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

export function evaluate(op: Operators, order: ArrayLike<number>, tol = DEFAULT_TOL): Evaluation {
  if (!isPermutation(order)) throw new Error("order must be a permutation of 0..8");
  const t = inningTables(op, order, tol);
  const by = new Float64Array(INNINGS);
  const v = gameValue(op, t, 0, by);
  return { expectedRuns: v, byInning: Array.from(by), truncatedMass: t.worst };
}

/** Heap's algorithm over 1..8 producing all 40,320 cyclic orders with player 0 first. */
export function* cyclicOrders(): Generator<Int32Array> {
  const a = [1, 2, 3, 4, 5, 6, 7, 8];
  const n = a.length;
  const c = new Array(n).fill(0);
  const emit = () => Int32Array.from([0, ...a]);
  yield emit();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      const k = i % 2 === 0 ? 0 : c[i];
      [a[k], a[i]] = [a[i], a[k]];
      yield emit();
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
}

export interface SearchOutcome {
  best: number[];
  bestValue: number;
  feasible: number;
  /** Histogram of E[R_9] over feasible orders. */
  hist: { lo: number; hi: number; counts: number[] };
}

/**
 * Exhaustive search over all 9! orders, restricted by `allowed[slot][player]`.
 * `onProgress` receives the fraction of cyclic orders processed.
 */
export function exhaustiveSearch(
  op: Operators,
  allowed: boolean[][] | null,
  histRange: [number, number],
  bins = 60,
  onProgress?: (f: number) => void,
  tol = 1e-12,
): SearchOutcome {
  let best: number[] = [];
  let bestValue = -Infinity;
  let feasible = 0;
  const counts = new Array(bins).fill(0);
  const [lo, hi] = histRange;
  let idx = 0;
  const order = new Int32Array(SLOTS);
  for (const cyc of cyclicOrders()) {
    let anyFeasible = allowed === null;
    const rotOk = new Array(SLOTS).fill(true);
    if (allowed) {
      for (let rot = 0; rot < SLOTS; rot++) {
        for (let t = 0; t < SLOTS; t++) {
          if (!allowed[t][cyc[(t + rot) % SLOTS]]) {
            rotOk[rot] = false;
            break;
          }
        }
        if (rotOk[rot]) anyFeasible = true;
      }
    }
    if (anyFeasible) {
      const tb = inningTables(op, cyc, tol);
      for (let rot = 0; rot < SLOTS; rot++) {
        if (!rotOk[rot]) continue;
        const v = gameValue(op, tb, rot);
        feasible++;
        const b = Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)));
        counts[b]++;
        if (v > bestValue) {
          bestValue = v;
          for (let t = 0; t < SLOTS; t++) order[t] = cyc[(t + rot) % SLOTS];
          best = Array.from(order);
        }
      }
    }
    idx++;
    if (onProgress && idx % 2000 === 0) onProgress(idx / 40320);
  }
  onProgress?.(1);
  return { best, bestValue, feasible, hist: { lo, hi, counts } };
}

/** Linear mixing helper: regime weights with the starter's share scaled for "depth". */
export function scaleStarterDepth(w: number[], G: number, factor: number): number[] {
  // factor > 1 keeps the starter in longer; computed on the survival curve.
  const out = w.slice();
  for (let k = 0; k < INNINGS; k++) {
    const s = Math.min(1, Math.max(0, w[k * G] ** (1 / factor)));
    out[k * G] = s;
    for (let g = 1; g < G; g++) out[k * G + g] = (1 - s) * (G > 1 ? w[k * G + g] / Math.max(1e-12, 1 - w[k * G]) : 0);
  }
  return out;
}
