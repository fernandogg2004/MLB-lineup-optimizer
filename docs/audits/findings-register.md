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
