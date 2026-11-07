import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GameIndex, GameSnapshot } from "../../data";
import { dictionaries } from "../../strings";
import {
  conservedRuns,
  cumulative,
  decodeState,
  freqByPlayer,
  gainInputs,
  gainsByDraw,
  histogram,
  largestMove,
  lastName,
  leadoffByInning,
  movements,
  outFloor,
  pmfMean,
  quantile,
  shade,
  tailFrom,
  transitions,
  withTail,
  zoomBins,
} from "./derive";
import type { Validation } from "./validation";

const index = JSON.parse(readFileSync("public/data/index.json", "utf8")) as GameIndex;
const snaps = index.games.map((g) => JSON.parse(readFileSync(`public/data/${g.path}`, "utf8")) as GameSnapshot);
const reference = snaps.find((s) => s.game.game_pk === index.reference_game)!;
const validation = JSON.parse(readFileSync("public/data/validation.json", "utf8")) as Validation;
const teams = snaps.flatMap((s) => (["away", "home"] as const).map((side) => ({ snap: s, team: s.teams[side], name: `${s.game.game_pk} ${s.teams[side].team}` })));

describe("what the page shows is consistent with the model, for every game and team", () => {
  for (const { snap, team, name } of teams) {
    describe(name, () => {
      it("the optimum is not worse than the actual, Book or worst order", () => {
        expect(team.optimal.er9).toBeGreaterThanOrEqual(team.actual.er9);
        expect(team.optimal.er9).toBeGreaterThanOrEqual(team.the_book.er9);
        expect(team.actual.er9).toBeGreaterThanOrEqual(team.worst.er9);
        expect(team.top10[0].er9).toBeCloseTo(team.optimal.er9, 10);
        for (let i = 1; i < team.top10.length; i++) expect(team.top10[i].er9).toBeLessThanOrEqual(team.top10[i - 1].er9);
      });

      it("run probabilities form a distribution whose mean is the expected runs", () => {
        for (const o of [team.actual, team.optimal]) {
          const sum = o.run_distribution.reduce((a, v) => a + v, 0);
          expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
          expect(Math.abs(pmfMean(o.run_distribution) - o.er9)).toBeLessThan(2e-3);
          // The upper group is summed from the full distribution, never estimated.
          const grouped = withTail(o.run_distribution, 12);
          expect(grouped.length).toBe(13);
          expect(grouped.reduce((a, v) => a + v, 0)).toBeCloseTo(sum, 10);
        }
      });

      it("expected runs by inning add up to the order's value", () => {
        for (const o of [team.actual, team.optimal]) {
          const c = cumulative(o.by_inning ?? []);
          expect(c.length).toBe(9);
          expect(Math.abs(c[8] - o.er9)).toBeLessThan(1e-4);
        }
      });

      it("the histogram holds all 362,880 orders, with the markers inside its range", () => {
        const { edges, counts } = team.all_orders.hist;
        expect(counts.reduce((a, v) => a + v, 0)).toBe(362880);
        expect(team.all_orders.count).toBe(362880);
        expect(edges[0]).toBeLessThanOrEqual(team.worst.er9 + 1e-5);
        expect(edges[edges.length - 1]).toBeGreaterThanOrEqual(team.optimal.er9 - 1e-5);
        const [a, b] = zoomBins(edges, team.actual.er9, team.optimal.er9);
        expect(edges[a]).toBeLessThanOrEqual(team.actual.er9);
        expect(edges[b + 1]).toBeGreaterThanOrEqual(team.optimal.er9 - 1e-5);
      });

      it("slot frequencies are normalized by slot and by player", () => {
        const f = team.uncertainty.slot_player_freq;
        for (const row of f) expect(Math.abs(row.reduce((a, v) => a + v, 0) - 1)).toBeLessThan(0.006);
        for (const row of freqByPlayer(f)) expect(Math.abs(row.reduce((a, v) => a + v, 0) - 1)).toBeLessThan(0.006);
      });

      it("every kernel transition obeys participant conservation, so the runs shown are valid", () => {
        for (let c = 0; c < 8; c++) {
          for (let s = 0; s < 24; s++) {
            const { rows, expectedRuns } = transitions(snap, c, s);
            expect(Math.abs(rows.reduce((a, r) => a + r.p, 0) - 1)).toBeLessThan(1e-4);
            let known = 0;
            for (const r of rows) {
              if (r.runs !== null) {
                expect(r.runs).toBeGreaterThanOrEqual(0);
                expect(r.runs).toBeLessThanOrEqual(4);
                known += r.p * r.runs;
              }
            }
            // Runs on the third out can only add to what the other transitions explain.
            expect(known).toBeLessThanOrEqual(expectedRuns + 1e-4);
          }
        }
      });

      it("leadoff probabilities are a distribution in every inning, and slot 1 opens the game", () => {
        const mu = leadoffByInning(snap, team, team.optimal.order);
        expect(mu.length).toBe(9);
        expect(mu[0][0]).toBe(1);
        for (const row of mu) expect(Math.abs(row.reduce((a, v) => a + v, 0) - 1)).toBeLessThan(1e-4);
      });

      it("regime weights are probabilities", () => {
        for (const r of team.regime_weights) {
          expect(r[0]).toBeGreaterThanOrEqual(0);
          expect(Math.abs(r[0] + r[1] - 1)).toBeLessThan(1e-3);
        }
      });
    });
  }

  it("the out floor reproduces the value published in the paper", () => {
    const q = Math.min(outFloor(reference, reference.teams.away), outFloor(reference, reference.teams.home));
    const tex = readFileSync("../research/generated/numbers.tex", "utf8");
    const published = Number(/\\RefQmin\}\{([\d.]+)\}/.exec(tex)?.[1]);
    expect(Math.abs(q - published)).toBeLessThan(0.002);
  });

  it("gains recomputed from the stored draws match the stored summary", () => {
    for (const team of [reference.teams.away, reference.teams.home]) {
      const i = gainInputs(reference, team);
      const g = gainsByDraw(i.kernel, i.w, i.draws, i.opt, i.act).sort((a, b) => a - b);
      expect(g.length).toBe(team.uncertainty.n_draws);
      expect(Math.abs(quantile(g, 0.05) - team.uncertainty.diff_q05)).toBeLessThan(1e-3);
      expect(Math.abs(quantile(g, 0.95) - team.uncertainty.diff_q95)).toBeLessThan(1e-3);
      expect(Math.abs(g.filter((v) => v > 0).length / g.length - team.uncertainty.p_opt_better)).toBeLessThan(0.02);
      const h = histogram(g, 24);
      expect(h.counts.reduce((a, v) => a + v, 0)).toBe(g.length);
    }
  }, 120_000);
});

