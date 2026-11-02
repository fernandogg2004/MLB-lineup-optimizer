import { describe, expect, it } from "vitest";
import vectors from "./fixtures/vectors.json";
import { cyclicOrders, evaluate, exhaustiveSearch, isPermutation, operators, scaleStarterDepth } from "./markov";

const op = operators(vectors.kernel, vectors.matchup);

describe("exact evaluator (parity with Python)", () => {
  it("reproduces E[R_9] and runs by inning", () => {
    vectors.orders.forEach((o, i) => {
      const ev = evaluate(op, o);
      expect(ev.expectedRuns).toBeCloseTo(vectors.expected[i], 10);
      ev.byInning.forEach((v, k) => expect(v).toBeCloseTo(vectors.byInning[i][k], 10));
    });
  });

  it("enumerates 40,320 distinct cyclic orders", () => {
    const seen = new Set<string>();
    for (const c of cyclicOrders()) seen.add(c.join(","));
    expect(seen.size).toBe(40320);
  });

  it("exhaustive search finds the Python optimum", () => {
    const res = exhaustiveSearch(op, null, [vectors.min - 0.01, vectors.bestValue + 0.01]);
    expect(res.feasible).toBe(362880);
    expect(res.bestValue).toBeCloseTo(vectors.bestValue, 8);
    expect(res.best).toEqual(vectors.best);
    expect(res.hist.counts.reduce((a, b) => a + b, 0)).toBe(362880);
  }, 120_000);

  it("respects slot locks", () => {
    const allowed = Array.from({ length: 9 }, () => Array(9).fill(true));
    for (let p = 0; p < 9; p++) allowed[0][p] = p === 4; // player 4 leads off
    for (let s = 1; s < 9; s++) allowed[s][4] = false;
    const res = exhaustiveSearch(op, allowed, [vectors.min - 0.01, vectors.bestValue + 0.01]);
    expect(res.feasible).toBe(40320);
    expect(res.best[0]).toBe(4);
    expect(res.bestValue).toBeLessThanOrEqual(vectors.bestValue + 1e-12);
  }, 120_000);

  it("rejects invalid orders", () => {
    expect(isPermutation([0, 0, 1, 2, 3, 4, 5, 6, 7])).toBe(false);
    expect(() => evaluate(op, [0, 1, 2])).toThrow();
  });
});

describe("scenario workload transform", () => {
  const w = [1, 0.97, 0.93, 0.89, 0.76, 0.45, 0.14, 0.03, 0].flatMap((s) => [s, 1 - s]);
  it("is the identity at factor 1 and keeps rows summing to one", () => {
    const same = scaleStarterDepth(w, 2, 1);
    same.forEach((v, i) => expect(v).toBeCloseTo(w[i], 12));
    for (const f of [0.5, 1.5, 2]) {
      const out = scaleStarterDepth(w, 2, f);
      for (let k = 0; k < 9; k++) expect(out[2 * k] + out[2 * k + 1]).toBeCloseTo(1, 12);
    }
  });
  it("moves starter shares monotonically with the factor", () => {
    const lo = scaleStarterDepth(w, 2, 0.5);
    const hi = scaleStarterDepth(w, 2, 2);
    for (let k = 0; k < 9; k++) expect(hi[2 * k]).toBeGreaterThanOrEqual(lo[2 * k]);
  });
});
