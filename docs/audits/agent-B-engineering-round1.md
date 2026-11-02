# Agent B — Software engineering and data-science audit, round 1

- Date: 2026-11-02 · Target: commit `af9a16a` (clean tree)
- Auditor: independent general-purpose agent with the `auditor-engineering-datascience` definition
  inlined; read-only (tree clean afterwards). Interrupted once by an API rate limit and resumed.
- Verified sound (by the auditor, with code): eq. 3.1–3.2 implementation and Gamma sampling; bullpen
  pseudo-pitcher; starter curves; Dirichlet-smoothed kernel; run accounting (event mapping,
  truncated PAs, no negative or >4 runs, monotone outs, 78,104/78,105 half-innings consistent);
  exact evaluator tests, truncation bound, TS parity (4e-15); leakage (all Snapshot fields and
  `kernel_for` bit-identical after tampering with data ≥ d on real data); tuning on 2024 only;
  M3 trained before test seasons; legacy model out of sample; fair E2 comparisons; E3 intervals
  robust to game-clustered bootstrap; randomized PIT; E4b/E4c computations.

| ID | Severity | Location | Finding | Blocks release? | Confidence |
|---|---|---|---|---|---|
| B-1 | Medium | `run.py` E4a; results E4a paragraph; `method.search_take` | "Monte Carlo GA worse than managers" compares 30 vs 200 instances; on the same 30 instances the GA gap (0.0223) is *smaller* than the order used (0.0240) | Yes (claim must be corrected) | High (reproduced) |
| B-2 | Medium | `Simulator.tsx`, `snapshot.py` (`draws_x[:100]`, 4-decimal rounding) | Simulator interval uses 100 of 400 draws; for MIL top − used it gives [+0.0016, +0.0214] (excludes 0) vs [−0.0024, +0.0213] on the page/paper | Recommended | High |
| B-3 | Low | `model/kernel.py`, `Hyper.window_days`, paper §3.2 | Monthly kernel refit and 3-year PA window not documented (paper says window ends at d) | No | High |
| B-4 | Low | `e2_tuning.json`, paper | H = 365 on the final grid's lower edge; "180 was worse" relies on an overwritten output | No | High |
| B-5 | Low | `plate_appearances.py` censoring | Walk-offs before the 9th (2021 seven-inning doubleheaders) and called games are not censored; ~12 E3 team-games have < 8 innings | No | High |
| B-6 | Low/Info | `kernel.py` fallback | Early-2023 fallback never fired (April 2023 kernel ≈ prior); no published experiment affected | No | High |
| B-7 | Low | `run.py:_pit`, paper E3 | Discrete "central 80 %" interval holds ~85 % of model mass; compare observed coverage with model-implied coverage | No | High |
| B-8 | Low | `games.py` vs `run.py`/`snapshot.py` | Heuristic run values: starter-regime only in E4b, regime-weighted in E4a and dashboard | No | High |
| B-9 | Low | tests | Leakage test covers only part of the snapshot; no tests for monthly kernel cutoff, starter curves, bullpen, `scaleStarterDepth`, browser rounding | No | High |
| B-10 | Info | `markov.ts:scaleStarterDepth` | Ad-hoc power transform; comment wrong; undocumented | No | High |
| B-11 | Info | `snapshot._throws`, `e2_legacy`, lineup reliability | Handedness lookup uses all dates; false comment and unused `seq` in E2b (effect 7e-6); E2b window start | No | High |

Resolutions: `docs/audits/findings-register.md`.
