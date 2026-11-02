# Provenance of the published results

This note records which code produced each output in `outputs/` and how the results were verified
against a clean commit (audit findings A-4, D-18).

## Final state (commit `8ed6f63`)

| Output | Produced with | Notes |
|---|---|---|
| `e0_lineup_audit`, `e1_kernel`, `e2_tuning`, `e2_pa_models`, `e2c_decision_sensitivity`, `e5_reference_game`, all five game snapshots | current code (round-2 rerun, 2026-11-02 22:19–23:31) | final censoring rule, extended half-life grid, all posterior draws shipped |
| `e3_run_calibration`, `e4b_actual_vs_optimal` | summaries and PIT recomputed with current code; per-game rows (`work/games_*.parquet`) from `07d570c`-equivalent code | see deviation below |
| `e4a_search_methods` | method table from `07d570c`-equivalent code; `noisy_ga.actual_mean_gap_same_instances` added with current code | |
| `e4c_parameter_uncertainty` | `07d570c`-equivalent code | |
| `e2b_legacy_comparison` | `51cbe64`-equivalent code (unchanged inputs) | |

"`07d570c`-equivalent": the scientific modules at the time differed from `07d570c` only by
refactoring (verified: bit-exact reproduction of 25 sampled team-games at `07d570c`).

## What changed afterwards, and its measured effect

After `07d570c` the data pipeline censors every end-of-game transition that did not end in three
outs (finding B-5; previously only walk-offs from the 9th inning on). This changes 15 of about
560,000 transitions in the 2023–2026 kernel window. `scripts/check_provenance.py` at `8ed6f63`
recomputes 25 random team-games of the E3/E4b table and the reference game with the current code:

- reference game E[R] (order used and top order): deviation **0.0** (regenerated with current code);
- 25 sampled team-games (5 quantities each): maximum deviation **3.5 × 10⁻⁴** runs, below the
  tolerance of 5 × 10⁻⁴ (half the last digit reported in the paper) and two orders of magnitude
  below every difference the paper interprets.

The expensive experiments (E3 per-game rows, E4a method table, E4c; about six hours of compute)
were therefore not re-run. The paper cites `8ed6f63`.

## Environment

Python 3.11.9 (Windows 11), numpy 2.4.6, polars 1.44.2, numba 0.68.1, lightgbm 4.7.0,
scikit-learn 1.9.1. A lock file is not provided (finding A-8, deferred); these versions are the
ones used for every published number.
