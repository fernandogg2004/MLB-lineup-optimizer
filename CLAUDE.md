# Project instructions

Expected-runs batting-order optimizer: empirical-Bayes PA model → exact Markov evaluator →
exhaustive 9! search → static bilingual dashboard (web/) and LaTeX paper (research/).

## Layout
- `src/batting_order/` — the only Python package. `data/` ingestion and PA transitions,
  `model/` PA model + kernel, `engine/` exact evaluator (`markov.py`) and MC check,
  `optimize/` search baselines, `evaluate/` experiments, `snapshot.py` dashboard JSON,
  `batter_stats.py` official hitting lines and percentiles for Home, `cli.py`.
- `web/` — Vite + React + TS. `src/home/` is the general-audience Home page, `src/views/` the technical
  Statistics area (ADR 0003). `src/engine/markov.ts` must stay numerically identical to
  `engine/markov.py` (parity test `markov.test.ts`; regenerate vectors with
  `scripts/export_engine_vectors.py`).
- `research/` — `paper.tex`; numbers come only from `research/generated/*.tex`, produced by
  `scripts/make_paper_assets.py` from `outputs/*.json`. Never type results by hand.
- `orchestration/airflow/` — optional, paused, unscheduled. Core code must never import Airflow.
- `docs/decisions/` ADRs, `docs/methodology/` protocol, `docs/audits/` reviews.

## Invariants (tests enforce most of them)
- No future information: everything for a game on date d uses `game_date < d`.
- Bulk MLB data (`data/`) and models are never committed (ADR 0001).
- Model comparisons between orders are counterfactual model quantities; never present them
  as observed effects, and never present the actual score as an expected value.
- Home never shows a percentage with decimals or a "percent better" figure; pie slices total exactly 100.
- Game snapshots are read, never written, by the Home data step (`batter_stats.py`).
- Aggregations feeding the model use deterministic reductions (`np.bincount`), not parallel
  group-by sums, so snapshots are bit-reproducible.

## Commands
```bash
pip install -e ".[compare,figures,dev]"
pytest -m "not slow"; pytest -m slow; ruff check src tests scripts; mypy
cd web && npm ci && npx tsc -b && npx vitest run && npx playwright test
batting-order experiments && python scripts/make_paper_assets.py && (cd research && latexmk -pdf paper.tex)
```
