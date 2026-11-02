# Findings register

Dispositions: **Fixed** (accepted and corrected, with verification), **Limitation** (accepted,
documented), **Rejected** (with evidence), **Deferred** (with justification and residual risk).
Reports: `agent-A-architecture-round1.md`, `agent-B-engineering-round1.md`,
`agent-C-ux-round1.md`, `agent-D-mathematics-round1.md`.

## Agent A — architecture (round 1)

| ID | Sev. | Disposition | Resolution / evidence |
|---|---|---|---|
| A-1 | High | Fixed | `config.project_root()` resolves `$BATTING_ORDER_ROOT` or the CWD (never the package path); CLI and experiments use it; workflow sets `BATTING_ORDER_ROOT`. Tests `test_cli.py::test_project_root_*`. |
| A-2 | High | Fixed | `config.tuned_hyper()` used by `build_game_snapshot` (default) and experiments; snapshots record `hyper_source`; CLI refuses to overwrite the reference game without `--force`. Tests `test_tuned_hyper_reads_e2_output`, `test_snapshot_refuses_to_overwrite_reference`. |
| A-3 | Med | Fixed | Literal TAB replaced by raw `\textbf{??}`; `make_paper_assets.py --release` fails on any missing macro, `unknown` or `-dirty` provenance; CI `paper` job greps `numbers.tex`. |
| A-4 | Med | Fixed | `git describe --always --dirty`; final outputs regenerated/stamped from a committed tree (see provenance note in `docs/audits/provenance.md`). |
| A-5 | Med | Fixed | Checksums published in `data_manifest/statcast_YYYY.json`; `batting-order verify` compares local files (reports, never overwrites); test `test_verify_detects_changed_missing_and_extra_files`; docs corrected. |
| A-6 | Med | Fixed | Inputs via `env:` with regex validation; tests (Python + web) run inside the job before the PR; repository setting documented in the workflow and `docs/operations.md`. |
| A-7 | Med | Fixed | `origin/main` (`96a16e1`, PR #1: English README audit of the original system) fetched and merged into `rebuild/v2` (merge `a4a7042`); branch to be pushed and CI run before merging to `main`. |
| A-8 | Low | Fixed | Removed unused `pyarrow`, `ingest` extra (`pybaseball`, `pandas`) and `pandas` from `compare`; CI matrix 3.11 + 3.13. A lock file is **Deferred**: package versions used for the published outputs are listed in `docs/audits/provenance.md`. |
| A-9 | Low | Fixed | README states Node ≥ 22.12, `engines` in `web/package.json`, subshell `cd`, placeholders filled at release. |
| A-10 | Low | Fixed | E2b prerequisites documented in `docs/operations.md` ("Reproducing the legacy comparison"). |
| A-11 | Low | Fixed | Removed `_label`, redundant sort, identity map, `TeamResult`, `GameRow`, `class_names`, `exhaustive_search`, unused marker; fixed docstring; `kernel_for` moved to `model/kernel.py` (no `snapshot → evaluate` import). |
| A-12 | Low | Fixed (partly) | Root `.dockerignore` added. Docker socket permissions are documented as an operator concern; the DAG remains untested on Docker (Docker unavailable): **Limitation**, stated in `orchestration/airflow/README.md`. |
| A-13 | Low | Fixed | `make_paper_assets.py` copies `research/paper.pdf` to `web/public/paper.pdf` (single source); CI checks generated macros. |
| A-14 | Low | Fixed | `tests/test_cli.py` (paths, index, reference guard, tuned hyperparameters). |
| A-15 | Info | Fixed / user action | `.env*` added to `web/.vercelignore`. The legacy root `.env` (old system's AWS/LLM/Slack/Postgres keys) is untracked and unread; **rotating those keys is recommended to the owner**. |
| A-16 | Info | Fixed | `docs/operations.md` states the CLI uploads the working directory and adds a clean-tree guard. |
| A-17 | Info | No change | Consistent with ADR 0001. |

## Agent C — UX (round 1)

| ID | Sev. | Disposition | Resolution / evidence |
|---|---|---|---|
| C-1 | High | Fixed | Renamed to "Model's top order"; stability callout in the lineup card with share of re-estimates and leadoff stability (from `slot_player_freq`); `pct()` prints "<1%" instead of "0%". |
| C-2 | High | Fixed | Every edit (move, lock, slider, reset, load) cancels the worker and bumps the request id; Cancel button while searching. e2e test "editing during a search cancels it…". |
| C-3 | Med | Fixed | Arrows jump to the next unlocked slot; `aria-disabled` with explanatory title when none; drops onto locked rows are refused with an announcement. Unit test `nextFreeSlot`; e2e "arrow buttons skip locked slots…". |
| C-4 | Med | Fixed | `aria-disabled` keeps focusability; focus restored to the moved row after re-render. e2e asserts focus remains in the row. |
| C-5 | Med | Fixed | Localised dnd-kit `screenReaderInstructions` and announcements with player names and slots. |
| C-6 | Med | Fixed | Slider/reset cancel and clear search results; the ambiguous "vs optimal (historical workload)" comparison was removed (the simulator now reports the difference to the order used, with its paired interval). |
| C-7 | Med | Fixed | Header not sticky below 640 px; `scroll-padding-top` when sticky. |
| C-8 | Med | Fixed | Text accent `#1c5cab` (6.5:1); dark primary button uses dark text on light accent (9.3:1). |
| C-9 | Med | Fixed | Bar fill `#3987e5` (3.5:1 light, 4.8:1 dark). |
| C-10 | Med | Fixed | Charts measure their container (ResizeObserver) and draw at true pixel size; fewer ticks on narrow screens. |
| C-11 | Med | Fixed | On-chart note: range of all orders vs one game's spread, and that the axis is zoomed. |
| C-12 | Med | Fixed | The chart now plots each hitter's expected PAs in the used vs top order (an earlier patch had silently not applied — the auditor caught it). |
| C-13 | Med | Fixed | Simulator interval is the paired difference (your order − order used) over the same draws, with the draw count stated. |
| C-14 | Med | Fixed | Controls wrap to a second line below 480 px; lock text hidden (accessible name retained). |
| C-15 | Med | Fixed | Localised series names and handedness, consistent grouping (`useGrouping: "always"`), all percentages via `pct()`, localised dates, signed bias. |
| C-16 | Med | Fixed | Data-driven verdict first ("Nearly. Both orders were in the top x %…", or a neutral alternative if not), then per-game and per-season figures. |
| C-17 | Med | Fixed | Parameter-uncertainty card (e4c), sub-headers for log-loss/Δ columns, one-line takeaways per card. |
| C-18 | Low | Fixed | Team switch is a button group with `aria-pressed` (no partial tab pattern). |
| C-19 | Low | Fixed | Card titles are h2, sub-blocks h3; method page sections are h2 siblings. |
| C-20 | Low | Fixed | Lock button `aria-label` "Lock {name} in slot {n}" / "Unlock …", emoji hidden; note that Reset/Load clear locks. |
| C-21 | Low | Fixed | Link buttons padded to ≥24 px; scrollable tables are focusable regions with labels. |
| C-22 | Low | Fixed | Scoreboard `role="group"`; charts named by summary sentences; PairedBars values carry series names for screen readers. |
| C-23 | Low | Fixed | Sample sizes stated on the search-method and actual-vs-optimal cards. |
| C-24 | Info | Fixed | `?lang=` kept in sync via `history.replaceState`; ES link says the PDF is in English; dead `sim.infeasible` path removed; game picker appears once World Series snapshots are added. |

## Agent B — engineering and data science (round 1)

| ID | Sev. | Disposition | Resolution / evidence |
|---|---|---|---|
| B-1 | Med | Fixed | `e4a_matched` computes the order-used gap on the 30 GA instances (`noisy_ga.actual_mean_gap_same_instances`); paper and website text corrected ("about as far from the optimum as the managers' orders on the same games"). |
| B-2 | Med | Fixed | Snapshots ship all posterior draws at 6 decimals; `drawFlat` renormalises; vitest `snapshot.test.ts` asserts the browser's (top − used) quantiles match `diff_q05/q95` within 1e-3. |
| B-3 | Low | Fixed | Paper §3.2–3.3 document the monthly kernel refit and the 1,095-day PA window; test `test_kernel_window_ends_on_first_day_of_month`. |
| B-4 | Low | Fixed | Half-life grid {180, 270, 365, 730, 1095}; tuning re-run on 2024 only; boundary flags reported verbatim in the paper; protocol Amendment 2. |
| B-5 | Low | Fixed | End-of-game censoring now covers walk-offs in any inning, called/suspended and seven-inning games; tests `test_called_games_and_short_walkoffs_are_censored`; E3 excludes team-games with < 8 innings batted. Changes 15 of ~560k transitions in the 2023–2026 window; effect on stored results ≤ 3.5e-4 runs (`outputs/provenance_check.json`). |
| B-6 | Low | Fixed | Fallback uses the previous 365 days when the window spans < 180 days. |
| B-7 | Low | Fixed | E3 reports `coverage_80_model_implied`; paper compares observed coverage with it. |
| B-8 | Low | Limitation | Documented in the paper (E4a/dashboard use regime-averaged run values, E4b starter-only); aligning would require re-running E3/E4b (~3 h) for a 0.0003-run difference in a heuristic baseline. |
| B-9 | Low | Fixed | Leakage test extended to every snapshot field; kernel cutoff test; browser workload and snapshot tests. |
| B-10 | Info | Fixed | `scaleStarterDepth` comment corrected (per-inning power transform), unit tests (identity at 1, rows sum to 1, monotone). |
| B-11 | Info | Fixed | Starter handedness from pregame data only; E2b comment corrected (spread recorded; effect 7e-6 nats). |

## Agent D — mathematics (round 1)

| ID | Sev. | Disposition | Resolution / evidence |
|---|---|---|---|
| D-1 | High | Fixed | = B-1. |
| D-2 | High | Fixed | `data_quality` adds `non_conserved_uncensored`; Table 1 prints it (0–10 per season); text corrected in §3.1, E1 and §7. |
| D-3 | Med | Fixed | Abstract cites the measured time via macro; §5 states it was measured with a concurrent job. |
| D-4 | Med | Fixed | Conclusions say "on average" and give the value. |
| D-5 | Med | Fixed | §5.2 distinguishes the Monte Carlo bias (removed) from selection on plug-in estimates (remains; quantified by posterior regret). |
| D-6 | Med | Fixed | "likely, but not guaranteed, to understate" with the reasons on both sides. |
| D-7 | Low | Fixed | Conservation filter requires non-decreasing outs and non-negative runs; `Kernel` rejects out-decreasing support (A4); tests. |
| D-8 | Low | Fixed | Evaluator raises when a half-inning does not terminate within `MAX_STEPS`; RefTruncBound uses the measured truncated mass; test with q = 0.004. |
| D-9 | Low | Fixed | Lemma 2 proof rewritten (inequality, then LOB defined as the residual). |
| D-10 | Low | Fixed | Proposition 1 indexing, cyclic slot convention, Proposition 6 argument from any state; symbols renamed (φ for outcome probabilities, ℓ_h for the league distribution, s_c for pitcher prior strengths). |
| D-11 | Low | Fixed | O(9·9·81G). |
| D-12 | Low | Fixed | `cleveref` capitalised names for all environments. |
| D-13 | Low | Fixed | = B-3/B-6. |
| D-14 | Low | Fixed | Proportions near 0/1 printed with one decimal. |
| D-15 | Low | Fixed | "suggest", corrected state description, censoring direction discussed. |
| D-16 | Info | Fixed | Statement now about fixed sets and post-decision surprise. |
| D-17 | Low | Fixed | Text says "actual order plus nine random starts"; run-value difference documented (B-8). |
| D-18 | Info | Fixed | `docs/audits/provenance.md` and `outputs/provenance_check.json`. |
| D-19 | Low | Fixed | log5 credited to James (1981); unverified "ten runs" figure removed; `savant` cited. |
| D-20 | Info | Fixed | = B-4. |
| D-21 | Info | Fixed | Certificate margins Δ for the reference game reported (E5 `certificate`); rounding noted. |
| D-22 | Info | Fixed | Plug-in nature of V, the A3 simplification and the interpretation of w_k stated. |

## Codex

An independent Codex review of the math core was attempted (2026-11-02) but could not run: its
sandbox blocked every shell command, so it produced no evidence. It is not counted as a review.
