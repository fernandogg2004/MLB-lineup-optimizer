/** Types of the versioned JSON produced by `batting-order snapshot` (schema_version 1). */

export interface IndexEntry {
  game_pk: number;
  date: string;
  game_type: string;
  series_description: string;
  series_game_number: number | null;
  away: string;
  home: string;
  away_abbr: string;
  home_abbr: string;
  away_runs: number | null;
  home_runs: number | null;
  reference: boolean;
  path: string;
}

export interface GameIndex {
  reference_game: number;
  games: IndexEntry[];
}

export interface Hitter {
  id: number;
  name: string;
  pos: string;
  slot: number;
  side_vs_starter: string;
  history_pa: number;
  probs_starter: number[];
  probs_bullpen: number[];
  obp: number;
  power: number;
  run_value: number;
}

export interface OrderEval {
  order: number[];
  er9: number;
  by_inning?: number[];
  pa_by_slot?: number[];
  run_distribution?: number[];
  percentile?: number;
}

export interface Team {
  team: string;
  name: string;
  observed_runs: number | null;
  opponent_starter: { id: number; name: string; throws: string; history_pa: number };
  hitters: Hitter[];
  regime_weights: number[][];
  actual: OrderEval & { percentile: number; pa_by_slot: number[]; run_distribution: number[] };
  optimal: OrderEval & { pa_by_slot: number[]; run_distribution: number[] };
  the_book: OrderEval;
  worst: OrderEval;
  all_orders: { count: number; mean: number; sd: number; hist: { edges: number[]; counts: number[] } };
  top10: { order: number[]; er9: number }[];
  uncertainty: {
    n_draws: number;
    diff_mean: number;
    diff_q05: number;
    diff_q95: number;
    p_opt_better: number;
    actual_q05: number;
    actual_q95: number;
    opt_q05: number;
    opt_q95: number;
    regret_of_point_optimum_mean: number;
    p_same_optimum: number;
    slot_player_freq: number[][];
    draws_x: number[][][][];
  };
}

export interface GameSnapshot {
  schema_version: number;
  generated_at: string;
  software: { package: string; git: string };
  game: {
    game_pk: number;
    date: string;
    game_type: string;
    series_description: string;
    series_game_number: number | null;
    venue: string;
    status: string;
    away: string;
    home: string;
    away_abbr: string;
    home_abbr: string;
    away_runs: number | null;
    home_runs: number | null;
    reference?: string;
  };
  cutoff: { information_before: string; pa_history_from: string; kernel: Record<string, unknown> };
  model: { outcomes: string[]; hyper: Record<string, number> };
  kernel: { P: number[][][]; R: number[][] };
  teams: { away: Team; home: Team };
}

/** Home page data written by `batting-order home` (`src/batting_order/batter_stats.py`). */
export type Rate = "avg" | "obp" | "slg" | "ops";

export interface HomeHitter {
  id: number;
  name: string;
  pos: string;
  slot: number;
  probs_starter: number[];
  probs_bullpen: number[];
  batting: {
    pa: number;
    small_sample: boolean;
    rates: Record<Rate, string | null>;
    pct: Record<Rate, number | null>;
  };
}

export interface HomeTeam {
  team: string;
  name: string;
  opponent_starter: { name: string };
  hitters: HomeHitter[];
  actual: { er9: number; percentile: number };
  optimal: { order: number[]; er9: number; pa_by_slot: number[]; run_distribution: number[] };
  worst: { er9: number };
  all_orders: { count: number };
  uncertainty: { p_opt_better: number; diff_q05: number };
}

export interface HomeData {
  schema_version: number;
  game: {
    game_pk: number;
    date: string;
    series_description: string;
    series_game_number: number | null;
    away: string;
    home: string;
    away_abbr: string;
    home_abbr: string;
    away_runs: number | null;
    home_runs: number | null;
  };
  hitting: {
    source: string;
    season: number;
    start: string;
    end: string;
    previous_season: boolean;
    min_pa: number;
    pool_size: number;
  };
  teams: { away: HomeTeam; home: HomeTeam };
}

export const SUPPORTED_HOME_SCHEMA = 1;

export function validateHome(d: HomeData): void {
  if (d.schema_version !== SUPPORTED_HOME_SCHEMA) throw new Error(`unsupported Home schema ${d.schema_version}`);
  for (const side of ["away", "home"] as const) {
    const t = d.teams[side];
    if (t.hitters.length !== 9 || t.optimal.order.length !== 9) throw new Error(`${side}: expected 9 hitters`);
    if ([...t.optimal.order].sort((a, b) => a - b).some((v, i) => v !== i)) throw new Error(`${side}: invalid order`);
    for (const h of t.hitters) {
      for (const p of [h.probs_starter, h.probs_bullpen]) {
        const sum = p.reduce((a, b) => a + b, 0);
        if (p.length !== 8 || p.some((v) => v < 0) || Math.abs(sum - 1) > 1e-4) throw new Error(`${side}: invalid probabilities for ${h.name}`);
      }
    }
  }
}

const BASE = import.meta.env.BASE_URL;

export async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}data/${path}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return (await r.json()) as T;
}

export const SUPPORTED_SCHEMA = 1;

export function validateSnapshot(s: GameSnapshot): void {
  if (s.schema_version !== SUPPORTED_SCHEMA) throw new Error(`unsupported schema ${s.schema_version}`);
  for (const side of ["away", "home"] as const) {
    const t = s.teams[side];
    if (t.hitters.length !== 9) throw new Error(`${side}: expected 9 hitters`);
    for (const h of t.hitters) {
      for (const p of [h.probs_starter, h.probs_bullpen]) {
        const sum = p.reduce((a, b) => a + b, 0);
        if (p.length !== 8 || p.some((v) => v < 0) || Math.abs(sum - 1) > 1e-4)
          throw new Error(`${side}: invalid probabilities for ${h.name}`);
      }
    }
  }
}

/** Flatten snapshot pieces into the evaluator's layouts. */
export function kernelFlat(s: GameSnapshot): { P: number[]; R: number[] } {
  return { P: s.kernel.P.flat(2), R: s.kernel.R.flat() };
}

export function matchupFlat(t: Team, w?: number[]): { G: number; x: number[]; w: number[] } {
  const x: number[] = [];
  for (const h of t.hitters) x.push(...h.probs_starter);
  for (const h of t.hitters) x.push(...h.probs_bullpen);
  return { G: 2, x, w: w ?? t.regime_weights.flat() };
}

export function drawFlat(draw: number[][][]): number[] {
  return draw.flat(2);
}