describe("historical results use the intended populations", () => {
  it("gains cover all 9,860 team-games, mean 0.020 runs", () => {
    const e = validation.e4b!;
    expect(e.n_team_games).toBe(9860);
    expect(e.uplift_histogram.reduce((a, v) => a + v, 0)).toBe(9860);
    expect(e.uplift_opt_vs_actual.mean).toBeCloseTo(0.0196, 3);
    expect(e.uplift_hist_edges.length).toBe(e.uplift_histogram.length + 1);
  });

  it("the rank distribution agrees with the stored summary of the same games", () => {
    const r = validation.ranks!;
    const e = validation.e4b!;
    expect(r.n_team_games).toBe(e.n_team_games);
    expect(r.hist_counts.reduce((a, v) => a + v, 0)).toBe(e.n_team_games);
    expect(r.median).toBeCloseTo(e.actual_percentile.median, 10);
    expect(r.mean).toBeCloseTo(e.actual_percentile.mean, 10);
    expect(r.share_above["0.90"]).toBeCloseTo(e.actual_percentile.share_above_90, 10);
  });

  it("calibration deciles and PIT cover their stated samples", () => {
    const e = validation.e3!;
    expect(e.by_decile.reduce((a, d) => a + d.n, 0)).toBe(e.n_team_games);
    expect(e.pit.pit_hist.reduce((a, v) => a + v, 0)).toBe(e.pit.n);
    expect(e.mse.model).toBeLessThan(e.mse.constant_prior_season);
    expect(e.mse.model).toBeLessThan(e.mse.team_last60);
  });

  it("log-loss differences have the sign the chart states: positive means worse than the full model", () => {
    for (const s of Object.values(validation.e2!.by_season)) {
      const full = s.models.M2_batter_pitcher.log_loss;
      for (const [k, m] of Object.entries(s.models)) {
        if (k !== "M2_batter_pitcher") expect(Math.abs(m.log_loss - full - m.diff_vs_M2.mean)).toBeLessThan(1e-3);
      }
    }
  });
});

describe("helpers", () => {
  it("decodes the state encoding of the paper", () => {
    expect(decodeState(0)).toMatchObject({ outs: 0, first: false, second: false, third: false, runners: 0 });
    expect(decodeState(5)).toMatchObject({ outs: 0, first: true, second: false, third: true, runners: 2 });
    expect(decodeState(23)).toMatchObject({ outs: 2, first: true, second: true, third: true, runners: 3 });
  });

  it("derives runs from conservation", () => {
    expect(conservedRuns(0, 0)).toBe(1); // home run with the bases empty
    expect(conservedRuns(7, 0)).toBe(4); // grand slam
    expect(conservedRuns(1, 3)).toBe(0); // single, runner to second
    expect(conservedRuns(1, 8)).toBe(1); // bases cleared, one out, one run
    expect(conservedRuns(0, 8)).toBe(0); // out with the bases empty
  });

  it("computes moves and the largest one", () => {
    const m = movements([0, 1, 2, 3, 4, 5, 6, 7, 8], [3, 1, 2, 0, 4, 5, 6, 7, 8]);
    expect(m[0]).toEqual({ player: 0, from: 0, to: 3 });
    expect(largestMove(m)?.player).toBe(0);
    expect(largestMove(movements([0, 1, 2], [0, 1, 2]))).toBeNull();
  });

  it("transposes frequency tables to player by slot", () => {
    expect(freqByPlayer([[0.1, 0.9], [0.9, 0.1]])).toEqual([[0.1, 0.9], [0.9, 0.1]]);
    expect(freqByPlayer([[1, 0], [0.25, 0.75]])).toEqual([[1, 0.25], [0, 0.75]]);
  });

  it("handles names, tails and shades", () => {
    expect(lastName("Ronald Acuña Jr.")).toBe("Acuña");
    expect(lastName("Ha-Seong Kim")).toBe("Kim");
    expect(tailFrom([0.5, 0.25, 0.25], 1)).toBe(0.5);
    expect(shade(0, 0, 1)).toBe(0);
    expect(shade(1, 0, 1)).toBe(6);
    expect(shade(5, 0, 1)).toBe(6);
    expect(shade(1, 1, 1)).toBe(0);
  });
});

describe("wording", () => {
  it("never calls a parameter re-estimate a win probability or a confidence interval", () => {
    for (const k of ["st.gain_read", "st.beat_read", "st.rank_read", "st.ranks_read", "st.obj_read"] as const) {
      expect(dictionaries.en[k]).toMatch(/not|no /i);
    }
    expect(dictionaries.en["st.gain_read"]).toMatch(/not a classical confidence interval/);
    expect(dictionaries.en["st.beat_read"]).toMatch(/not the probability of winning/);
  });
});
