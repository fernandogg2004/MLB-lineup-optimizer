/** Shape of web/public/data/validation.json, written by scripts/make_paper_assets.py. */
export interface Diff {
  mean: number;
  ci_low: number;
  ci_high: number;
}

export interface Validation {
  e0?: { n: number; share_both_match: number };
  e1?: {
    by_season: Record<
      string,
      { model_re24: number[]; empirical_re24: number[]; n_by_state: number[]; weighted_mean_abs_diff: number; max_abs_diff: number }
    >;
  };
  e2?: {
    by_season: Record<string, { n_pa: number; n_games: number; models: Record<string, { log_loss: number; brier: number; diff_vs_M2: Diff }> }>;
  };
  e3?: {
    n_team_games: number;
    excluded_fewer_than_8_innings: number;
    mean_observed_r8: number;
    mean_predicted_r8: number;
    bias_obs_minus_pred: number;
    bias_ci95: [number, number];
    calibration_slope: number;
    slope_ci95: [number, number];
    corr: number;
    mse: { model: number; constant_prior_season: number; team_last60: number };
    mse_n: number;
    by_decile: { decile: number; n: number; pred: number; obs: number; obs_se: number }[];
    pit: { n: number; pit_hist: number[]; coverage_80_nominal: number; coverage_80_model_implied: number };
  };
  e4a?: { exhaustive_seconds: number; n: number };
  e4b?: {
    n_team_games: number;
    uplift_opt_vs_actual: { mean: number; median: number; q90: number; max: number; per_162_games: number };
    spread_best_minus_worst_mean: number;
    opt_minus_random_mean: number;
    actual_percentile: { mean: number; median: number; share_above_90: number };
    uplift_histogram: number[];
    uplift_hist_edges: number[];
  };
  ranks?: { n_team_games: number; hist_edges: number[]; hist_counts: number[]; share_above: Record<string, number>; mean: number; median: number };
  e4c?: { n_team_games: number; draws_per_game: number; mean_p_opt_better: number; share_interval_excludes_0: number; mean_interval_width: number; mean_p_same_optimum: number };
}
