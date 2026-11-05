# Experimental protocol (fixed before final experiments)

- Written: 2026-11-01, before any test-period (2025–2026) metric was computed.
- Hyperparameters may be tuned on **2024 only**. Seasons **2025 and 2026 are test data**.
  The 2026 World Series Game 5 belongs to the test period.

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

## Experiments

| ID | Question | Data | Metric |
|---|---|---|---|
| E1 | Is the transition kernel consistent with observed run scoring? | 2023–2026 | Model RE24 vs empirical RE24; bookkeeping violations |
| E2 | Which PA model predicts held-out PAs best? | tune 2024; test 2025, 2026 | log-loss, Brier, per-class calibration; game-cluster bootstrap 95% CI of differences |
| E3 | Are game-level run predictions calibrated? | 2025–2026 team-games with reliable lineups | bias and calibration slope of observed `R_8` on predicted `E[R_8]`; comparison with constant and team-history baselines; distributional calibration (PIT) on a random subset |
| E4a | Do search methods find the optimum? | 200 random 2026 team-games | optimality gap vs exhaustive, evaluations, runtime |
| E4b | How far are actual orders from the model optimum? | all 2025–2026 team-games | `Δ`, percentile of actual order among 9! |
| E4c | Is the recommendation robust to parameter uncertainty? | random subset + reference game | posterior draws of multipliers: distribution of `Δ`, P(Δ>0), stability of the optimal order |
| E4d | Does a noisy (Monte Carlo) search overstate its pick? | 30 instances | GA with 4,000-simulation fitness vs exact optimum (gap, winner's-curse bias) |
| E5 | Reference game | 2026 WS G5, both teams | everything above for two lineups |

## Candidate PA models (E2)

- M0: league distribution by handedness matchup.
- M1: M0 × batter multiplier (empirical Bayes).
- M2: M1 × pitcher multiplier (log5 / odds-ratio combination) — tuned.
- M3: gradient-boosted multinomial model (LightGBM) on the M2 inputs (log multipliers,
  league probabilities, handedness, sample sizes), trained on rolling 2023–2024 snapshots.

Selection rule: the simplest model whose test log-loss is not significantly worse
(95% bootstrap CI of the difference includes 0 or favours it) than the best.

## Uncertainty

- PA-level metric differences: bootstrap over games (clusters), 2,000 resamples.
- Search noise: none for exact methods; Monte Carlo SE reported for MC-based methods.
- Parameter uncertainty: independent Gamma posterior draws of player multipliers
  (Section 3.4 of the paper); kernel uncertainty assessed by era sensitivity.

## Reporting

All negative or null results are reported. No test-period result is used to change
model choices; if a defect is found during testing, the fix and its effect are documented
and the affected experiments are re-run in full.

## Amendment 1 (2026-11-02)

The first full tuning run on 2024 selected the lowest values of both prior-strength scales
(batter 0.5, pitcher 0.75). Because a boundary optimum may lie outside the grid, the grid was
extended downward (batter 0.125–2, pitcher 0.1875–3, half-life 365–1095 days) and tuning was
re-run, still on 2024 only. The interrupted run's test-season outputs were not inspected.

Disclosure: before this, pipeline smoke tests (`--quick`) had computed E2 metrics on two
four-week test windows (June 2025 and June 2026) with a 3-configuration grid, and E3/E4
quantities on 120 and 20 test team-games, to debug the code. The grid extension was motivated
solely by the 2024 boundary result; no model structure was changed after those smoke tests. `outputs/e2_tuning.json` records whether the
final selection lies on the grid boundary.

## Amendment 2 (2026-11-02)

An independent review noted that the selected half-life lay on the lower edge of the final grid and
that the first grid's output (which contained 180 days) had been overwritten. The half-life grid
was extended to {180, 270, 365, 730, 1095} days and tuning was re-run on 2024 only. All tuning
outputs are now kept in `outputs/e2_tuning.json`, including a per-parameter boundary flag that the
paper reports verbatim.
