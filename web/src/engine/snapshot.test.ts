import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drawFlat, kernelFlat, matchupFlat } from "../data";
import type { GameSnapshot } from "../data";
import { evaluate, operators } from "./markov";

const snap = JSON.parse(readFileSync("public/data/games/849799.json", "utf8")) as GameSnapshot;

function q(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

describe("reference snapshot in the browser", () => {
  const kernel = kernelFlat(snap);
  for (const side of ["away", "home"] as const) {
    const team = snap.teams[side];
    it(`${team.team}: point values match the stored ones`, () => {
      const op = operators(kernel, matchupFlat(team));
      expect(evaluate(op, team.actual.order).expectedRuns).toBeCloseTo(team.actual.er9, 4);
      expect(evaluate(op, team.optimal.order).expectedRuns).toBeCloseTo(team.optimal.er9, 4);
    });
    it(`${team.team}: browser interval of (top − used) matches the paper's`, () => {
      const w = team.regime_weights.flat();
      const d = team.uncertainty.draws_x
        .map((x) => {
          const op = operators(kernel, { G: 2, x: drawFlat(x), w });
          return evaluate(op, team.optimal.order).expectedRuns - evaluate(op, team.actual.order).expectedRuns;
        })
        .sort((a, b) => a - b);
      expect(team.uncertainty.draws_x.length).toBe(team.uncertainty.n_draws);
      expect(Math.abs(q(d, 0.05) - team.uncertainty.diff_q05)).toBeLessThan(1e-3);
      expect(Math.abs(q(d, 0.95) - team.uncertainty.diff_q95)).toBeLessThan(1e-3);
    }, 60_000);
  }
});
