# Validation protocol

Hyperparameters are tuned on **2024 only**. Seasons **2025 and 2026 are test data**, and the
2026 World Series Game 5 belongs to the test period.

## Information cutoff

For a game played on date `d`, every model input (PA model, kernel, starter usage) uses
only plate appearances with `game_date < d`. Same-day earlier games are excluded
(conservative: start times are not modelled). Starting lineups and starting pitchers are
treated as known at the cutoff (they are announced before first pitch). Nothing derived
from the game itself (score, substitutions, bullpen usage) is used.

Statcast columns that encode the future (`*_days_until_next_game`, `post_*` except for
run accounting of *past* transitions) are never used as features.

## Estimands

- `E[R_9 | π]`: expected runs over nine offensive innings for batting order `π`, under the
  model (primary objective).
- `E[R_8]`: expected runs in innings 1–8 (used for validation against observed runs,
  because the home team does not always bat in the 9th).
- `Δ(π) = E[R_9 | π*] − E[R_9 | π_actual]`: model-based uplift. **A model quantity, not an
  observed causal effect.**

## Checks

| Question | Data | Metric | Output |
|---|---|---|---|
| Are inferred lineups correct? | 60 random reliable 2026 team-games | match with the official boxscore | `e0_lineup_audit.json` |
| Is the transition kernel consistent with observed run scoring? | 2023–2026 | model RE24 vs empirical RE24; bookkeeping violations | `e1_kernel.json` |
| How well does the PA model predict held-out PAs? | tune 2024; test 2025, 2026 | log-loss and per-class calibration, by stage of the model; game-cluster bootstrap 95% CI of differences | `e2_tuning.json`, `e2_pa_models.json` |
| Are game-level run predictions calibrated? | 2025–2026 team-games with reliable lineups | bias and calibration slope of observed `R_8` on predicted `E[R_8]`; MSE against the previous season's league mean and the team's last 60 games; distributional calibration (PIT) on a random subset | `e3_run_calibration.json` |
| How long does exhaustive search take? | 200 random 2026 team-games | runtime per game | `e4a_search_methods.json` |
| How far are actual orders from the model optimum? | all 2025–2026 team-games | `Δ`, percentile of the actual order among 9! | `e4b_actual_vs_optimal.json`, `e4b_rank_distribution.json` |
| Is the recommendation robust to parameter uncertainty? | 80 random 2026 team-games, 40 draws each | posterior draws of multipliers: distribution of `Δ`, P(Δ>0), stability of the optimal order | `e4c_parameter_uncertainty.json` |
| What does the model say about the reference game? | 2026 World Series Game 5, both teams, 400 draws | all of the above for two lineups | `e5_reference_game.json` |

Outputs are written to `outputs/` by `batting-order experiments`.

## Plate-appearance model

The model is scored in three stages to show what each component contributes:

1. League distribution by handedness matchup.
2. Stage 1 × batter multiplier (empirical Bayes).
3. Stage 2 × pitcher multiplier (log5 / odds-ratio combination): the full model.

Tuning grid, on 2024 only: batter prior scale {0.125, 0.25, 0.5, 1, 2}, pitcher prior scale
{0.1875, 0.375, 0.75, 1.5, 3}, half-life {180, 270, 365, 730, 1095} days.
`outputs/e2_tuning.json` keeps the whole grid and a per-parameter boundary flag, which the paper
reports.

## Uncertainty

- PA-level metric differences: bootstrap over games (clusters), 2,000 resamples.
- The evaluator is exact, so search adds no sampling noise.
- Parameter uncertainty: independent Gamma posterior draws of player multipliers (see the
  plate-appearance model section of the paper). The kernel and the model form are not included.
